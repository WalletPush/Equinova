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

    console.log(`🔍 ML Database Insert Test - Date: ${targetDate}`);

    // Get races and process them (reusing the working logic)
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

    let totalProcessed = 0;
    let insertSuccess = 0;
    let insertFailed = 0;

    // Process first 3 races only for testing
    const testRaces = races.slice(0, 3);
    console.log(`🧪 Testing with first ${testRaces.length} races only`);

    for (const race of testRaces) {
      const raceId = race.race_id;
      console.log(`📊 Processing race: ${raceId}`);

      // Check if race has results
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

      // Get race entries and runners
      const [entriesResponse, runnersResponse] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/race_entries?select=*&race_id=eq.${raceId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }),
        fetch(`${supabaseUrl}/rest/v1/race_runners?select=*&race_id=eq.${raceId}`, {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        })
      ]);

      if (!entriesResponse.ok || !runnersResponse.ok) {
        console.warn(`⚠️ Failed to get data for ${raceId}`);
        continue;
      }

      const [raceEntries, raceRunners] = await Promise.all([
        entriesResponse.json(),
        runnersResponse.json()
      ]);

      console.log(`  📋 Found ${raceEntries.length} entries, ${raceRunners.length} runners`);

      // Process ML models
      const models = [
        { name: 'mlp', probaField: 'mlp_proba' },
        { name: 'rf', probaField: 'rf_proba' },
        { name: 'xgboost', probaField: 'xgboost_proba' },
        { name: 'benter', probaField: 'benter_proba' },
        { name: 'ensemble', probaField: 'ensemble_proba' }
      ];

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
        const predictionCorrect = isWinner;

        // Prepare ML performance data
        const mlPerformanceData = {
          race_id: raceId,
          horse_id: topHorse.horse_id,
          horse_name: topHorse.horse_name,
          model_name: model.name,
          predicted_probability: topProbability,
          actual_position: pos,
          is_winner: isWinner,
          is_top3: isTop3,
          prediction_correct: predictionCorrect,
          created_at: new Date().toISOString()
        };

        console.log(`    🔄 Inserting ${model.name}: ${topHorse.horse_name} (pos: ${pos}, winner: ${isWinner})`);

        // Insert into ml_model_race_results (UPSERT)
        try {
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

          if (mlPerformanceResponse.ok) {
            console.log(`    ✅ Successfully inserted ${model.name} for ${raceId}`);
            insertSuccess++;
          } else {
            const errorText = await mlPerformanceResponse.text();
            console.error(`    ❌ Failed to insert ${model.name} for ${raceId}: ${mlPerformanceResponse.status} - ${errorText}`);
            insertFailed++;
          }
        } catch (insertError) {
          console.error(`    💥 Insert error for ${model.name} in ${raceId}:`, insertError.message);
          insertFailed++;
        }

        totalProcessed++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'ML Database Insert Test Completed',
      target_date: targetDate,
      test_races: testRaces.length,
      total_insert_attempts: totalProcessed,
      successful_inserts: insertSuccess,
      failed_inserts: insertFailed,
      insert_success_rate: totalProcessed > 0 ? Math.round((insertSuccess / totalProcessed) * 100) : 0,
      next_step: insertFailed === 0 ? 'All inserts successful - error is in incremental function call' : 'Database insert issues found'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ML insert test error:', error);
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
