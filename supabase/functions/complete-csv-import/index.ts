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
        console.log('Complete CSV import started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Fetch the CSV data from the deployed application
        const csvResponse = await fetch('https://ozv3vm3kiz8k.space.minimax.io/data/model_training_data.csv');
        if (!csvResponse.ok) {
            throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
        }

        const csvText = await csvResponse.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('CSV file appears to be empty or invalid');
        }

        console.log(`Processing ${lines.length - 1} CSV records...`);

        // Parse header to get column indices
        const headers = lines[0].split(',');
        
        const getColumnIndex = (columnName) => {
            const index = headers.indexOf(columnName);
            if (index === -1) {
                throw new Error(`Column ${columnName} not found in CSV`);
            }
            return index;
        };

        // Map all column indices
        const columnIndices = {
            race_id: getColumnIndex('race_id'),
            course: getColumnIndex('course'),
            course_id: getColumnIndex('course_id'),
            date: getColumnIndex('date'),
            off_time: getColumnIndex('off_time'),
            distance: getColumnIndex('distance'),
            race_class: getColumnIndex('race_class'),
            type: getColumnIndex('type'),
            age_band: getColumnIndex('age_band'),
            prize: getColumnIndex('prize'),
            field_size: getColumnIndex('field_size'),
            going: getColumnIndex('going'),
            surface: getColumnIndex('surface'),
            horse_id: getColumnIndex('horse_id'),
            horse: getColumnIndex('horse'),
            age: getColumnIndex('age'),
            sex: getColumnIndex('sex'),
            trainer: getColumnIndex('trainer'),
            trainer_id: getColumnIndex('trainer_id'),
            trainer_location: getColumnIndex('trainer_location'),
            trainer_rtf: getColumnIndex('trainer_rtf'),
            owner: getColumnIndex('owner'),
            owner_id: getColumnIndex('owner_id'),
            lbs: getColumnIndex('lbs'),
            ofr: getColumnIndex('ofr'),
            rpr: getColumnIndex('rpr'),
            ts: getColumnIndex('ts'),
            jockey: getColumnIndex('jockey'),
            jockey_id: getColumnIndex('jockey_id'),
            last_run: getColumnIndex('last_run'),
            form: getColumnIndex('form'),
            current_odds: getColumnIndex('current_odds'),
            comment: getColumnIndex('comment'),
            spotlight: getColumnIndex('spotlight'),
            quotes: getColumnIndex('quotes'),
            number: getColumnIndex('number'),
            draw: getColumnIndex('draw'),
            past_results_flags: getColumnIndex('past_results_flags'),
            silk_url: getColumnIndex('silk_url'),
            dist_y: getColumnIndex('dist_y'),
            mean_speed_figure: getColumnIndex('mean_speed_figure'),
            last_speed_figure: getColumnIndex('last_speed_figure'),
            best_speed_figure_at_distance: getColumnIndex('best_speed_figure_at_distance'),
            best_speed_figure_at_track: getColumnIndex('best_speed_figure_at_track'),
            avg_finishing_position: getColumnIndex('avg_finishing_position'),
            avg_ovr_btn: getColumnIndex('avg_ovr_btn'),
            avg_finishing_position_going: getColumnIndex('avg_finishing_position_going'),
            avg_ovr_button_on_going: getColumnIndex('avg_ovr_button_on_going'),
            best_speed_figure_on_course_going_distance: getColumnIndex('best_speed_figure_on_course_going_distance'),
            last_speed_figure_on_going_distance: getColumnIndex('last_speed_figure_on_going_distance'),
            jockey_win_percentage_at_distance: getColumnIndex('jockey_win_percentage_at_distance'),
            trainer_win_percentage_at_distance: getColumnIndex('trainer_win_percentage_at_distance'),
            horse_ae_at_distance: getColumnIndex('horse_ae_at_distance'),
            horse_win_percentage_at_distance: getColumnIndex('horse_win_percentage_at_distance'),
            trainer_21_days_win_percentage: getColumnIndex('trainer_21_days_win_percentage'),
            jockey_21_days_win_percentage: getColumnIndex('jockey_21_days_win_percentage'),
            trainer_win_percentage_at_course: getColumnIndex('trainer_win_percentage_at_course'),
            trainer_avg_ovr_btn_at_course: getColumnIndex('trainer_avg_ovr_btn_at_course'),
            trainer_avg_finishing_position_at_course: getColumnIndex('trainer_avg_finishing_position_at_course'),
            benter_proba: getColumnIndex('benter_proba'),
            ensemble_proba: getColumnIndex('ensemble_proba'),
            predicted_winner: getColumnIndex('predicted_winner'),
            mlp_proba: getColumnIndex('mlp_proba'),
            rf_proba: getColumnIndex('rf_proba'),
            xgboost_proba: getColumnIndex('xgboost_proba')
        };

        console.log('Column mapping completed, processing entries...');

        // Collect unique races first
        const racesMap = new Map();
        const entriesData = [];

        // Process each line
        for (let i = 1; i < lines.length; i++) {
            try {
                const values = lines[i].split(',');
                
                if (values.length < headers.length - 5) { // Allow some missing columns at end
                    console.warn(`Skipping incomplete line ${i}`);
                    continue;
                }

                // Clean and parse values
                const parseValue = (index, defaultValue = null) => {
                    if (index >= values.length) return defaultValue;
                    const value = values[index]?.replace(/^"|"$/g, '').trim();
                    if (!value || value === '' || value === 'null') return defaultValue;
                    return value;
                };

                const parseFloat = (index, defaultValue = null) => {
                    const value = parseValue(index);
                    if (value === null) return defaultValue;
                    const parsed = Number(value);
                    return isNaN(parsed) ? defaultValue : parsed;
                };

                const parseInt = (index, defaultValue = null) => {
                    const value = parseValue(index);
                    if (value === null) return defaultValue;
                    const parsed = Number(value);
                    return isNaN(parsed) ? defaultValue : Math.floor(parsed);
                };

                // Race data
                const raceId = parseValue(columnIndices.race_id);
                const courseName = parseValue(columnIndices.course);
                const courseId = parseValue(columnIndices.course_id);
                
                if (!raceId || !courseName || !courseId) {
                    console.warn(`Skipping entry ${i} - missing race identifiers`);
                    continue;
                }

                // Add race to map (will avoid duplicates)
                if (!racesMap.has(raceId)) {
                    racesMap.set(raceId, {
                        race_id: raceId,
                        course_id: courseId,
                        course_name: courseName,
                        date: parseValue(columnIndices.date, '2025-08-29'),
                        off_time: parseValue(columnIndices.off_time),
                        distance: parseValue(columnIndices.distance),
                        race_class: parseValue(columnIndices.race_class),
                        type: parseValue(columnIndices.type),
                        age_band: parseValue(columnIndices.age_band),
                        prize: parseValue(columnIndices.prize),
                        field_size: parseInt(columnIndices.field_size),
                        going: parseValue(columnIndices.going),
                        surface: parseValue(columnIndices.surface)
                    });
                }

                // Race entry data
                const entryData = {
                    race_id: raceId,
                    horse_id: parseValue(columnIndices.horse_id),
                    horse_name: parseValue(columnIndices.horse),
                    trainer_id: parseValue(columnIndices.trainer_id),
                    trainer_name: parseValue(columnIndices.trainer),
                    trainer_location: parseValue(columnIndices.trainer_location),
                    jockey_id: parseValue(columnIndices.jockey_id),
                    jockey_name: parseValue(columnIndices.jockey),
                    owner_id: parseValue(columnIndices.owner_id),
                    owner_name: parseValue(columnIndices.owner),
                    age: parseInt(columnIndices.age),
                    sex: parseValue(columnIndices.sex),
                    lbs: parseInt(columnIndices.lbs),
                    ofr: parseInt(columnIndices.ofr),
                    rpr: parseInt(columnIndices.rpr),
                    ts: parseInt(columnIndices.ts),
                    current_odds: parseFloat(columnIndices.current_odds),
                    comment: parseValue(columnIndices.comment),
                    spotlight: parseValue(columnIndices.spotlight),
                    quotes: parseValue(columnIndices.quotes),
                    number: parseInt(columnIndices.number),
                    draw: parseInt(columnIndices.draw),
                    silk_url: parseValue(columnIndices.silk_url),
                    form: parseValue(columnIndices.form),
                    last_run: parseInt(columnIndices.last_run),
                    // Speed figures
                    mean_speed_figure: parseFloat(columnIndices.mean_speed_figure),
                    last_speed_figure: parseFloat(columnIndices.last_speed_figure),
                    best_speed_figure_at_distance: parseFloat(columnIndices.best_speed_figure_at_distance),
                    best_speed_figure_at_track: parseFloat(columnIndices.best_speed_figure_at_track),
                    best_speed_figure_on_course_going_distance: parseFloat(columnIndices.best_speed_figure_on_course_going_distance),
                    last_speed_figure_on_going_distance: parseFloat(columnIndices.last_speed_figure_on_going_distance),
                    // Performance metrics
                    avg_finishing_position: parseFloat(columnIndices.avg_finishing_position),
                    avg_ovr_btn: parseFloat(columnIndices.avg_ovr_btn),
                    avg_finishing_position_going: parseFloat(columnIndices.avg_finishing_position_going),
                    avg_ovr_button_on_going: parseFloat(columnIndices.avg_ovr_button_on_going),
                    // Win percentages
                    jockey_win_percentage_at_distance: parseFloat(columnIndices.jockey_win_percentage_at_distance),
                    trainer_win_percentage_at_distance: parseFloat(columnIndices.trainer_win_percentage_at_distance),
                    trainer_win_percentage_at_course: parseFloat(columnIndices.trainer_win_percentage_at_course),
                    horse_win_percentage_at_distance: parseFloat(columnIndices.horse_win_percentage_at_distance),
                    trainer_21_days_win_percentage: parseFloat(columnIndices.trainer_21_days_win_percentage),
                    jockey_21_days_win_percentage: parseFloat(columnIndices.jockey_21_days_win_percentage),
                    // Additional trainer metrics
                    trainer_avg_ovr_btn_at_course: parseFloat(columnIndices.trainer_avg_ovr_btn_at_course),
                    trainer_avg_finishing_position_at_course: parseFloat(columnIndices.trainer_avg_finishing_position_at_course),
                    trainer_rtf: parseFloat(columnIndices.trainer_rtf),
                    horse_ae_at_distance: parseFloat(columnIndices.horse_ae_at_distance),
                    // ML model predictions
                    benter_proba: parseFloat(columnIndices.benter_proba),
                    ensemble_proba: parseFloat(columnIndices.ensemble_proba),
                    predicted_winner: parseInt(columnIndices.predicted_winner),
                    mlp_proba: parseFloat(columnIndices.mlp_proba),
                    rf_proba: parseFloat(columnIndices.rf_proba),
                    xgboost_proba: parseFloat(columnIndices.xgboost_proba)
                };

                entriesData.push(entryData);

            } catch (lineError) {
                console.error(`Error processing line ${i}:`, lineError.message);
            }
        }

        console.log(`Processed ${entriesData.length} entries from ${racesMap.size} unique races`);

        // Insert races first
        const races = Array.from(racesMap.values());
        console.log('Inserting races...');
        
        for (const race of races) {
            try {
                const raceResponse = await fetch(`${supabaseUrl}/rest/v1/races`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(race)
                });

                if (!raceResponse.ok) {
                    const errorText = await raceResponse.text();
                    console.error(`Failed to insert race ${race.race_id}:`, errorText);
                }
            } catch (error) {
                console.error(`Error inserting race ${race.race_id}:`, error.message);
            }
        }

        // Insert entries in batches
        console.log('Inserting race entries...');
        const batchSize = 25;
        let insertedCount = 0;
        
        for (let i = 0; i < entriesData.length; i += batchSize) {
            const batch = entriesData.slice(i, i + batchSize);
            
            try {
                const entriesResponse = await fetch(`${supabaseUrl}/rest/v1/race_entries`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(batch)
                });

                if (entriesResponse.ok) {
                    insertedCount += batch.length;
                    console.log(`Inserted batch ${Math.floor(i/batchSize) + 1}: ${insertedCount}/${entriesData.length} entries`);
                } else {
                    const errorText = await entriesResponse.text();
                    console.error(`Failed to insert batch ${Math.floor(i/batchSize) + 1}:`, errorText);
                }
            } catch (error) {
                console.error(`Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error.message);
            }
        }

        // Verification
        const verifyResponse = await fetch(
            `${supabaseUrl}/rest/v1/race_entries?select=count`,
            {
                method: 'HEAD',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Prefer': 'count=exact'
                }
            }
        );

        const totalInserted = verifyResponse.headers.get('Content-Range')?.split('/')[1] || '0';

        const result = {
            data: {
                message: 'Complete CSV import finished',
                csv_lines_processed: lines.length - 1,
                races_created: racesMap.size,
                entries_processed: entriesData.length,
                entries_inserted: insertedCount,
                total_in_database: parseInt(totalInserted),
                timestamp: new Date().toISOString()
            }
        };

        console.log('Complete CSV import finished:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Complete CSV import error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'CSV_IMPORT_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
