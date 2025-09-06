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

    // Get request parameters
    let targetDate = null;
    let cleanupType = 'analyze';
    try {
      const requestBody = await req.json();
      targetDate = requestBody?.target_date;
      cleanupType = requestBody?.cleanup_type || 'analyze'; // 'analyze', 'delete', 'rebuild'
    } catch {
      // No JSON body provided
    }

    console.log(`🔧 ML Results Cleanup - Type: ${cleanupType}, Date: ${targetDate || 'all'}`);

    if (cleanupType === 'analyze') {
      // ANALYZE: Show what's wrong with the data
      console.log('📊 Analyzing ML results data...');

      // Get races for September 5th
      const racesResponse = await fetch(
        `${supabaseUrl}/rest/v1/races?select=race_id,date,course_name&date=eq.2025-09-05&order=race_id`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      const races = await racesResponse.json();
      console.log(`Found ${races.length} races for September 5th`);

      // Get ML results claiming to be from September 5th
      const mlResultsResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_race_results?select=race_id,model_name,horse_name,created_at&created_at=gte.2025-09-05&created_at=lt.2025-09-06&order=race_id,model_name`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      const mlResults = await mlResultsResponse.json();
      console.log(`Found ${mlResults.length} ML results with September 5th timestamp`);

      // Check which race_ids in ML results actually belong to September 5th
      const validRaceIds = new Set(races.map(r => r.race_id));
      const validMLResults = mlResults.filter(ml => validRaceIds.has(ml.race_id));
      const invalidMLResults = mlResults.filter(ml => !validRaceIds.has(ml.race_id));

      // Group valid results by model
      const validByModel = {};
      validMLResults.forEach(result => {
        if (!validByModel[result.model_name]) {
          validByModel[result.model_name] = [];
        }
        validByModel[result.model_name].push(result);
      });

      // Group invalid results by race_id to see what dates they're from
      const invalidByRace = {};
      invalidMLResults.forEach(result => {
        if (!invalidByRace[result.race_id]) {
          invalidByRace[result.race_id] = [];
        }
        invalidByRace[result.race_id].push(result);
      });

      return new Response(JSON.stringify({
        success: true,
        analysis_type: 'September 5th Data Corruption Analysis',
        summary: {
          expected_races: races.length,
          expected_ml_results: races.length * 5,
          actual_ml_results_with_sept5_timestamp: mlResults.length,
          valid_ml_results_for_sept5_races: validMLResults.length,
          invalid_ml_results_wrong_date: invalidMLResults.length,
          corruption_percentage: Math.round((invalidMLResults.length / mlResults.length) * 100)
        },
        valid_results_by_model: Object.fromEntries(
          Object.entries(validByModel).map(([model, results]) => [model, results.length])
        ),
        september_5th_races: races.map(r => ({
          race_id: r.race_id,
          course: r.course_name,
          ml_results_count: validMLResults.filter(ml => ml.race_id === r.race_id).length
        })),
        data_corruption_details: {
          total_invalid_results: invalidMLResults.length,
          invalid_race_ids_sample: Object.keys(invalidByRace).slice(0, 10),
          invalid_race_count: Object.keys(invalidByRace).length
        },
        recommended_action: invalidMLResults.length > 0 ? 
          `DELETE ${invalidMLResults.length} invalid ML results that don't belong to September 5th races` :
          'Data appears clean for September 5th'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else if (cleanupType === 'delete' && targetDate) {
      // DELETE: Remove corrupted data for specific date
      console.log(`🗑️ Deleting corrupted ML results for ${targetDate}...`);

      // First get valid races for the target date
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
      const validRaceIds = races.map(r => r.race_id);

      console.log(`Found ${races.length} valid races for ${targetDate}`);

      if (validRaceIds.length === 0) {
        throw new Error(`No races found for date ${targetDate}`);
      }

      // Delete ALL ML results for this date (both valid and invalid)
      const deleteResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_race_results?created_at=gte.${targetDate}&created_at=lt.${targetDate}T23:59:59Z`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        throw new Error(`Failed to delete ML results: ${errorText}`);
      }

      // Also delete performance records for this date
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

      return new Response(JSON.stringify({
        success: true,
        action: 'DELETE_COMPLETED',
        target_date: targetDate,
        valid_races_for_date: races.length,
        message: `Deleted all ML results and performance data for ${targetDate}. Ready for clean repopulation.`,
        next_step: `Run populate-ml-performance-data with target_date: "${targetDate}" to rebuild clean data`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid cleanup_type. Use "analyze", "delete", or "rebuild"',
        available_options: {
          analyze: 'Show data corruption analysis',
          delete: 'Delete corrupted data for specific date (requires target_date)',
          rebuild: 'Delete and repopulate (requires target_date)'
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Cleanup error:', error);
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
