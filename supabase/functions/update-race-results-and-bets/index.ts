Deno.serve(async (req)=>{
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // Get request body
    const body = await req.json();
    const race_id = body?.race_id;
    if (!race_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing race_id parameter'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Step 1: Get race results and runners
    const raceResultsResponse = await fetch(`${supabaseUrl}/rest/v1/race_results?race_id=eq.${race_id}&select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!raceResultsResponse.ok) {
      throw new Error(`Failed to fetch race results: ${raceResultsResponse.status}`);
    }
    const raceResults = await raceResultsResponse.json();
    if (!raceResults || raceResults.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No race results found for this race_id'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const raceResult = raceResults[0];
    // Step 2: Get race runners (horse results) - query by race_id
    const runnersResponse = await fetch(`${supabaseUrl}/rest/v1/race_runners?race_id=eq.${race_id}&select=*&order=position.asc`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!runnersResponse.ok) {
      throw new Error(`Failed to fetch race runners: ${runnersResponse.status}`);
    }
    const runners = await runnersResponse.json();
    // Step 3: Update race_entries with results from race_runners
    let updatedEntries = 0;
    let mlModelUpdates = 0;
    for (const runner of runners){
      if (!runner.position || !runner.horse_id) continue;
      // Update race_entries with finishing position from race_runners
      try {
        const updateEntryResponse = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${race_id}&horse_id=eq.${runner.horse_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            finishing_position: runner.position,
            result_updated_at: new Date().toISOString()
          })
        });
        if (updateEntryResponse.ok) {
          updatedEntries++;
        }
      } catch {
        console.error('update-race-results-and-bets: race entry update failed');
      }
      // Step 4: Track ML model performance using data from race_entries
      try {
        const entryResponse = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${race_id}&horse_id=eq.${runner.horse_id}&select=mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba,predicted_winner`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        });
        if (entryResponse.ok) {
          const entryData = await entryResponse.json();
          if (entryData && entryData.length > 0) {
            const entry = entryData[0];
            const isWinner = runner.position === 1;
            const isTop3 = runner.position <= 3;
            // Track ML model performance
            const mlModels = [
              {
                name: 'mlp',
                proba: entry.mlp_proba
              },
              {
                name: 'rf',
                proba: entry.rf_proba
              },
              {
                name: 'xgboost',
                proba: entry.xgboost_proba
              },
              {
                name: 'benter',
                proba: entry.benter_proba
              },
              {
                name: 'ensemble',
                proba: entry.ensemble_proba
              }
            ];
            for (const model of mlModels){
              if (model.proba && model.proba > 0) {
                // Insert ML model performance record
                const mlPerformanceData = {
                  race_id: race_id,
                  horse_id: runner.horse_id,
                  horse_name: runner.horse,
                  model_name: model.name,
                  predicted_probability: model.proba,
                  actual_position: runner.position,
                  is_winner: isWinner,
                  is_top3: isTop3,
                  prediction_correct: model.name === 'ensemble' ? entry.predicted_winner === 1 === isWinner : null,
                  created_at: new Date().toISOString()
                };
                const mlPerformanceResponse = await fetch(`${supabaseUrl}/rest/v1/ml_model_race_results`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(mlPerformanceData)
                });
                if (mlPerformanceResponse.ok) {
                  mlModelUpdates++;
                }
              }
            }
          }
        }
      } catch {
        console.error('update-race-results-and-bets: ML performance tracking failed');
      }
    }
    // Step 5: Update bets status
    const winnerHorse = runners.find((r)=>r.position === 1);
    let updatedBets = 0;
    let bankrollUpdates = 0;
    if (winnerHorse) {
      // Get all pending bets for this race
      const betsResponse = await fetch(`${supabaseUrl}/rest/v1/bets?race_id=eq.${race_id}&status=eq.pending&select=*`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      });
      if (betsResponse.ok) {
        const bets = await betsResponse.json();
        for (const bet of bets){
          // Prefer matching by horse_id when available, fall back to normalized horse_name
          const betHorseId = bet.horse_id ? String(bet.horse_id).trim() : null;
          const winnerHorseId = winnerHorse.horse_id ? String(winnerHorse.horse_id).trim() : null;
          let isWinner = false;
          if (betHorseId && winnerHorseId) {
            isWinner = betHorseId === winnerHorseId;
          } else {
            const betHorseName = bet.horse_name?.toLowerCase().trim();
            const winnerHorseName = winnerHorse.horse?.toLowerCase().trim();
            isWinner = betHorseName && winnerHorseName ? betHorseName === winnerHorseName : false;
          }
          const newStatus = isWinner ? 'won' : 'lost';

          // Update bet status
          const updateBetResponse = await fetch(`${supabaseUrl}/rest/v1/bets?id=eq.${bet.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: newStatus,
              updated_at: new Date().toISOString()
            })
          });
          if (updateBetResponse.ok) {
            updatedBets++;
            if (isWinner) {
              try {
                const getCurrentBankroll = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${bet.user_id}&select=current_amount`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey,
                  }
                });
                if (getCurrentBankroll.ok) {
                  const bankrollRows = await getCurrentBankroll.json();
                  const existingAmount = bankrollRows.length > 0 ? Number(bankrollRows[0].current_amount) : 0;
                  const newAmount = existingAmount + Number(bet.potential_return);

                  const bankrollUpdateResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${bet.user_id}`, {
                    method: 'PATCH',
                    headers: {
                      'Authorization': `Bearer ${supabaseKey}`,
                      'apikey': supabaseKey,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      current_amount: newAmount,
                      updated_at: new Date().toISOString()
                    })
                  });
                  if (bankrollUpdateResponse.ok) {
                    bankrollUpdates++;
                  }
                }
              } catch {
                console.error('update-race-results-and-bets: bankroll update failed');
              }
            }
          }
        }
      }
    }
    // Step 6: Update selections with results
    let updatedSelections = 0;
    for (const runner of runners){
      if (!runner.position || !runner.horse_id) continue;
      try {
        const updateSelectionResponse = await fetch(`${supabaseUrl}/rest/v1/selections?race_id=eq.${race_id}&horse_id=eq.${runner.horse_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            finishing_position: runner.position,
            result_updated_at: new Date().toISOString()
          })
        });
        if (updateSelectionResponse.ok) {
          updatedSelections++;
        }
      } catch {
        console.error('update-race-results-and-bets: selection update failed');
      }
    }
    // Step 7: Update shortlist with results
    let updatedShortlist = 0;
    for (const runner of runners){
      if (!runner.position || !runner.horse_id) continue;
      try {
        const updateShortlistResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist?race_id=eq.${race_id}&horse_id=eq.${runner.horse_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            finishing_position: runner.position,
            result_updated_at: new Date().toISOString()
          })
        });
        if (updateShortlistResponse.ok) {
          updatedShortlist++;
        }
      } catch {
        console.error('update-race-results-and-bets: shortlist update failed');
      }
    }
    
    // Step 8: Trigger ML performance data population
    let mlPerformancePopulated = false;
    try {
      const mlPerformanceResponse = await fetch(`${supabaseUrl}/functions/v1/populate-ml-performance-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          race_id: race_id,
          triggered_by: 'update-race-results-and-bets'
        })
      });
      
      if (mlPerformanceResponse.ok) {
        mlPerformancePopulated = true;
      }
    } catch {
      console.error('update-race-results-and-bets: ML performance population failed');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Race results processed successfully',
      race_id: race_id,
      summary: {
        race_entries_updated: updatedEntries,
        ml_model_performance_records: mlModelUpdates,
        bets_updated: updatedBets,
        bankroll_updates: bankrollUpdates,
        selections_updated: updatedSelections,
        shortlist_updated: updatedShortlist,
        ml_performance_populated: mlPerformancePopulated,
        total_runners: runners.length,
        winner: winnerHorse ? winnerHorse.horse : null
      },
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('update-race-results-and-bets: request failed');
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
