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
        // Get request data
        const { race_id } = await req.json();

        console.log('Fetch race results request:', { race_id });

        // Validate required parameters
        if (!race_id) {
            throw new Error('Missing required parameter: race_id');
        }

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // API credentials
        const API_USERNAME = 'B06mvaMg9rdqfPBMJLe6wU0m';
        const API_PASSWORD = 'WC4kl7E2GvweCA9uxFAywbOY';

        console.log('Fetching results for race:', race_id);

        // Call the racing API
        const apiResponse = await fetch(`https://api.theracingapi.com/v1/results/${race_id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${btoa(`${API_USERNAME}:${API_PASSWORD}`)}`,
                'Content-Type': 'application/json'
            }
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('API call failed:', errorText);
            throw new Error(`API call failed: ${apiResponse.status} ${errorText}`);
        }

        const raceData = await apiResponse.json();
        console.log('Received race data:', raceData);

        // Check if we already have results for this race
        const existingResultResponse = await fetch(
            `${supabaseUrl}/rest/v1/race_results?race_id=eq.${race_id}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (existingResultResponse.ok) {
            const existingResults = await existingResultResponse.json();
            if (existingResults && existingResults.length > 0) {
                console.log('Results already exist for this race');
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Results already exist for this race',
                    race_id: race_id
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // Insert race result
        const raceResultData = {
            race_id: raceData.race_id,
            date: raceData.date,
            region: raceData.region,
            course: raceData.course,
            course_id: raceData.course_id,
            off: raceData.off,
            off_dt: raceData.off_dt,
            race_name: raceData.race_name,
            type: raceData.type,
            class: raceData.class,
            pattern: raceData.pattern,
            rating_band: raceData.rating_band,
            age_band: raceData.age_band,
            sex_rest: raceData.sex_rest,
            dist: raceData.dist,
            dist_y: raceData.dist_y ? parseInt(raceData.dist_y) : null,
            dist_m: raceData.dist_m ? parseInt(raceData.dist_m) : null,
            dist_f: raceData.dist_f ? parseInt(raceData.dist_f) : null,
            going: raceData.going,
            surface: raceData.surface,
            jumps: raceData.jumps,
            winning_time_detail: raceData.winning_time_detail,
            comments: raceData.comments,
            non_runners: raceData.non_runners,
            tote_win: raceData.tote_win,
            tote_pl: raceData.tote_pl,
            tote_ex: raceData.tote_ex,
            tote_csf: raceData.tote_csf,
            tote_tricast: raceData.tote_tricast,
            tote_trifecta: raceData.tote_trifecta
        };

        const insertRaceResultResponse = await fetch(
            `${supabaseUrl}/rest/v1/race_results`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(raceResultData)
            }
        );

        if (!insertRaceResultResponse.ok) {
            const errorText = await insertRaceResultResponse.text();
            console.error('Failed to insert race result:', errorText);
            throw new Error(`Failed to insert race result: ${errorText}`);
        }

        const insertedRaceResult = await insertRaceResultResponse.json();
        const raceResultId = insertedRaceResult[0].id;
        console.log('Inserted race result with ID:', raceResultId);

        // Insert runners
        if (raceData.runners && Array.isArray(raceData.runners)) {
            for (const runner of raceData.runners) {
                const runnerData = {
                    race_result_id: raceResultId,
                    horse_id: runner.horse_id,
                    horse: runner.horse,
                    sp: runner.sp,
                    sp_dec: runner.sp_dec ? parseFloat(runner.sp_dec) : null,
                    number: runner.number ? parseInt(runner.number) : null,
                    position: runner.position ? parseInt(runner.position) : null,
                    draw: runner.draw ? parseInt(runner.draw) : null,
                    btn: runner.btn ? parseFloat(runner.btn) : null,
                    ovr_btn: runner.ovr_btn ? parseFloat(runner.ovr_btn) : null,
                    age: runner.age ? parseInt(runner.age) : null,
                    sex: runner.sex,
                    weight: runner.weight,
                    weight_lbs: runner.weight_lbs ? parseInt(runner.weight_lbs) : null,
                    headgear: runner.headgear,
                    time: runner.time,
                    or: runner.or ? parseInt(runner.or) : null,
                    rpr: runner.rpr ? parseInt(runner.rpr) : null,
                    tsr: runner.tsr ? parseInt(runner.tsr) : null,
                    prize: runner.prize ? parseFloat(runner.prize) : null,
                    jockey: runner.jockey,
                    jockey_claim_lbs: runner.jockey_claim_lbs ? parseInt(runner.jockey_claim_lbs) : 0,
                    jockey_id: runner.jockey_id,
                    trainer: runner.trainer,
                    trainer_id: runner.trainer_id,
                    owner: runner.owner,
                    owner_id: runner.owner_id,
                    sire: runner.sire,
                    sire_id: runner.sire_id,
                    dam: runner.dam,
                    dam_id: runner.dam_id,
                    damsire: runner.damsire,
                    damsire_id: runner.damsire_id,
                    comment: runner.comment,
                    silk_url: runner.silk_url
                };

                const insertRunnerResponse = await fetch(
                    `${supabaseUrl}/rest/v1/race_runners`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(runnerData)
                    }
                );

                if (!insertRunnerResponse.ok) {
                    const errorText = await insertRunnerResponse.text();
                    console.error('Failed to insert runner:', errorText);
                    // Continue with other runners even if one fails
                }
            }
        }

        // Update bet results using the database function
        const updateBetsResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/update_bet_results`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ race_id_param: race_id })
            }
        );

        if (!updateBetsResponse.ok) {
            const errorText = await updateBetsResponse.text();
            console.error('Failed to update bet results:', errorText);
            // Don't throw error here, just log it
            console.warn('Bet results update failed, but race results were saved');
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Race results fetched and processed successfully',
            race_id: race_id,
            runners_count: raceData.runners ? raceData.runners.length : 0
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Fetch race results error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'FETCH_RACE_RESULTS_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
