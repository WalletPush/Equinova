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
        console.log('CSV data fix (direct) started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Sample of CSV data that we know needs to be fixed
        // This is a subset of the model_training_data.csv for the most critical records
        const csvData = [
            {
                race_id: 'rac_11707839',
                horse_id: 'hrs_37052288',
                trainer_win_percentage_at_distance: 0.04,
                trainer_win_percentage_at_course: 7.14,
                jockey_win_percentage_at_distance: 0.1,
                horse_win_percentage_at_distance: 0
            },
            {
                race_id: 'rac_11707839',
                horse_id: 'hrs_46913328', 
                trainer_win_percentage_at_distance: 0.1,
                trainer_win_percentage_at_course: 13.89,
                jockey_win_percentage_at_distance: 0.13,
                horse_win_percentage_at_distance: 0
            },
            {
                race_id: 'rac_11707839',
                horse_id: 'hrs_21738476',
                trainer_win_percentage_at_distance: 0.06,
                trainer_win_percentage_at_course: 9.43,
                jockey_win_percentage_at_distance: 0.12,
                horse_win_percentage_at_distance: 0
            },
            {
                race_id: 'rac_11711141',
                horse_id: 'hrs_35813274',
                trainer_win_percentage_at_distance: 0.08,
                trainer_win_percentage_at_course: 7.23,
                jockey_win_percentage_at_distance: 0.09,
                horse_win_percentage_at_distance: 0
            },
            {
                race_id: 'rac_11711141',
                horse_id: 'hrs_29228941',
                trainer_win_percentage_at_distance: 0.07,
                trainer_win_percentage_at_course: 10.53,
                jockey_win_percentage_at_distance: 0.09,
                horse_win_percentage_at_distance: 0
            },
            {
                race_id: 'rac_11711141',
                horse_id: 'hrs_35015505',
                trainer_win_percentage_at_distance: 0.09,
                trainer_win_percentage_at_course: 9.26,
                jockey_win_percentage_at_distance: 0.06,
                horse_win_percentage_at_distance: 0.12
            }
        ];

        let updatedCount = 0;
        let errorCount = 0;
        
        // Process each record
        for (const record of csvData) {
            try {
                const updateData = {
                    trainer_win_percentage_at_distance: record.trainer_win_percentage_at_distance,
                    trainer_win_percentage_at_course: record.trainer_win_percentage_at_course,
                    jockey_win_percentage_at_distance: record.jockey_win_percentage_at_distance,
                    horse_win_percentage_at_distance: record.horse_win_percentage_at_distance
                };

                const updateResponse = await fetch(
                    `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${record.race_id}&horse_id=eq.${record.horse_id}`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'apikey': serviceRoleKey,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify(updateData)
                    }
                );

                if (updateResponse.ok) {
                    updatedCount++;
                    console.log(`Updated ${record.race_id}:${record.horse_id}`);
                } else {
                    console.error(`Failed to update ${record.race_id}:${record.horse_id}:`, await updateResponse.text());
                    errorCount++;
                }

            } catch (recordError) {
                console.error(`Error processing record ${record.race_id}:${record.horse_id}:`, recordError.message);
                errorCount++;
            }
        }

        // REMOVED: Random imputation of NULL trainer/jockey/horse stats was here.
        // Writing RANDOM() values into feature columns contaminates model signals.
        // NULLs should remain NULL — the prediction pipeline handles missing data.
        const sqlUpdates = 0;

        // Verify the fix by counting non-NULL values
        const verifyResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/count_non_null_percentages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            }
        );

        let verificationData = null;
        if (verifyResponse.ok) {
            verificationData = await verifyResponse.json();
        }

        const result = {
            data: {
                message: 'CSV data fix (direct) completed',
                records_processed: csvData.length,
                records_updated: updatedCount,
                sql_fixes_applied: sqlUpdates,
                errors: errorCount,
                verification: verificationData,
                timestamp: new Date().toISOString()
            }
        };

        console.log('CSV fix completed:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('CSV fix error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'CSV_FIX_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
