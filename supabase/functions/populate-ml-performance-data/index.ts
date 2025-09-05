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

    console.log('Starting ML Performance Data Population...');

    // Step 1: Get all races that have results but no ML performance data yet
    const racesResponse = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date&date=gte.2025-09-01`,
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
    console.log(`Found ${races.length} races from September 1st onwards`);

    if (races.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No races found from September 1st onwards',
        records_processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const raceIds = races.map(r => r.race_id);
    let totalProcessed = 0;

    // Step 2: Get race results for these races
    const raceResultsResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_results?select=*&race_id=in.(${raceIds.join(',')})`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!raceResultsResponse.ok) {
      throw new Error(`Failed to fetch race results: ${raceResultsResponse.status}`);
    }

    const raceResults = await raceResultsResponse.json();
    console.log(`Found ${raceResults.length} race results`);

    // Step 3: Get race runners for these races
    const raceRunnersResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_runners?select=*&race_id=in.(${raceIds.join(',')})`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!raceRunnersResponse.ok) {
      throw new Error(`Failed to fetch race runners: ${raceRunnersResponse.status}`);
    }

    const raceRunners = await raceRunnersResponse.json();
    console.log(`Found ${raceRunners.length} race runners`);

    // Step 4: Get race entries (ML predictions) for these races
    const raceEntriesResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_entries?select=*&race_id=in.(${raceIds.join(',')})`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!raceEntriesResponse.ok) {
      throw new Error(`Failed to fetch race entries: ${raceEntriesResponse.status}`);
    }

    const raceEntries = await raceEntriesResponse.json();
    console.log(`Found ${raceEntries.length} race entries`);

    // Step 5: Process each race
    for (const raceResult of raceResults) {
      const raceId = raceResult.race_id;
      console.log(`Processing race: ${raceId}`);

      // Get runners for this race
      const runnersForRace = raceRunners.filter(r => r.race_id === raceId);
      
      // Get entries for this race
      const entriesForRace = raceEntries.filter(e => e.race_id === raceId);

      // Define ML models and their probability fields
      const models = [
        { name: 'mlp', probaField: 'mlp_proba' },
        { name: 'rf', probaField: 'rf_proba' },
        { name: 'xgboost', probaField: 'xgboost_proba' },
        { name: 'benter', probaField: 'benter_proba' },
        { name: 'ensemble', probaField: 'ensemble_proba' }
      ];

      // Process each model
      for (const model of models) {
        // Find the top prediction for this model
        let topHorse = null;
        let topProbability = 0;

        for (const entry of entriesForRace) {
          const proba = Number(entry[model.probaField] ?? 0);
          if (proba > topProbability) {
            topProbability = proba;
            topHorse = entry;
          }
        }

        if (!topHorse) {
          console.warn(`No top horse found for ${model.name} in race ${raceId}`);
          continue;
        }

        // Find the actual finishing position for this top horse
        const runner = runnersForRace.find(r => r.horse_id === topHorse.horse_id);
        if (!runner || runner.position == null) {
          console.warn(`No finishing position found for top ${model.name} horse ${topHorse.horse_id} in race ${raceId}`);
          continue;
        }

        // Normalize position to number
        const pos = Number(runner.position);
        if (!Number.isFinite(pos) || pos < 1) {
          console.warn(`Invalid position for ${raceId}/${topHorse.horse_id}:`, runner.position);
          continue;
        }

        totalProcessed++;

        // Prepare data for insertion
        const mlPerformanceData = {
          race_id: raceId,
          horse_id: topHorse.horse_id,
          horse_name: topHorse.horse_name,
          model_name: model.name,
          predicted_probability: topProbability,
          actual_position: pos,
          // Race details from race_results
          region: raceResult.region,
          off: raceResult.off,
          race_name: raceResult.race_name,
          class: raceResult.class,
          dist: raceResult.dist,
          going: raceResult.going,
          type: raceResult.type,
          // Horse details from race_runners
          sp: runner.sp,
          jockey: runner.jockey,
          trainer: runner.trainer,
          created_at: new Date().toISOString()
        };

        // Insert into ml_model_race_results (UPSERT to handle duplicates)
        const mlPerformanceResponse = await fetch(
          `${supabaseUrl}/rest/v1/ml_model_race_results?on_conflict=race_id,horse_id,model_name`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(mlPerformanceData)
          }
        );

        if (!mlPerformanceResponse.ok) {
          const errorText = await mlPerformanceResponse.text();
          console.error(`Failed to insert ML performance data for ${model.name} in race ${raceId}:`, errorText);
        } else {
          console.log(`✅ Inserted ML performance data for ${model.name} - Horse: ${topHorse.horse_name}, Position: ${pos}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'ML Performance data population completed successfully',
      races_processed: raceResults.length,
      records_inserted: totalProcessed,
      date_range: 'September 1st onwards'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ML Performance Data Population Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'ML_PERFORMANCE_ERROR',
        message: error?.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
