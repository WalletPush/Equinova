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
        console.log('CSV data fix started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Fetch the CSV data from public URL 
        const csvResponse = await fetch('https://luk1nav9rpg5.space.minimax.io/data/model_training_data.csv');
        if (!csvResponse.ok) {
            throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
        }

        const csvText = await csvResponse.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('CSV file appears to be empty or invalid');
        }

        // Parse header to get column indices
        const headers = lines[0].split(',');
        
        const getColumnIndex = (columnName) => {
            const index = headers.indexOf(columnName);
            if (index === -1) {
                throw new Error(`Column ${columnName} not found in CSV`);
            }
            return index;
        };

        // Get indices for key fields
        const raceIdIndex = getColumnIndex('race_id');
        const horseIdIndex = getColumnIndex('horse_id');
        const trainerDistanceIndex = getColumnIndex('trainer_win_percentage_at_distance');
        const trainerCourseIndex = getColumnIndex('trainer_win_percentage_at_course');
        const jockeyDistanceIndex = getColumnIndex('jockey_win_percentage_at_distance');
        const horseDistanceIndex = getColumnIndex('horse_win_percentage_at_distance');

        console.log('Column indices found:', {
            race_id: raceIdIndex,
            horse_id: horseIdIndex,
            trainer_distance: trainerDistanceIndex,
            trainer_course: trainerCourseIndex,
            jockey_distance: jockeyDistanceIndex,
            horse_distance: horseDistanceIndex
        });

        let updatedCount = 0;
        let errorCount = 0;
        const batchSize = 50;
        
        // Process CSV data in batches
        for (let i = 1; i < lines.length; i += batchSize) {
            const batch = lines.slice(i, i + batchSize);
            
            for (const line of batch) {
                try {
                    const values = line.split(',');
                    
                    if (values.length < headers.length) {
                        console.warn(`Skipping incomplete line ${i}: ${line.substring(0, 100)}...`);
                        continue;
                    }

                    const raceId = values[raceIdIndex];
                    const horseId = values[horseIdIndex];
                    
                    // Parse percentage values (handle empty strings as NULL)
                    const parseValue = (value) => {
                        if (!value || value === '' || value === 'null') return null;
                        const parsed = parseFloat(value);
                        return isNaN(parsed) ? null : parsed;
                    };

                    const trainerDistance = parseValue(values[trainerDistanceIndex]);
                    const trainerCourse = parseValue(values[trainerCourseIndex]);
                    const jockeyDistance = parseValue(values[jockeyDistanceIndex]);
                    const horseDistance = parseValue(values[horseDistanceIndex]);

                    // Update the database record
                    const updateData = {
                        trainer_win_percentage_at_distance: trainerDistance,
                        trainer_win_percentage_at_course: trainerCourse,
                        jockey_win_percentage_at_distance: jockeyDistance,
                        horse_win_percentage_at_distance: horseDistance
                    };

                    const updateResponse = await fetch(
                        `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${raceId}&horse_id=eq.${horseId}`,
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
                        if (updatedCount % 100 === 0) {
                            console.log(`Updated ${updatedCount} records...`);
                        }
                    } else {
                        console.error(`Failed to update ${raceId}:${horseId}:`, await updateResponse.text());
                        errorCount++;
                    }

                } catch (lineError) {
                    console.error(`Error processing line ${i}:`, lineError.message);
                    errorCount++;
                }
            }

            // Small delay between batches to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
        }

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
                message: 'CSV data fix completed',
                total_lines_processed: lines.length - 1,
                records_updated: updatedCount,
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
