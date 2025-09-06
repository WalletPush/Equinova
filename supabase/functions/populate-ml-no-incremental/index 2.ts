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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    let targetDate = null;
    let triggeredBy = 'manual';
    try {
      const requestBody = await req.json();
      targetDate = requestBody?.target_date;
      triggeredBy = requestBody?.triggered_by || 'manual';
    } catch {
      // No JSON body provided
    }

    if (!targetDate) {
      throw new Error('target_date is required');
    }

    console.log(`🔍 ML Data Processing Test - Date: ${targetDate}`);

    // Step 1: Get races for the date
    const racesResponse = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date&date=eq.${targetDate}`,
      {
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
    console.log(`✅ Found ${races.length} races for ${targetDate}`);

    if (races.length === 0) {
      throw new Error(`No races found for ${targetDate}`);
    }

    // Step 2: Process each race to get ML data
    let totalProcessed = 0;
    const raceIds = races.map(r => r.race_id);

    for (const race of races) {
      const raceId = race.race_id;
      console.log(`📊 Processing race: ${raceId}`);

      // Get race results to check if this race has finished
      const raceResultsResponse = await fetch(
        `${supabaseUrl}/rest/v1/race_results?select=race_id&race_id=eq.${raceId}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      if (!raceResultsResponse.ok) {
        console.warn(`⚠️ Failed to check race results for ${raceId}: ${raceResultsResponse.status}`);
        continue;
      }

      const raceResults = await raceResultsResponse.json();
      if (raceResults.length === 0) {
        console.log(`⏭️ Skipping ${raceId} - no results yet`);
        continue;
      }

      // Get race entries (horses and ML predictions)
      const raceEntriesResponse = await fetch(
        `${supabaseUrl}/rest/v1/race_entries?select=*&race_id=eq.${raceId}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      if (!raceEntriesResponse.ok) {
        console.warn(`⚠️ Failed to get race entries for ${raceId}: ${raceEntriesResponse.status}`);
        continue;
      }

      const raceEntries = await raceEntriesResponse.json();
      console.log(`  📋 Found ${raceEntries.length} entries for ${raceId}`);

      if (raceEntries.length === 0) {
        console.log(`  ⏭️ Skipping ${raceId} - no entries found`);
        continue;
      }

      // Get race runners (finishing positions)
      const raceRunnersResponse = await fetch(
        `${supabaseUrl}/rest/v1/race_runners?select=*&race_id=eq.${raceId}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      if (!raceRunnersResponse.ok) {
        console.warn(`⚠️ Failed to get race runners for ${raceId}: ${raceRunnersResponse.status}`);
        continue;
      }

      const raceRunners = await raceRunnersResponse.json();
      console.log(`  🏃 Found ${raceRunners.length} runners for ${raceId}`);

      // Process ML models
      const models = [
        { name: 'mlp', probaField: 'mlp_proba' },
        { name: 'rf', probaField: 'rf_proba' },
        { name: 'xgboost', probaField: 'xgboost_proba' },
        { name: 'benter', probaField: 'benter_proba' },
        { name: 'ensemble', probaField: 'ensemble_proba' }
      ];

      let raceProcessed = 0;

      for (const model of models) {
        // Find top horse for this model
        let topHorse = null;
        let topProbability = 0;

        for (const entry of raceEntries) {
          const probability = Number(entry[model.probaField] ?? 0);
          if (probability > topProbability) {
            topProbability = probability;
            topHorse = entry;
          }
        }

        if (!topHorse) {
          console.log(`    ⚠️ No top horse found for ${model.name} in ${raceId}`);
          continue;
        }

        // Find actual finishing position
        const runner = raceRunners.find((r) => r.horse_id === topHorse.horse_id);
        if (!runner || runner.position == null) {
          console.log(`    ⚠️ No finishing position for ${topHorse.horse_name} (${model.name}) in ${raceId}`);
          continue;
        }

        const pos = Number(runner.position);
        if (!Number.isFinite(pos) || pos < 1) {
          console.log(`    ⚠️ Invalid position ${runner.position} for ${topHorse.horse_name} (${model.name}) in ${raceId}`);
          continue;
        }

        const isWinner = pos === 1;
        const isTop3 = pos <= 3;

        console.log(`    ✅ ${model.name}: ${topHorse.horse_name} finished ${pos} (${isWinner ? 'WINNER' : isTop3 ? 'TOP3' : 'OTHER'})`);

        // Here we would normally insert into ml_model_race_results
        // But for this test, we'll just count
        raceProcessed++;
        totalProcessed++;
      }

      console.log(`  📊 Processed ${raceProcessed} models for ${raceId}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'ML Data Processing Test Completed (no database inserts)',
      target_date: targetDate,
      races_found: races.length,
      total_ml_records_would_create: totalProcessed,
      expected_records: races.length * 5,
      processing_successful: totalProcessed > 0,
      next_step: 'Would insert ML results and call incremental function'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ML processing test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message || 'Unknown error occurred',
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
