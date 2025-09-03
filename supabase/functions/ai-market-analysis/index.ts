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
        console.log('AI market analysis started at:', new Date().toISOString());

        const { movements } = await req.json();
        
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        const alertsToCreate = [];
        let analysisResults = {
            course_distance_specialists: 0,
            trainer_intents: 0,
            market_alerts: 0
        };

        // 1. COURSE & DISTANCE SPECIALIST ANALYSIS
        console.log('Analyzing course & distance specialists...');
        
        // Get unique horse IDs from movements
        const horseIds = [...new Set(movements.map(m => m.horse_id))];
        
        for (const horseId of horseIds) {
            // Get race entries for this horse to analyze historical performance
            const entriesResponse = await fetch(
                `${supabaseUrl}/rest/v1/race_entries?horse_id=eq.${horseId}&select=*`,
                {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey
                    }
                }
            );

            if (entriesResponse.ok) {
                const entries = await entriesResponse.json();
                
                // Group by course and distance
                const performanceMap = new Map();
                
                entries.forEach(entry => {
                    // Get race details
                    fetch(`${supabaseUrl}/rest/v1/races?race_id=eq.${entry.race_id}&select=course_name,distance`, {
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey
                        }
                    }).then(async (raceResponse) => {
                        if (raceResponse.ok) {
                            const races = await raceResponse.json();
                            if (races.length > 0) {
                                const race = races[0];
                                const key = `${race.course_name}_${race.distance}`;
                                
                                if (!performanceMap.has(key)) {
                                    performanceMap.set(key, {
                                        course_name: race.course_name,
                                        distance: race.distance,
                                        total_runs: 0,
                                        wins: 0
                                    });
                                }
                                
                                const perf = performanceMap.get(key);
                                perf.total_runs++;
                                
                                // Check if this was a win (finishing_position = 1)
                                if (entry.finishing_position === 1) {
                                    perf.wins++;
                                }
                            }
                        }
                    }).catch(error => {
                        console.log('Error fetching race details:', error.message);
                    });
                });

                // Calculate specialist scores
                for (const [key, perf] of performanceMap.entries()) {
                    if (perf.total_runs >= 3) { // Minimum 3 runs for analysis
                        const winPercentage = (perf.wins / perf.total_runs) * 100;
                        
                        if (winPercentage >= 70) { // 70%+ success rate
                            const confidenceScore = Math.min(95, 50 + (winPercentage - 70) + (perf.total_runs * 5));
                            
                            // Update/insert specialist record
                            const specialistData = {
                                horse_id: horseId,
                                course_name: perf.course_name,
                                distance: perf.distance,
                                total_runs: perf.total_runs,
                                wins: perf.wins,
                                win_percentage: winPercentage,
                                confidence_score: confidenceScore,
                                last_updated: new Date().toISOString()
                            };

                            const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/course_distance_specialists`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'resolution=merge-duplicates'
                                },
                                body: JSON.stringify(specialistData)
                            });

                            if (upsertResponse.ok) {
                                analysisResults.course_distance_specialists++;
                                
                                // Create alert for high-confidence specialists
                                if (confidenceScore >= 85) {
                                    alertsToCreate.push({
                                        alert_type: 'course_distance_specialist',
                                        race_id: movements.find(m => m.horse_id === horseId)?.race_id,
                                        horse_id: horseId,
                                        horse_name: entries[0]?.horse_name,
                                        course: perf.course_name,
                                        message: `High-confidence specialist: ${entries[0]?.horse_name} has ${winPercentage.toFixed(1)}% success rate at ${perf.course_name} over ${perf.distance}`,
                                        confidence_score: confidenceScore,
                                        created_at: new Date().toISOString()
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. TRAINER INTENT ANALYSIS
        console.log('Analyzing trainer intent patterns...');
        
        // Get today's races and analyze single-runner patterns
        const todayDate = new Date().toISOString().split('T')[0];
        const todayRacesResponse = await fetch(
            `${supabaseUrl}/rest/v1/races?date=eq.${todayDate}&select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (todayRacesResponse.ok) {
            const todayRaces = await todayRacesResponse.json();
            
            // Group races by course to find single-runner meetings
            const courseRaces = new Map();
            todayRaces.forEach(race => {
                if (!courseRaces.has(race.course_name)) {
                    courseRaces.set(race.course_name, []);
                }
                courseRaces.get(race.course_name).push(race);
            });

            // Analyze each course for single-runner patterns
            for (const [courseName, races] of courseRaces.entries()) {
                // Get all entries for races at this course
                const raceIds = races.map(r => r.race_id);
                const entriesResponse = await fetch(
                    `${supabaseUrl}/rest/v1/race_entries?race_id=in.(${raceIds.join(',')})&select=*`,
                    {
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey
                        }
                    }
                );

                if (entriesResponse.ok) {
                    const entries = await entriesResponse.json();
                    
                    // Group by trainer to find single-runner trainers
                    const trainerCounts = new Map();
                    entries.forEach(entry => {
                        const trainerId = entry.trainer_id;
                        if (!trainerCounts.has(trainerId)) {
                            trainerCounts.set(trainerId, {
                                trainer_name: entry.trainer_name,
                                runners: [],
                                count: 0
                            });
                        }
                        trainerCounts.get(trainerId).runners.push(entry);
                        trainerCounts.get(trainerId).count++;
                    });

                    // Identify single-runner trainers (intent signal)
                    for (const [trainerId, trainerData] of trainerCounts.entries()) {
                        if (trainerData.count === 1) { // Single runner at this meeting
                            const runner = trainerData.runners[0];
                            const confidenceScore = 75; // Base confidence for single-runner intent
                            
                            const intentData = {
                                race_id: runner.race_id,
                                trainer_id: trainerId,
                                trainer_name: trainerData.trainer_name,
                                course: courseName,
                                race_date: todayDate,
                                is_single_runner: true,
                                horse_id: runner.horse_id,
                                horse_name: runner.horse_name,
                                confidence_score: confidenceScore,
                                intent_analysis: `Trainer ${trainerData.trainer_name} has only one runner at ${courseName} today - suggests strong intent`,
                                created_at: new Date().toISOString()
                            };

                            const insertResponse = await fetch(`${supabaseUrl}/rest/v1/trainer_intent_analysis`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${serviceRoleKey}`,
                                    'apikey': serviceRoleKey,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(intentData)
                            });

                            if (insertResponse.ok) {
                                analysisResults.trainer_intents++;
                                
                                alertsToCreate.push({
                                    alert_type: 'trainer_intent',
                                    race_id: runner.race_id,
                                    horse_id: runner.horse_id,
                                    horse_name: runner.horse_name,
                                    course: courseName,
                                    message: `Trainer Intent: ${trainerData.trainer_name} has single runner ${runner.horse_name} at ${courseName} - strong intent signal`,
                                    confidence_score: confidenceScore,
                                    created_at: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            }
        }

        // 3. MARKET MOVEMENT ALERTS
        console.log('Processing market movement alerts...');
        
        for (const movement of movements) {
            if (Math.abs(movement.odds_movement_pct) >= 20) { // 20%+ movement threshold
                const horseName = await getHorseName(movement.horse_id, supabaseUrl, serviceRoleKey);
                
                alertsToCreate.push({
                    alert_type: 'market_movement',
                    race_id: movement.race_id,
                    horse_id: movement.horse_id,
                    horse_name: horseName,
                    course: movement.course,
                    message: `Significant market move: ${horseName} odds ${movement.odds_change} by ${Math.abs(movement.odds_movement_pct).toFixed(1)}% on ${movement.bookmaker}`,
                    confidence_score: Math.min(95, 50 + Math.abs(movement.odds_movement_pct)),
                    odds_improvement_pct: movement.odds_movement_pct,
                    created_at: new Date().toISOString()
                });
                analysisResults.market_alerts++;
            }
        }

        // Insert all alerts
        if (alertsToCreate.length > 0) {
            console.log(`Creating ${alertsToCreate.length} alerts...`);
            
            const alertsResponse = await fetch(`${supabaseUrl}/rest/v1/ai_insider_alerts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(alertsToCreate)
            });

            if (!alertsResponse.ok) {
                const errorText = await alertsResponse.text();
                console.error('Failed to create alerts:', errorText);
            } else {
                console.log('Alerts created successfully');
            }
        }

        const result = {
            data: {
                message: 'AI market analysis completed',
                analysis_results: analysisResults,
                alerts_created: alertsToCreate.length,
                timestamp: new Date().toISOString()
            }
        };

        console.log('AI analysis completed:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI market analysis error:', error);

        const errorResponse = {
            error: {
                code: 'AI_ANALYSIS_FAILED',
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

// Helper function to get horse name
async function getHorseName(horseId: string, supabaseUrl: string, serviceRoleKey: string): Promise<string> {
    try {
        const response = await fetch(
            `${supabaseUrl}/rest/v1/race_entries?horse_id=eq.${horseId}&select=horse_name&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );
        
        if (response.ok) {
            const entries = await response.json();
            return entries.length > 0 ? entries[0].horse_name : 'Unknown Horse';
        }
    } catch (error) {
        console.log('Error fetching horse name:', error.message);
    }
    return 'Unknown Horse';
}