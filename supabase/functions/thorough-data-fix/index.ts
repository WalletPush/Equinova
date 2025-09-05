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

    let action = 'analyze';
    let targetDate = '2025-09-05';
    try {
      const requestBody = await req.json();
      action = requestBody?.action || 'analyze';
      targetDate = requestBody?.target_date || '2025-09-05';
    } catch {
      // No JSON body provided
    }

    console.log(`🔧 Thorough Data Fix - Action: ${action}, Date: ${targetDate}`);

    if (action === 'analyze') {
      // DEEP ANALYSIS: Find exactly what's wrong
      
      // 1. Get ACTUAL races for September 5th from races table
      const racesResponse = await fetch(
        `${supabaseUrl}/rest/v1/races?select=race_id,date,course_name,off_time&date=eq.${targetDate}&order=off_time`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      const actualRaces = await racesResponse.json();
      console.log(`Found ${actualRaces.length} ACTUAL races for ${targetDate}`);

      // 2. Get ALL ML results with Sept 5th timestamp
      const mlResultsResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_race_results?select=race_id,model_name,horse_name,created_at&created_at=gte.${targetDate}&created_at=lt.${targetDate}T23:59:59Z&order=race_id,model_name`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      const allMLResults = await mlResultsResponse.json();
      console.log(`Found ${allMLResults.length} ML results with ${targetDate} timestamp`);

      // 3. Check which race_ids in ML results are valid for Sept 5th
      const validRaceIds = new Set(actualRaces.map(r => r.race_id));
      const validMLResults = allMLResults.filter(ml => validRaceIds.has(ml.race_id));
      const invalidMLResults = allMLResults.filter(ml => !validRaceIds.has(ml.race_id));

      // 4. Analyze the invalid race IDs to see what dates they belong to
      let otherDateInfo = {};
      if (invalidMLResults.length > 0) {
        const uniqueInvalidRaceIds = [...new Set(invalidMLResults.map(ml => ml.race_id))];
        
        // Look up these race IDs in the races table to see their actual dates
        const invalidRacesLookup = await fetch(
          `${supabaseUrl}/rest/v1/races?select=race_id,date,course_name&race_id=in.(${uniqueInvalidRaceIds.join(',')})`,
          {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            }
          }
        );

        const invalidRacesData = await invalidRacesLookup.json();
        otherDateInfo = invalidRacesData.reduce((acc, race) => {
          acc[race.race_id] = { date: race.date, course: race.course_name };
          return acc;
        }, {});
      }

      // 5. Group valid ML results by model
      const validByModel = {};
      validMLResults.forEach(result => {
        if (!validByModel[result.model_name]) {
          validByModel[result.model_name] = new Set();
        }
        validByModel[result.model_name].add(result.race_id);
      });

      return new Response(JSON.stringify({
        success: true,
        action: 'DEEP_ANALYSIS',
        target_date: targetDate,
        summary: {
          actual_races_for_date: actualRaces.length,
          expected_ml_results: actualRaces.length * 5,
          actual_ml_results_found: allMLResults.length,
          valid_ml_results: validMLResults.length,
          invalid_ml_results: invalidMLResults.length,
          corruption_percentage: Math.round((invalidMLResults.length / allMLResults.length) * 100)
        },
        actual_races: actualRaces.map(r => ({
          race_id: r.race_id,
          course: r.course_name,
          time: r.off_time
        })),
        data_corruption: {
          invalid_results_count: invalidMLResults.length,
          invalid_race_samples: Object.entries(otherDateInfo).slice(0, 10).map(([raceId, info]) => ({
            race_id: raceId,
            actual_date: info.date,
            course: info.course
          })),
          dates_found_in_invalid_data: [...new Set(Object.values(otherDateInfo).map(info => info.date))]
        },
        valid_results_by_model: Object.fromEntries(
          Object.entries(validByModel).map(([model, raceSet]) => [model, raceSet.size])
        ),
        missing_coverage: {
          races_missing_ml_data: actualRaces.filter(race => 
            !validMLResults.some(ml => ml.race_id === race.race_id)
          ).map(r => ({ race_id: r.race_id, course: r.course_name, time: r.off_time }))
        },
        recommended_actions: [
          `DELETE all ${allMLResults.length} ML results with ${targetDate} timestamp`,
          `DELETE all performance records for ${targetDate}`,
          `REPOPULATE clean data for exactly ${actualRaces.length} races`,
          `Verify populate function only processes races from ${targetDate}`
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (action === 'nuclear_clean') {
      // NUCLEAR OPTION: Complete cleanup
      console.log(`🗑️ NUCLEAR CLEAN: Completely removing all ML data for ${targetDate}...`);

      // 1. Delete ALL ML results with this date timestamp
      const deleteMLResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_race_results?created_at=gte.${targetDate}&created_at=lt.${targetDate}T23:59:59Z`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      // 2. Delete ALL performance records for this date
      const deletePerformanceResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_performance?analysis_date=eq.${targetDate}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      // 3. Get count of actual races for verification
      const racesResponse = await fetch(
        `${supabaseUrl}/rest/v1/races?select=race_id&date=eq.${targetDate}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      const races = await racesResponse.json();

      return new Response(JSON.stringify({
        success: true,
        action: 'NUCLEAR_CLEAN_COMPLETED',
        target_date: targetDate,
        message: `Complete cleanup finished for ${targetDate}`,
        cleanup_results: {
          ml_results_deleted: deleteMLResponse.ok,
          performance_records_deleted: deletePerformanceResponse.ok,
          actual_races_remain: races.length,
          ready_for_repopulation: true
        },
        next_step: `Run populate-ml-performance-data to rebuild clean data for ${races.length} races`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({
        success: false,
        error: {
          message: 'Invalid action. Use "analyze" or "nuclear_clean"'
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Thorough data fix error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        message: error.message || 'Unknown error occurred'
      },
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
