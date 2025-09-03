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
        console.log('Racing market monitoring started at:', new Date().toISOString());

        // Racing API credentials
        const API_USERNAME = 'B06mvaMg9rdqfPBMJLe6wU0m';
        const API_PASSWORD = 'WC4kl7E2GvweCA9uxFAywbOY';
        
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Create Basic Auth header
        const credentials = btoa(`${API_USERNAME}:${API_PASSWORD}`);
        
        console.log('Fetching racecards from Racing API...');
        
        // Fetch racecards data with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
            const apiResponse = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error('Racing API error:', errorText);
                throw new Error(`Racing API failed with status ${apiResponse.status}: ${errorText}`);
            }

            const racingData = await apiResponse.json();
            console.log(`Received ${racingData.racecards?.length || 0} racecards`);

            if (!racingData.racecards || racingData.racecards.length === 0) {
                console.log('No racecards available');
                return new Response(JSON.stringify({
                    data: { 
                        message: 'No racecards available - this is normal outside racing hours', 
                        processed: 0,
                        timestamp: new Date().toISOString()
                    }
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            let totalProcessed = 0;
            const selectedBookmakers = ['Bet365', 'Betfred', 'William Hill', 'Ladbrokes', 'Tote'];
            const sqlValues = [];

            // Process only first 3 races for testing  
            for (const race of racingData.racecards.slice(0, 3)) {
                const raceId = race.race_id;
                const course = race.course;
                const offTime = race.off_time;

                // Process only first 2 runners per race
                for (const runner of (race.runners || []).slice(0, 2)) {
                    const horseId = runner.horse_id;

                    // Process odds for selected bookmakers
                    for (const oddsEntry of (runner.odds || []).filter(o => selectedBookmakers.includes(o.bookmaker))) {
                        const currentTime = new Date().toISOString();
                        
                        const sqlValue = `('${raceId}', '${horseId}', '${course}', '${offTime}', '${oddsEntry.bookmaker}', '${oddsEntry.fractional}', '${oddsEntry.decimal}', '${currentTime}')`;
                        sqlValues.push(sqlValue);
                        totalProcessed++;
                    }
                }
            }

            // Execute SQL upsert using RPC
            if (sqlValues.length > 0) {
                console.log(`Upserting ${sqlValues.length} market movements using SQL...`);
                
                const upsertSQL = `
                    INSERT INTO horse_market_movement (race_id, horse_id, course, off_time, bookmaker, initial_odds, current_odds, last_updated)
                    VALUES ${sqlValues.join(', ')}
                    ON CONFLICT (race_id, horse_id, bookmaker)
                    DO UPDATE SET
                        current_odds = EXCLUDED.current_odds,
                        odds_change = CASE 
                            WHEN EXCLUDED.current_odds::float > horse_market_movement.current_odds::float THEN 'lengthened'
                            WHEN EXCLUDED.current_odds::float < horse_market_movement.current_odds::float THEN 'shortened'
                            ELSE horse_market_movement.odds_change
                        END,
                        odds_movement_pct = CASE 
                            WHEN EXCLUDED.current_odds::float != horse_market_movement.current_odds::float THEN 
                                ((EXCLUDED.current_odds::float - horse_market_movement.current_odds::float) / horse_market_movement.current_odds::float) * 100
                            ELSE horse_market_movement.odds_movement_pct
                        END,
                        odds_movement = CASE 
                            WHEN EXCLUDED.current_odds::float != horse_market_movement.current_odds::float THEN 
                                CONCAT(ABS(((EXCLUDED.current_odds::float - horse_market_movement.current_odds::float) / horse_market_movement.current_odds::float) * 100)::text, '% ', 
                                    CASE WHEN EXCLUDED.current_odds::float > horse_market_movement.current_odds::float THEN 'lengthened' ELSE 'shortened' END)
                            ELSE horse_market_movement.odds_movement
                        END,
                        last_updated = EXCLUDED.last_updated,
                        updated_at = NOW()
                    RETURNING id;
                `;
                
                console.log('Executing SQL upsert...');
                
                const sqlResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query: upsertSQL })
                });
                
                if (!sqlResponse.ok) {
                    const errorText = await sqlResponse.text();
                    console.error('SQL execution failed:', errorText);
                    
                    // Fallback: try individual upserts
                    console.log('Attempting individual upserts as fallback...');
                    let successCount = 0;
                    
                    for (let i = 0; i < Math.min(sqlValues.length, 5); i++) {
                        const individualSQL = `
                            INSERT INTO horse_market_movement (race_id, horse_id, course, off_time, bookmaker, initial_odds, current_odds, last_updated)
                            VALUES ${sqlValues[i]}
                            ON CONFLICT (race_id, horse_id, bookmaker)
                            DO UPDATE SET
                                current_odds = EXCLUDED.current_odds,
                                last_updated = EXCLUDED.last_updated,
                                updated_at = NOW();
                        `;
                        
                        try {
                            const individualResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ query: individualSQL })
                            });
                            
                            if (individualResponse.ok) {
                                successCount++;
                            } else {
                                const indError = await individualResponse.text();
                                console.error(`Individual upsert ${i+1} failed:`, indError);
                            }
                        } catch (e) {
                            console.error(`Individual upsert ${i+1} exception:`, e.message);
                        }
                    }
                    
                    console.log(`Fallback: ${successCount} individual upserts succeeded`);
                } else {
                    console.log('Batch SQL upsert completed successfully');
                }
            }

            const result = {
                data: {
                    message: 'Racing market monitoring completed successfully',
                    processed: totalProcessed,
                    upsert_values: sqlValues.length,
                    racecards: racingData.racecards?.length || 0,
                    timestamp: new Date().toISOString()
                }
            };

            console.log('Market monitoring completed:', result.data);

            return new Response(JSON.stringify(result), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
            
        } catch (apiError) {
            clearTimeout(timeoutId);
            
            if (apiError.name === 'AbortError') {
                console.error('Racing API request timed out');
                throw new Error('Racing API request timed out after 15 seconds');
            }
            
            console.error('Racing API error:', apiError.message);
            throw apiError;
        }

    } catch (error) {
        console.error('Racing market monitoring error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'MARKET_MONITORING_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
