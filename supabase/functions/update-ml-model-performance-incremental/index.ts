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

    // Check if triggered by another function
    let triggeredBy = 'manual';
    let sourceRaceId = null;
    let targetDate = null;
    let forceRecalculate = false;
    try {
      const requestBody = await req.json();
      triggeredBy = requestBody?.triggered_by || 'manual';
      sourceRaceId = requestBody?.source_race_id;
      targetDate = requestBody?.target_date;
      forceRecalculate = requestBody?.force_recalculate || false;
    } catch {
      // No JSON body provided, continue with manual processing
    }

    console.log(`Starting INCREMENTAL ML Model Performance Update... (triggered by: ${triggeredBy}${sourceRaceId ? `, race: ${sourceRaceId}` : ''}${targetDate ? `, date: ${targetDate}` : ''})`);

    // Step 1: Get valid races for the target date first (to validate ML results)
    let validRaceIds = new Set();
    if (targetDate) {
      const racesResponse = await fetch(
        `${supabaseUrl}/rest/v1/races?select=race_id&date=eq.${targetDate}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      if (racesResponse.ok) {
        const races = await racesResponse.json();
        validRaceIds = new Set(races.map(r => r.race_id));
        console.log(`Found ${races.length} valid races for ${targetDate}`);
      }
    }

    // Step 2: Get ML results to process
    let mlResultsUrl;
    let timeLabel;
    
    if (targetDate) {
      // Process all ML results for a specific date
      mlResultsUrl = `${supabaseUrl}/rest/v1/ml_model_race_results?select=*&created_at=gte.${targetDate}&created_at=lt.${targetDate}T23:59:59Z&order=race_id,model_name,created_at.asc`;
      timeLabel = `for date ${targetDate}`;
    } else if (forceRecalculate) {
      // Process all ML results from the last 7 days for recalculation
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      mlResultsUrl = `${supabaseUrl}/rest/v1/ml_model_race_results?select=*&created_at=gte.${sevenDaysAgo}&order=race_id,model_name,created_at.asc`;
      timeLabel = 'from last 7 days (force recalculate)';
    } else {
      // Default: process recent results (last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      mlResultsUrl = `${supabaseUrl}/rest/v1/ml_model_race_results?select=*&created_at=gte.${tenMinutesAgo}&order=race_id,model_name,created_at.asc`;
      timeLabel = 'from last 10 minutes';
    }
    
    console.log(`Fetching ML results ${timeLabel}...`);
    
    const recentResultsResponse = await fetch(mlResultsUrl, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });

    if (!recentResultsResponse.ok) {
      throw new Error(`Failed to fetch recent ML results: ${recentResultsResponse.status}`);
    }

    const allMLResults = await recentResultsResponse.json();
    console.log(`Found ${allMLResults.length} ML results to process`);

    // Step 3: Check for large batch and use smart batching (TEMPORARILY ALLOW LARGER BATCHES)
    if (allMLResults.length > 300) {
      console.log(`⚠️ Large batch detected (${allMLResults.length} ML results). Using smart batching...`);
      
      return new Response(JSON.stringify({
        success: true,
        message: `Large batch detected - please process in smaller chunks to avoid timeouts`,
        total_ml_results_found: allMLResults.length,
        recommendation: "Process ML results in smaller date ranges (e.g., single days) or use race-specific updates",
        triggered_by: triggeredBy,
        time_range: timeLabel
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 4: Filter out invalid race_ids if we have a target date
    let recentResults = allMLResults;
    let filteredOut = 0;
    
    if (targetDate && validRaceIds.size > 0) {
      recentResults = allMLResults.filter(result => validRaceIds.has(result.race_id));
      filteredOut = allMLResults.length - recentResults.length;
      
      if (filteredOut > 0) {
        console.log(`⚠️ Filtered out ${filteredOut} ML results with invalid race_ids for ${targetDate}`);
      }
    }

    if (recentResults.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No valid ML results to process',
        records_processed: 0,
        filtered_out: filteredOut
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📊 Processing ${recentResults.length} ML results (optimal batch size for production)...`);

    let totalProcessed = 0;
    let newRecordsCreated = 0;
    let existingRecordsUpdated = 0;
    let skippedDuplicates = 0;

    // Step 4: Group results by analysis_date and model to avoid duplicates
    const processedKeys = new Set();

    // Step 5: Process each ML result individually to increment performance stats
    for (const result of recentResults) {
      const analysisDate = result.created_at.split('T')[0]; // Extract date from timestamp
      const modelName = result.model_name;
      
      // Create unique key to prevent duplicate processing of same race/model combination
      const uniqueKey = `${analysisDate}_${modelName}_${result.race_id}_${result.horse_id}`;
      
      if (processedKeys.has(uniqueKey)) {
        console.log(`⚠️ Skipping duplicate: ${modelName} for ${analysisDate}, race: ${result.race_id}, horse: ${result.horse_name}`);
        skippedDuplicates++;
        continue;
      }
      processedKeys.add(uniqueKey);
      
      console.log(`Processing: ${modelName} for ${analysisDate}, race: ${result.race_id}, horse: ${result.horse_name}`);

      // Extract result data
      const isWinner = result.is_winner === true;
      const isTop3 = result.is_top3 === true;
      const confidence = result.predicted_probability || 0;

      // Get existing performance record for this model and date
      const existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/ml_model_performance?model_name=eq.${modelName}&analysis_date=eq.${analysisDate}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );

      let existingRecord = null;
      if (existingResponse.ok) {
        const existingData = await existingResponse.json();
        existingRecord = existingData.length > 0 ? existingData[0] : null;
      }

      if (existingRecord) {
        // INCREMENT existing record
        const newTotalPredictions = existingRecord.total_predictions + 1;
        const newCorrectWinners = existingRecord.correct_winner_predictions + (isWinner ? 1 : 0);
        const newCorrectTop3 = existingRecord.correct_top3_predictions + (isTop3 ? 1 : 0);
        
        // Recalculate percentages
        const newWinnerAccuracy = Math.round((newCorrectWinners / newTotalPredictions) * 100 * 100) / 100;
        const newTop3Accuracy = Math.round((newCorrectTop3 / newTotalPredictions) * 100 * 100) / 100;
        
        // Update running average confidence (weighted average)
        const currentTotalConfidence = (existingRecord.average_confidence_percentage / 100) * existingRecord.total_predictions;
        const newTotalConfidence = currentTotalConfidence + confidence;
        const newAvgConfidence = Math.round((newTotalConfidence / newTotalPredictions) * 100 * 100) / 100;

        // Update confidence when correct/incorrect (weighted averages)
        let newAvgConfidenceCorrect = existingRecord.average_confidence_when_correct || 0;
        let newAvgConfidenceIncorrect = existingRecord.average_confidence_when_incorrect || 0;
        
        if (newCorrectWinners > 0) {
          const currentCorrectTotal = (existingRecord.average_confidence_when_correct / 100) * existingRecord.correct_winner_predictions;
          const totalCorrectConfidence = currentCorrectTotal + (isWinner ? confidence : 0);
          newAvgConfidenceCorrect = Math.round((totalCorrectConfidence / newCorrectWinners) * 100 * 100) / 100;
        }
        
        const incorrectCount = newTotalPredictions - newCorrectWinners;
        if (incorrectCount > 0) {
          const currentIncorrectCount = existingRecord.total_predictions - existingRecord.correct_winner_predictions;
          const currentIncorrectTotal = (existingRecord.average_confidence_when_incorrect / 100) * currentIncorrectCount;
          const totalIncorrectConfidence = currentIncorrectTotal + (!isWinner ? confidence : 0);
          newAvgConfidenceIncorrect = Math.round((totalIncorrectConfidence / incorrectCount) * 100 * 100) / 100;
        }

        const performanceData = {
          total_predictions: newTotalPredictions,
          correct_winner_predictions: newCorrectWinners,
          correct_top3_predictions: newCorrectTop3,
          winner_accuracy_percentage: newWinnerAccuracy,
          top3_accuracy_percentage: newTop3Accuracy,
          average_confidence_percentage: newAvgConfidence,
          average_confidence_when_correct: newAvgConfidenceCorrect,
          average_confidence_when_incorrect: newAvgConfidenceIncorrect,
          ensemble_winner_predictions_correct: modelName === 'ensemble' ? newCorrectWinners : (existingRecord.ensemble_winner_predictions_correct || 0),
          ensemble_winner_predictions_incorrect: modelName === 'ensemble' ? (newTotalPredictions - newCorrectWinners) : (existingRecord.ensemble_winner_predictions_incorrect || 0),
          updated_at: new Date().toISOString()
        };

        // UPDATE existing record
        const updateResponse = await fetch(
          `${supabaseUrl}/rest/v1/ml_model_performance?model_name=eq.${modelName}&analysis_date=eq.${analysisDate}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(performanceData)
          }
        );

        if (updateResponse.ok) {
          console.log(`✅ INCREMENTED ${modelName} on ${analysisDate}: Total: ${newTotalPredictions}, Winners: ${newCorrectWinners} (${isWinner ? '+1' : '+0'})`);
          totalProcessed++;
          existingRecordsUpdated++;
        } else {
          const errorText = await updateResponse.text();
          console.error(`❌ Failed to update ${modelName} on ${analysisDate}:`, errorText);
        }

      } else {
        // INSERT new record (first race of the day for this model)
        const winnerAccuracy = isWinner ? 100.0 : 0.0;
        const top3Accuracy = isTop3 ? 100.0 : 0.0;
        const confidencePercentage = Math.round(confidence * 100 * 100) / 100;

        const performanceData = {
          model_name: modelName,
          analysis_date: analysisDate,
          total_predictions: 1,
          correct_winner_predictions: isWinner ? 1 : 0,
          correct_top3_predictions: isTop3 ? 1 : 0,
          winner_accuracy_percentage: winnerAccuracy,
          top3_accuracy_percentage: top3Accuracy,
          average_confidence_percentage: confidencePercentage,
          average_confidence_when_correct: isWinner ? confidencePercentage : 0,
          average_confidence_when_incorrect: !isWinner ? confidencePercentage : 0,
          ensemble_winner_predictions_correct: modelName === 'ensemble' && isWinner ? 1 : 0,
          ensemble_winner_predictions_incorrect: modelName === 'ensemble' && !isWinner ? 1 : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // INSERT new record
        const insertResponse = await fetch(
          `${supabaseUrl}/rest/v1/ml_model_performance`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(performanceData)
          }
        );

        if (insertResponse.ok) {
          console.log(`✅ NEW RECORD ${modelName} for ${analysisDate}: First race (${isWinner ? 'WINNER' : 'not winner'})`);
          totalProcessed++;
          newRecordsCreated++;
        } else {
          const errorText = await insertResponse.text();
          console.error(`❌ Failed to insert ${modelName} for ${analysisDate}:`, errorText);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `INCREMENTAL ML Model Performance update completed successfully (${triggeredBy})`,
      triggered_by: triggeredBy,
      source_race_id: sourceRaceId,
      target_date: targetDate,
      force_recalculate: forceRecalculate,
      time_range: timeLabel,
      data_validation: {
        total_ml_results_found: allMLResults.length,
        valid_ml_results_processed: recentResults.length,
        invalid_results_filtered_out: filteredOut,
        duplicate_results_skipped: skippedDuplicates
      },
      processing_summary: {
        records_updated: totalProcessed,
        new_records_created: newRecordsCreated,
        existing_records_updated: existingRecordsUpdated
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('INCREMENTAL ML Model Performance Update Error:', error);
    
    // Better error handling
    let errorMessage = 'Unknown error occurred';
    let errorDetails = null;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object') {
      errorMessage = error.message || JSON.stringify(error);
    }
    
    const errorResponse = {
      success: false,
      error: {
        message: errorMessage,
        details: errorDetails
      },
      timestamp: new Date().toISOString()
    };
    
    console.error('Error response:', errorResponse);
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});