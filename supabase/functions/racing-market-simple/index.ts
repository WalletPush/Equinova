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
            const marketUpdates = [];

            // Process only first 2 races for testing
            for (const race of racingData.racecards.slice(0, 2)) {
                const raceId = race.race_id;
                const course = race.course;
                const offTime = race.off_time;

                // Process only first 3 runners per race for testing
                for (const runner of (race.runners || []).slice(0, 3)) {
                    const horseId = runner.horse_id;

                    // Process odds for selected bookmakers
                    for (const oddsEntry of (runner.odds || []).filter(o => selectedBookmakers.includes(o.bookmaker))) {
                        const currentTime = new Date().toISOString();
                        
                        const marketData = {
                            race_id: raceId,
                            horse_id: horseId,
                            course: course,
                            off_time: offTime,
                            bookmaker: oddsEntry.bookmaker,
                            initial_odds: oddsEntry.fractional,
                            current_odds: oddsEntry.decimal?.toString(),
                            last_updated: currentTime
                        };

                        marketUpdates.push(marketData);
                        totalProcessed++;
                    }
                }
            }

            // Simple insert approach with individual records
            if (marketUpdates.length > 0) {
                console.log(`Inserting ${marketUpdates.length} market movements...`);
                
                let insertedCount = 0;
                for (const marketData of marketUpdates) {
                    try {
                        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(marketData)
                        });

                        if (insertResponse.ok) {
                            insertedCount++;
                            console.log(`Inserted record for ${marketData.race_id}:${marketData.horse_id}:${marketData.bookmaker}`);
                        } else {
                            const errorText = await insertResponse.text();
                            console.error(`Failed to insert ${marketData.race_id}:${marketData.horse_id}:${marketData.bookmaker}: ${errorText}`);
                        }
                    } catch (error) {
                        console.error(`Error inserting ${marketData.race_id}:${marketData.horse_id}:${marketData.bookmaker}:`, error.message);
                    }
                }
                
                console.log(`Successfully inserted ${insertedCount} out of ${marketUpdates.length} records`);
            }

            const result = {
                data: {
                    message: 'Racing market monitoring completed successfully',
                    processed: totalProcessed,
                    inserted: marketUpdates.length,
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
