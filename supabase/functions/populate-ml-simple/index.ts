Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('=== SIMPLE ML PERFORMANCE POPULATION ===');
    
    // Get races for 2025-09-04
    const racesResponse = await fetch(
      `${supabaseUrl}/rest/v1/races?date=eq.2025-09-04&select=race_id`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!racesResponse.ok) {
      throw new Error(`Failed to fetch races: ${racesResponse.status}`);
    }

    const races = await racesResponse.json();
    console.log(`Found ${races.length} races for 2025-09-04`);
    
    if (races.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No races found', records_inserted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const raceIds = races.map(r => r.race_id);
    console.log(`Processing ${raceIds.length} races`);

    // Get all race entries for these races
    const entriesResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_entries?race_id=in.(${raceIds.join(',')})&select=race_id,horse_id,horse_name,mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!entriesResponse.ok) {
      throw new Error(`Failed to fetch entries: ${entriesResponse.status}`);
    }

    const entries = await entriesResponse.json();
    console.log(`Found ${entries.length} race entries`);

    // Get all race runners for these races
    const runnersResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_runners?race_id=in.(${raceIds.join(',')})&select=race_id,horse_id,horse,position`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!runnersResponse.ok) {
      throw new Error(`Failed to fetch runners: ${runnersResponse.status}`);
    }

    const runners = await runnersResponse.json();
    console.log(`Found ${runners.length} race runners`);

    let inserted = 0;
    const models = [
      { name: 'mlp', field: 'mlp_proba' },
      { name: 'rf', field: 'rf_proba' },
      { name: 'xgboost', field: 'xgboost_proba' },
      { name: 'benter', field: 'benter_proba' },
      { name: 'ensemble', field: 'ensemble_proba' }
    ];

    // Process each race
    for (const raceId of raceIds) {
      const raceEntries = entries.filter(e => e.race_id === raceId);
      const raceRunners = runners.filter(r => r.race_id === raceId);
      
      console.log(`\nRace ${raceId}: ${raceEntries.length} entries, ${raceRunners.length} runners`);

      // For each model, find top pick and insert record
      for (const model of models) {
        let topHorse = null;
        let topProb = 0;

        // Find horse with highest probability for this model
        for (const entry of raceEntries) {
          const prob = entry[model.field];
          if (prob && prob > topProb) {
            topProb = prob;
            topHorse = entry;
          }
        }

        if (!topHorse || topProb <= 0) {
          console.log(`  ${model.name}: No valid prediction`);
          continue;
        }

        // Find finishing position
        const runner = raceRunners.find(r => r.horse_id === topHorse.horse_id);
        if (!runner || !runner.position) {
          console.log(`  ${model.name}: No finishing position for ${topHorse.horse_name}`);
          continue;
        }

        // 🔧 FIX: Convert string position to number properly
        const pos = Number(runner.position);
        if (!Number.isFinite(pos) || pos < 1) {
          console.warn(`Invalid position for ${raceId}/${topHorse.horse_id}:`, runner.position);
          continue;
        }
        
        const isWinner = pos === 1;
        const isTop3 = pos <= 3;

        console.log('TYPE CHECK', {
          raw: runner.position,
          typeof: typeof runner.position,
          pos,
          isWinner: pos === 1
        });
        console.log(`  ${model.name}: ${topHorse.horse_name} - Position: ${pos}, Winner: ${isWinner}, Top3: ${isTop3}`);

        // Insert record with UPSERT to handle duplicates
        const record = {
          race_id: raceId,
          horse_id: topHorse.horse_id,
          horse_name: topHorse.horse_name,
          model_name: model.name,
          predicted_probability: topProb,
          actual_position: pos,
          is_winner: isWinner,
          is_top3: isTop3,
          prediction_correct: isWinner,
          created_at: new Date().toISOString()
        };

        const insertResponse = await fetch(
          `${supabaseUrl}/rest/v1/ml_model_race_results?on_conflict=race_id,horse_id,model_name`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(record)
          }
        );

        if (insertResponse.ok) {
          inserted++;
          console.log(`    ✅ Inserted ${model.name} record`);
        } else {
          const errorText = await insertResponse.text();
          console.log(`    ❌ Failed to insert ${model.name}: ${errorText}`);
        }
      }
    }

    console.log(`\n=== COMPLETED ===`);
    console.log(`Total records inserted: ${inserted}`);
    console.log(`Expected: ${races.length * 5} (${races.length} races × 5 models)`);

    return new Response(JSON.stringify({
      success: true,
      message: 'ML performance data populated',
      races_processed: races.length,
      records_inserted: inserted,
      expected_records: races.length * 5,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ERROR:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
