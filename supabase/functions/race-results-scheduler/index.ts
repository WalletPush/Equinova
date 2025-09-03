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
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        console.log('Starting race results scheduler...');
        console.log('Supabase URL:', supabaseUrl);

        // Find races that don't have results yet
        const racesResponse = await fetch(
            `${supabaseUrl}/rest/v1/races?select=id,race_id,course_id&order=id.asc&limit=20`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!racesResponse.ok) {
            const errorText = await racesResponse.text();
            console.error('Failed to fetch races:', errorText);
            throw new Error(`Failed to fetch races: ${errorText}`);
        }

        const races = await racesResponse.json();
        console.log(`Found ${races.length} races`);

        const racesToProcess = [];

        // Check which races need results
        for (const race of races) {
            try {
                // Check if we already have results for this race
                const existingResultsResponse = await fetch(
                    `${supabaseUrl}/rest/v1/race_results?race_id=eq.${race.race_id}`,
                    {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (!existingResultsResponse.ok) {
                    console.error(`Failed to check results for race ${race.race_id}`);
                    continue;
                }

                const existingResults = await existingResultsResponse.json();
                
                if (existingResults && existingResults.length > 0) {
                    console.log(`Race ${race.race_id} already has results, skipping`);
                    continue;
                }

                // Add race to process list if it doesn't have results
                console.log(`Race ${race.race_id} needs results, adding to process list`);
                racesToProcess.push(race);
                
            } catch (error) {
                console.error(`Error checking race ${race.race_id}:`, error);
                continue;
            }
        }

        console.log(`Found ${racesToProcess.length} races to process`);

        // Process each race
        const results = [];
        for (const race of racesToProcess) {
            try {
                console.log(`Processing race: ${race.race_id}`);
                
                // Call the fetch-race-results function
                const fetchResultsResponse = await fetch(
                    `${supabaseUrl}/functions/v1/fetch-race-results`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ race_id: race.race_id })
                    }
                );

                if (fetchResultsResponse.ok) {
                    const result = await fetchResultsResponse.json();
                    results.push({
                        race_id: race.race_id,
                        success: true,
                        message: result.message
                    });
                    console.log(`Successfully processed race ${race.race_id}`);
                } else {
                    const errorText = await fetchResultsResponse.text();
                    results.push({
                        race_id: race.race_id,
                        success: false,
                        error: errorText
                    });
                    console.error(`Failed to process race ${race.race_id}:`, errorText);
                }

                // Wait 1 second between API calls to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error processing race ${race.race_id}:`, error);
                results.push({
                    race_id: race.race_id,
                    success: false,
                    error: error.message
                });
            }
        }

        // Just return success for now
        return new Response(JSON.stringify({
            success: true,
            message: `Processed ${racesToProcess.length} races`,
            processed_count: racesToProcess.length,
            results: results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Race results scheduler error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'RACE_RESULTS_SCHEDULER_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

