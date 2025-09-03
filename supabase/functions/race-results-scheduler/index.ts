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
        console.log('=== RACE RESULTS SCHEDULER STARTED ===');
        
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            console.error('Missing environment variables:', { 
                hasServiceKey: !!serviceRoleKey, 
                hasUrl: !!supabaseUrl 
            });
            throw new Error('Supabase configuration missing');
        }

        console.log('Supabase configuration loaded successfully');

        // Get current UK time
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Europe/London',
            hour12: false
        });
        const currentDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

        console.log('Current UK time:', currentDate, currentTime);

        // First, let's log this execution attempt
        try {
            const logResponse = await fetch(
                `${supabaseUrl}/rest/v1/cron_log`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        job_name: 'race_results_scheduler',
                        executed_at: now.toISOString(),
                        status: 'started'
                    })
                }
            );

            if (!logResponse.ok) {
                console.warn('Failed to log cron execution:', await logResponse.text());
            } else {
                console.log('Cron execution logged successfully');
            }
        } catch (logError) {
            console.warn('Failed to log cron execution:', logError);
        }

        // Find races that finished 20+ minutes ago and don't have results yet
        console.log('Fetching races from database...');
        
        const racesResponse = await fetch(
            `${supabaseUrl}/rest/v1/races?select=id,race_id,course_id,off_time&order=off_time.asc`,
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
        console.log(`Found ${races.length} total races in database`);

        const racesToProcess = [];

        for (const race of races) {
            try {
                console.log(`Checking race: ${race.race_id} (${race.course_id} at ${race.off_time})`);
                
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

                if (existingResultsResponse.ok) {
                    const existingResults = await existingResultsResponse.json();
                    if (existingResults && existingResults.length > 0) {
                        console.log(`Race ${race.race_id} already has results, skipping`);
                        continue;
                    }
                }

                // Check if race finished 20+ minutes ago
                const raceTime = race.off_time.substring(0, 5); // Get HH:MM format
                const [hours, minutes] = raceTime.split(':').map(Number);
                
                // Convert 12-hour to 24-hour format (UK racing convention)
                let adjustedHours = hours;
                if (hours >= 1 && hours <= 11) {
                    adjustedHours = hours + 12;
                }
                
                const adjustedRaceTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                
                // Calculate if 20 minutes have passed
                const raceTimeDate = new Date(`${currentDate}T${adjustedRaceTime}:00`);
                const twentyMinutesLater = new Date(raceTimeDate.getTime() + 20 * 60 * 1000);
                
                console.log(`Race time: ${adjustedRaceTime}, 20min later: ${twentyMinutesLater.toLocaleTimeString()}, Current: ${now.toLocaleTimeString()}`);
                
                if (now >= twentyMinutesLater) {
                    console.log(`✅ Race ${race.race_id} finished 20+ minutes ago, adding to process list`);
                    racesToProcess.push(race);
                } else {
                    console.log(`⏰ Race ${race.race_id} hasn't finished yet (${Math.round((twentyMinutesLater.getTime() - now.getTime()) / 60000)} minutes remaining)`);
                }
            } catch (error) {
                console.error(`Error processing race ${race.race_id}:`, error);
                continue;
            }
        }

        console.log(`Found ${racesToProcess.length} races to process`);

        // Limit the number of races to process to prevent timeouts
        const maxRacesToProcess = 5; // Process max 5 races at a time
        const limitedRacesToProcess = racesToProcess.slice(0, maxRacesToProcess);
        
        if (racesToProcess.length > maxRacesToProcess) {
            console.log(`Limiting to ${maxRacesToProcess} races to prevent timeout (${racesToProcess.length - maxRacesToProcess} remaining for next run)`);
        }

        // Process each race
        const results = [];
        for (const race of limitedRacesToProcess) {
            try {
                console.log(`🔄 Processing race: ${race.race_id}`);
                
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
                        message: result.message || 'Processed successfully'
                    });
                    console.log(`✅ Successfully processed race ${race.race_id}`);
                } else {
                    const errorText = await fetchResultsResponse.text();
                    results.push({
                        race_id: race.race_id,
                        success: false,
                        error: errorText
                    });
                    console.error(`❌ Failed to process race ${race.race_id}:`, errorText);
                }

                // Wait 1 second between API calls to avoid rate limiting (reduced from 2 seconds)
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`❌ Error processing race ${race.race_id}:`, error);
                results.push({
                    race_id: race.race_id,
                    success: false,
                    error: error.message
                });
            }
        }

        // Update cron log status
        try {
            await fetch(
                `${supabaseUrl}/rest/v1/cron_log?job_name=eq.race_results_scheduler`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        status: 'completed',
                        executed_at: new Date().toISOString()
                    })
                }
            );
        } catch (logError) {
            console.warn('Failed to update cron log status:', logError);
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        console.log(`=== RACE RESULTS SCHEDULER COMPLETED ===`);
        console.log(`Processed: ${racesToProcess.length} races`);
        console.log(`Success: ${successCount}, Failures: ${failureCount}`);

        return new Response(JSON.stringify({
            success: true,
            message: `Processed ${racesToProcess.length} races (${successCount} success, ${failureCount} failures)`,
            processed_count: racesToProcess.length,
            success_count: successCount,
            failure_count: failureCount,
            results: results,
            timestamp: new Date().toISOString()
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('=== RACE RESULTS SCHEDULER ERROR ===');
        console.error('Error details:', error);

        // Try to log the error
        try {
            const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            
            if (serviceRoleKey && supabaseUrl) {
                await fetch(
                    `${supabaseUrl}/rest/v1/cron_log?job_name=eq.race_results_scheduler`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: 'error',
                            executed_at: new Date().toISOString()
                        })
                    }
                );
            }
        } catch (logError) {
            console.warn('Failed to log error status:', logError);
        }

        const errorResponse = {
            success: false,
            error: {
                code: 'RACE_RESULTS_SCHEDULER_ERROR',
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

