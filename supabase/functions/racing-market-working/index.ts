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
        console.log('Racing market monitoring (working version) started at:', new Date().toISOString());

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
        
        const apiResponse = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            }
        });

        if (!apiResponse.ok) {
            throw new Error(`Racing API failed with status ${apiResponse.status}`);
        }

        const racingData = await apiResponse.json();
        console.log(`Received ${racingData.racecards?.length || 0} racecards`);

        if (!racingData.racecards || racingData.racecards.length === 0) {
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

        let updatedCount = 0;
        let insertedCount = 0;
        const selectedBookmakers = ['Bet365', 'Betfred', 'William Hill', 'Ladbrokes', 'Tote'];

        // Process first race only for testing
        const race = racingData.racecards[0];
        const raceId = race.race_id;
        const course = race.course;
        const offTime = race.off_time;

        console.log(`Processing race: ${raceId} at ${course}`);

        // Process first 2 runners
        for (const runner of (race.runners || []).slice(0, 2)) {
            const horseId = runner.horse_id;
            console.log(`Processing horse: ${horseId}`);

            // Process odds for selected bookmakers
            for (const oddsEntry of (runner.odds || []).filter(o => selectedBookmakers.includes(o.bookmaker))) {
                const bookmaker = oddsEntry.bookmaker;
                const currentTime = new Date().toISOString();
                
                console.log(`Processing odds for ${bookmaker}: ${oddsEntry.decimal}`);
                
                // Check if record exists
                const existingResponse = await fetch(
                    `${supabaseUrl}/rest/v1/horse_market_movement?race_id=eq.${raceId}&horse_id=eq.${horseId}&bookmaker=eq.${encodeURIComponent(bookmaker)}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (existingResponse.ok) {
                    const existingData = await existingResponse.json();
                    
                    if (existingData && existingData.length > 0) {
                        // Update existing record
                        const updateData = {
                            current_odds: oddsEntry.decimal?.toString(),
                            last_updated: currentTime
                        };
                        
                        const updateResponse = await fetch(
                            `${supabaseUrl}/rest/v1/horse_market_movement?race_id=eq.${raceId}&horse_id=eq.${horseId}&bookmaker=eq.${encodeURIComponent(bookmaker)}`,
                            {
                                method: 'PATCH',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(updateData)
                            }
                        );
                        
                        if (updateResponse.ok) {
                            updatedCount++;
                            console.log(`Updated existing record for ${bookmaker}`);
                        } else {
                            const error = await updateResponse.text();
                            console.error(`Update failed for ${bookmaker}:`, error);
                        }
                    } else {
                        // Insert new record
                        const insertData = {
                            race_id: raceId,
                            horse_id: horseId,
                            course: course,
                            off_time: offTime,
                            bookmaker: bookmaker,
                            initial_odds: oddsEntry.fractional,
                            current_odds: oddsEntry.decimal?.toString(),
                            last_updated: currentTime
                        };
                        
                        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${serviceRoleKey}`,
                                'apikey': serviceRoleKey,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(insertData)
                        });
                        
                        if (insertResponse.ok) {
                            insertedCount++;
                            console.log(`Inserted new record for ${bookmaker}`);
                        } else {
                            const error = await insertResponse.text();
                            console.error(`Insert failed for ${bookmaker}:`, error);
                        }
                    }
                } else {
                    console.error(`Failed to check existing record for ${bookmaker}`);
                }
            }
        }

        const result = {
            data: {
                message: 'Racing market monitoring completed successfully',
                race_processed: raceId,
                updated: updatedCount,
                inserted: insertedCount,
                total_processed: updatedCount + insertedCount,
                racecards_available: racingData.racecards?.length || 0,
                timestamp: new Date().toISOString()
            }
        };

        console.log('Market monitoring completed:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

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
