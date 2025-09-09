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

    // Check if specific race_id or date was provided in request body
    let targetRaceId = null;
    let targetDate = null;
    let triggeredBy = 'manual';
    try {
      const requestBody = await req.json();
      targetRaceId = requestBody?.race_id;
      targetDate = requestBody?.target_date;
      triggeredBy = requestBody?.triggered_by || 'manual';
    } catch {
      // No JSON body provided, process all races
    }

    if (targetRaceId) {
      console.log(`Starting ML Performance Data Population for specific race: ${targetRaceId} (triggered by: ${triggeredBy})`);
    } else if (targetDate) {
      console.log(`Starting ML Performance Data Population for specific date: ${targetDate} (triggered by: ${triggeredBy})`);
    } else {
      console.log('Starting ML Performance Data Population for all races since September 1st...');
    }

    // Step 1: Get races to process
    let races;
    try {
      console.log('🔍 Step 1: Fetching races...');
      let racesUrl;
      if (targetRaceId) {
        // Process only the specific race
        racesUrl = `${supabaseUrl}/rest/v1/races?select=race_id,date&race_id=eq.${targetRaceId}`;
      } else if (targetDate) {
        // Process only races for the specific date
        racesUrl = `${supabaseUrl}/rest/v1/races?select=race_id,date&date=eq.${targetDate}`;
      } else {
        // Process all races since September 1st (fallback)
        racesUrl = `${supabaseUrl}/rest/v1/races?select=race_id,date&date=gte.2025-09-01`;
      }

      console.log('📡 Fetching races from:', racesUrl);
      const racesResponse = await fetch(racesUrl, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      });

      if (!racesResponse.ok) {
        const errorText = await racesResponse.text();
        throw new Error(`Failed to fetch races: ${racesResponse.status} - ${errorText}`);
      }

      races = await racesResponse.json();
      console.log('✅ Step 1 Complete: Found', races.length, 'races');
    } catch (step1Error) {
      console.error('❌ Step 1 Failed:', step1Error);
      throw new Error(`Step 1 (Fetch Races) failed: ${step1Error.message}`);
    }
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

    // If processing many races, use smart batching to avoid 500 errors
    if (races.length > 10) {
      console.log(`⚠️ Large batch detected (${races.length} races). Using smart batching...`);
      
      return new Response(JSON.stringify({
        success: true,
        message: `Large batch detected - please process in smaller chunks to avoid timeouts`,
        target_date: targetDate,
        total_races_found: races.length,
        recommendation: "Process races in batches of 10 or fewer for optimal performance",
        race_ids: raceIds.slice(0, 10), // Show first 10 as example
        triggered_by: triggeredBy
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Processing ${races.length} races (optimal batch size)...`);

    // Step 2: Get race results for these races
    let raceResults;
    try {
      console.log('🔍 Step 2: Fetching race results...');
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
        const errorText = await raceResultsResponse.text();
        throw new Error(`Failed to fetch race results: ${raceResultsResponse.status} - ${errorText}`);
      }

      raceResults = await raceResultsResponse.json();
      console.log('✅ Step 2 Complete: Found', raceResults.length, 'race results');
    } catch (step2Error) {
      console.error('❌ Step 2 Failed:', step2Error);
      throw new Error(`Step 2 (Fetch Race Results) failed: ${step2Error.message}`);
    }
    console.log(`Found ${raceResults.length} race results`);

    // Step 3: Get race runners for these races
    let raceRunners;
    try {
      console.log('🔍 Step 3: Fetching race runners...');
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
        const errorText = await raceRunnersResponse.text();
        throw new Error(`Failed to fetch race runners: ${raceRunnersResponse.status} - ${errorText}`);
      }

      raceRunners = await raceRunnersResponse.json();
      console.log('✅ Step 3 Complete: Found', raceRunners.length, 'race runners');
    } catch (step3Error) {
      console.error('❌ Step 3 Failed:', step3Error);
      throw new Error(`Step 3 (Fetch Race Runners) failed: ${step3Error.message}`);
    }

    // Step 4: Get race entries (ML predictions) for these races
    let raceEntries;
    try {
      console.log('🔍 Step 4: Fetching race entries...');
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
        const errorText = await raceEntriesResponse.text();
        throw new Error(`Failed to fetch race entries: ${raceEntriesResponse.status} - ${errorText}`);
      }

      raceEntries = await raceEntriesResponse.json();
      console.log('✅ Step 4 Complete: Found', raceEntries.length, 'race entries');
    } catch (step4Error) {
      console.error('❌ Step 4 Failed:', step4Error);
      throw new Error(`Step 4 (Fetch Race Entries) failed: ${step4Error.message}`);
    }

    // Step 5: Process each race
    try {
      console.log('🔍 Step 5: Processing race data...');
      for (const raceResult of raceResults) {
        const raceId = raceResult.race_id;
        console.log(`📊 Processing race: ${raceId}`);

        try {
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

        // Prepare data for insertion (ONLY non-generated columns)
        const mlPerformanceData = {
          race_id: raceId,
          horse_id: topHorse.horse_id,
          horse_name: topHorse.horse_name,
          model_name: model.name,
          predicted_probability: topProbability,
          actual_position: pos
          // Note: is_winner, is_top3, and prediction_correct are ALL generated columns
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
        } catch (raceError) {
          console.error(`❌ Error processing race ${raceId}:`, raceError);
          // Continue with next race instead of failing completely
        }
      }
      console.log('✅ Step 5 Complete: Processed all races');
    } catch (step5Error) {
      console.error('❌ Step 5 Failed:', step5Error);
      throw new Error(`Step 5 (Process Races) failed: ${step5Error.message}`);
    }

    // Step 6: Call incremental function with bulletproof error handling
    let performanceTableUpdated = false;
    console.log('🔄 Step 6: Calling incremental function with safe error handling...');
    
    try {
      const incrementalResponse = await fetch(`${supabaseUrl}/functions/v1/update-ml-model-performance-incremental`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          triggered_by: 'populate-ml-performance-data',
          source_race_id: targetRaceId,
          target_date: targetDate
        })
      });
      
      if (incrementalResponse.ok) {
        try {
          const incrementalData = await incrementalResponse.json();
          performanceTableUpdated = true;
          console.log('✅ Step 6 Complete: Incremental function succeeded');
        } catch (parseError) {
          console.log('⚠️ Step 6: Incremental function returned non-JSON response, but completed');
          performanceTableUpdated = true; // Assume success if we got 200 status
        }
      } else {
        console.log(`⚠️ Step 6: Incremental function returned ${incrementalResponse.status}, continuing anyway`);
        // Don't set performanceTableUpdated = true, but don't fail either
      }
    } catch (networkError) {
      console.log('⚠️ Step 6: Network error calling incremental function, continuing anyway');
      // Don't fail the main function
    }
    
    console.log('🎉 All steps completed successfully!');

    return new Response(JSON.stringify({
      success: true,
      message: `ML Performance data population completed successfully (${triggeredBy})`,
      target_race_id: targetRaceId,
      target_date: targetDate,
      races_processed: raceResults.length,
      records_inserted: totalProcessed,
      performance_table_updated: performanceTableUpdated,
      triggered_by: triggeredBy,
      date_range: targetRaceId ? `Single race: ${targetRaceId}` : 
                  targetDate ? `Single date: ${targetDate}` : 
                  'September 1st onwards'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ ML Performance Data Population Error:', error);
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error stringified:', JSON.stringify(error, null, 2));
    
    // Create a comprehensive error response that covers all expected formats
    const errorResponse = {
      success: false,
      error: error?.message || error?.toString() || 'Unknown error occurred',
      details: {
        message: error?.message || 'Unknown error occurred',
        code: 'ML_PERFORMANCE_ERROR',
        timestamp: new Date().toISOString(),
        stack: error?.stack,
        type: typeof error
      }
    };
    
    console.error('❌ Sending error response:', JSON.stringify(errorResponse, null, 2));
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
