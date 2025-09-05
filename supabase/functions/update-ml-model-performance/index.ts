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

    console.log('Starting ML Model Performance Update...');

    // Step 1: Get the latest race results from ml_model_race_results
    // We'll process races that were added recently (last 10 minutes to catch new entries)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const recentResultsResponse = await fetch(
      `${supabaseUrl}/rest/v1/ml_model_race_results?select=*&created_at=gte.${tenMinutesAgo}&order=created_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      }
    );

    if (!recentResultsResponse.ok) {
      throw new Error(`Failed to fetch recent ML results: ${recentResultsResponse.status}`);
    }

    const recentResults = await recentResultsResponse.json();
    console.log(`Found ${recentResults.length} recent ML results`);

    if (recentResults.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No recent ML results to process',
        records_processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Group results by analysis_date (extracted from created_at)
    const resultsByDate = new Map();
    
    for (const result of recentResults) {
      const analysisDate = result.created_at.split('T')[0]; // Extract YYYY-MM-DD
      
      if (!resultsByDate.has(analysisDate)) {
        resultsByDate.set(analysisDate, []);
      }
      resultsByDate.get(analysisDate).push(result);
    }

    console.log(`Processing ${resultsByDate.size} analysis dates`);

    let totalProcessed = 0;

    // Step 3: Process each analysis date
    for (const [analysisDate, results] of resultsByDate) {
      console.log(`Processing analysis date: ${analysisDate} (${results.length} results)`);

      // Group results by model
      const resultsByModel = new Map();
      for (const result of results) {
        if (!resultsByModel.has(result.model_name)) {
          resultsByModel.set(result.model_name, []);
        }
        resultsByModel.get(result.model_name).push(result);
      }

      // Step 4: Process each model for this date
      for (const [modelName, modelResults] of resultsByModel) {
        console.log(`Processing ${modelName} for ${analysisDate} (${modelResults.length} results)`);

        // Calculate aggregated stats for this model on this date
        const totalPredictions = modelResults.length;
        const correctWinnerPredictions = modelResults.filter(r => r.is_winner).length;
        const correctTop3Predictions = modelResults.filter(r => r.is_top3).length;
        const correctPredictions = modelResults.filter(r => r.prediction_correct).length;
        
        const winnerAccuracy = totalPredictions > 0 ? (correctWinnerPredictions / totalPredictions) * 100 : 0;
        const top3Accuracy = totalPredictions > 0 ? (correctTop3Predictions / totalPredictions) * 100 : 0;
        
        const avgConfidence = totalPredictions > 0 ? 
          modelResults.reduce((sum, r) => sum + r.predicted_probability, 0) / totalPredictions : 0;
        
        const avgConfidenceWhenCorrect = correctWinnerPredictions > 0 ?
          modelResults.filter(r => r.is_winner).reduce((sum, r) => sum + r.predicted_probability, 0) / correctWinnerPredictions : 0;
        
        const avgConfidenceWhenIncorrect = (totalPredictions - correctWinnerPredictions) > 0 ?
          modelResults.filter(r => !r.is_winner).reduce((sum, r) => sum + r.predicted_probability, 0) / (totalPredictions - correctWinnerPredictions) : 0;

        // Prepare data for ml_model_performance table
        const performanceData = {
          model_name: modelName,
          analysis_date: analysisDate,
          total_predictions: totalPredictions,
          correct_winner_predictions: correctWinnerPredictions,
          correct_top3_predictions: correctTop3Predictions,
          winner_accuracy_percentage: Math.round(winnerAccuracy * 100) / 100,
          top3_accuracy_percentage: Math.round(top3Accuracy * 100) / 100,
          average_confidence_percentage: Math.round(avgConfidence * 10000) / 100,
          average_confidence_when_correct: Math.round(avgConfidenceWhenCorrect * 10000) / 100,
          average_confidence_when_incorrect: Math.round(avgConfidenceWhenIncorrect * 10000) / 100,
          ensemble_winner_predictions_correct: correctPredictions,
          ensemble_winner_predictions_incorrect: totalPredictions - correctPredictions,
          updated_at: new Date().toISOString()
        };

        // UPSERT into ml_model_performance table
        const performanceResponse = await fetch(
          `${supabaseUrl}/rest/v1/ml_model_performance?on_conflict=model_name,analysis_date`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(performanceData)
          }
        );

        if (!performanceResponse.ok) {
          const errorText = await performanceResponse.text();
          console.error(`Failed to upsert ML performance for ${modelName} on ${analysisDate}:`, errorText);
        } else {
          console.log(`✅ Updated ML performance for ${modelName} on ${analysisDate}: ${totalPredictions} predictions, ${correctWinnerPredictions} winners`);
          totalProcessed++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'ML Model Performance update completed successfully',
      analysis_dates_processed: resultsByDate.size,
      model_updates: totalProcessed,
      recent_results_processed: recentResults.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ML Model Performance Update Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'ML_MODEL_PERFORMANCE_ERROR',
        message: error?.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
