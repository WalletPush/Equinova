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
        const { 
            horse_name, 
            race_time,
            course_name,
            jockey_name,
            trainer_name,
            current_odds,
            notes,
            race_id
        } = await req.json();

        console.log('Add to selections request:', { 
            horse_name, 
            course_name,
            race_time,
            race_id
        });

        // Validate required parameters
        if (!horse_name || !course_name || !race_time) {
            throw new Error('Missing required parameters: horse_name, course_name, and race_time are required');
        }

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get user from auth header
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            throw new Error('No authorization header provided');
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify token and get user
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': serviceRoleKey
            }
        });

        if (!userResponse.ok) {
            throw new Error('Invalid authentication');
        }

        const userData = await userResponse.json();
        const userId = userData.id;

        console.log('User authenticated:', userId);

        // Look up the real race entry from race_entries table using race_id and horse_name
        console.log('Looking up race entry with race_id:', race_id, 'and horse_name:', horse_name);
        
        let realHorseId = null;
        let realRaceId = null;
        
        if (race_id) {
            // Try to find the race entry using race_id and horse_name
            const raceEntryResponse = await fetch(
                `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(race_id)}&horse_name=ilike.${encodeURIComponent(horse_name)}&select=horse_id,race_id&limit=1`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (raceEntryResponse.ok) {
                const raceEntries = await raceEntryResponse.json();
                console.log('Race entries found:', raceEntries.length, raceEntries);
                
                if (raceEntries.length > 0) {
                    const raceEntry = raceEntries[0];
                    console.log('Found race entry:', raceEntry);
                    
                    // Use the real IDs from race_entries
                    realHorseId = raceEntry.horse_id;
                    realRaceId = raceEntry.race_id;
                } else {
                    console.log('No race entry found with race_id and horse_name, trying fallback lookup');
                }
            } else {
                console.log('Race entry lookup failed, trying fallback');
            }
        }

        // Fallback: try to find race entry by horse_name only if we don't have real IDs
        if (!realHorseId || !realRaceId) {
            const fallbackResponse = await fetch(
                `${supabaseUrl}/rest/v1/race_entries?horse_name=ilike.${encodeURIComponent(horse_name)}&select=horse_id,race_id&limit=1`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (fallbackResponse.ok) {
                const fallbackEntries = await fallbackResponse.json();
                if (fallbackEntries.length > 0) {
                    const fallbackEntry = fallbackEntries[0];
                    realHorseId = fallbackEntry.horse_id;
                    realRaceId = fallbackEntry.race_id;
                    console.log('Found fallback race entry:', fallbackEntry);
                }
            }
        }

        // Check if selection already exists using horse_name and course_name
        const existingResponse = await fetch(
            `${supabaseUrl}/rest/v1/selections?user_id=eq.${userId}&horse_name=eq.${encodeURIComponent(horse_name)}&course_name=eq.${encodeURIComponent(course_name)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        let existingSelections = [];
        if (existingResponse.ok) {
            existingSelections = await existingResponse.json();
        }

        if (existingSelections.length > 0) {
            console.log('Selection already exists, updating...');
            
            // Update existing selection
            const updateResponse = await fetch(
                `${supabaseUrl}/rest/v1/selections?id=eq.${existingSelections[0].id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        current_odds: current_odds || null,
                        notes: notes || null,
                        updated_at: new Date().toISOString()
                    })
                }
            );

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text();
                console.error('Failed to update selection:', errorText);
                throw new Error(`Failed to update selection: ${errorText}`);
            }

            const updatedSelection = await updateResponse.json();
            console.log('Selection updated successfully:', updatedSelection[0]?.id);

            return new Response(JSON.stringify({
                success: true,
                message: 'Selection updated successfully',
                data: updatedSelection[0]
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create new selection - simplified structure without race_entry_id
        const selectionData = {
            user_id: userId,
            horse_name: horse_name,
            horse_id: realHorseId,
            race_id: realRaceId,
            race_time: race_time,
            course_name: course_name,
            jockey_name: jockey_name || null,
            trainer_name: trainer_name || null,
            current_odds: current_odds || null,
            notes: notes || 'Added from shortlist',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('Creating new selection:', selectionData);

        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/selections`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(selectionData)
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Failed to insert selection:', errorText);
            throw new Error(`Failed to add horse to selections: ${errorText}`);
        }

        const insertedSelection = await insertResponse.json();
        console.log('Added horse to selections successfully:', insertedSelection[0]?.id);

        return new Response(JSON.stringify({
            success: true,
            message: 'Horse added to selections successfully',
            data: insertedSelection[0]
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Add to selections error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'ADD_TO_SELECTIONS_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
