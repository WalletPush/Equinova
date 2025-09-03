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
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
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
            const marketUpdates = [];

            // Process each race
            for (const race of racingData.racecards.slice(0, 3)) { // Limit to first 3 races for testing
                const raceId = race.race_id;
                const course = race.course;
                const offTime = race.off_time;

                // Process each runner in the race
                for (const runner of (race.runners || []).slice(0, 5)) { // Limit to first 5 runners for testing
                    const horseId = runner.horse_id;

                    // Process odds for selected bookmakers
                    for (const oddsEntry of (runner.odds || []).filter(o => selectedBookmakers.includes(o.bookmaker))) {
                        const currentTime = new Date().toISOString();
                        
                        // Get existing odds for comparison
                        try {
                            const existingOddsResponse = await fetch(
                                `${supabaseUrl}/rest/v1/horse_market_movement?race_id=eq.${raceId}&horse_id=eq.${horseId}&bookmaker=eq.${encodeURIComponent(oddsEntry.bookmaker)}`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${serviceRoleKey}`,
                                        'apikey': serviceRoleKey,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );

                            let initialOdds = oddsEntry.fractional;
                            let oddsChange = null;
                            let oddsMovement = null;
                            let oddsMovementPct = null;

                            if (existingOddsResponse.ok) {
                                const existingData = await existingOddsResponse.json();
                                
                                if (existingData && existingData.length > 0) {
                                    const existing = existingData[0];
                                    initialOdds = existing.initial_odds || oddsEntry.fractional;
                                    
                                    // Calculate odds movement
                                    const previousDecimal = existing.current_odds ? parseFloat(existing.current_odds) : oddsEntry.decimal;
                                    const currentDecimal = oddsEntry.decimal;
                                    
                                    if (previousDecimal && currentDecimal && previousDecimal !== currentDecimal) {
                                        oddsMovementPct = ((currentDecimal - previousDecimal) / previousDecimal) * 100;
                                        oddsChange = currentDecimal > previousDecimal ? 'lengthened' : 'shortened';
                                        oddsMovement = `${Math.abs(oddsMovementPct).toFixed(1)}% ${oddsChange}`;
                                    }
                                }
                            }

                            // Prepare market movement data
                            const marketData = {
                                race_id: raceId,
                                horse_id: horseId,
                                course: course,
                                off_time: offTime,
                                bookmaker: oddsEntry.bookmaker,
                                initial_odds: initialOdds,
                                current_odds: oddsEntry.decimal?.toString(),
                                odds_change: oddsChange,
                                odds_movement: oddsMovement,
                                odds_movement_pct: oddsMovementPct,
                                last_updated: currentTime,
                                updated_at: currentTime
                            };

                            marketUpdates.push(marketData);
                            totalProcessed++;
                        } catch (dbError) {
                            console.error('Database operation error:', dbError.message);
                            // Continue processing other entries
                        }
                    }
                }
            }

            // Batch insert/update market movements (with smaller batches)
            if (marketUpdates.length > 0) {
                console.log(`Upserting ${marketUpdates.length} market movements...`);
                
                // Process in smaller batches to avoid timeout
                const batchSize = 10;
                for (let i = 0; i < marketUpdates.length; i += batchSize) {
                    const batch = marketUpdates.slice(i, i + batchSize);
                    
                    try {
                        const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json',
                                'Prefer': 'resolution=merge-duplicates'
                            },
                            body: JSON.stringify(batch)
                        });

                        if (!upsertResponse.ok) {
                            const errorText = await upsertResponse.text();
                            console.error(`Failed to upsert batch ${i/batchSize + 1}:`, errorText);
                        } else {
                            console.log(`Batch ${i/batchSize + 1} upserted successfully`);
                        }
                    } catch (batchError) {
                        console.error(`Batch ${i/batchSize + 1} error:`, batchError.message);
                    }
                }
                
                console.log('Market movements processing completed');
            }

            const result = {
                data: {
                    message: 'Racing market monitoring completed successfully',
                    processed: totalProcessed,
                    racecards: racingData.racecards?.length || 0,
                    market_updates: marketUpdates.length,
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

        const errorResponse = {
            error: {
                code: 'MARKET_MONITORING_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});