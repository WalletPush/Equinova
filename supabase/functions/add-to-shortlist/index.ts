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
        const { horse_name, race_time, course, odds, source, jockey_name, trainer_name, ml_info } = await req.json();

        console.log('Add to shortlist request:', { horse_name, race_time, course, odds, source, jockey_name, trainer_name, ml_info });

        // Validate required parameters
        if (!horse_name || !race_time || !course || !source) {
            throw new Error('Missing required parameters: horse_name, race_time, course, and source are required');
        }

        // Validate source
        const validSources = ['value_bet', 'trainer_intent', 'market_mover'];
        if (!validSources.includes(source)) {
            throw new Error('Invalid source. Must be one of: value_bet, trainer_intent, market_mover');
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

        // Check if horse already exists in shortlist for this user and course
        const checkResponse = await fetch(
            `${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userId}&horse_name=eq.${encodeURIComponent(horse_name)}&course=eq.${encodeURIComponent(course)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!checkResponse.ok) {
            console.error('Error checking existing shortlist:', await checkResponse.text());
            throw new Error('Failed to check existing shortlist entries');
        }

        const existingEntries = await checkResponse.json();
        
        if (existingEntries && existingEntries.length > 0) {
            // Update existing entry with new data and timestamp
            const updateData = {
                current_odds: odds || null,
                source: source,
                race_time: race_time,
                jockey_name: jockey_name || null,
                trainer_name: trainer_name || null,
                ml_info: ml_info || null,
                updated_at: new Date().toISOString()
            };

            const updateResponse = await fetch(
                `${supabaseUrl}/rest/v1/shortlist?id=eq.${existingEntries[0].id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(updateData)
                }
            );

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text();
                console.error('Failed to update shortlist entry:', errorText);
                throw new Error(`Failed to update shortlist entry: ${errorText}`);
            }

            const updatedEntry = await updateResponse.json();
            console.log('Updated existing shortlist entry:', updatedEntry[0]?.id);

            return new Response(JSON.stringify({
                success: true,
                message: 'Horse updated in shortlist',
                data: updatedEntry[0]
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Create new shortlist entry
        const shortlistData = {
            user_id: userId,
            horse_name: horse_name,
            race_time: race_time,
            course: course,
            current_odds: odds || null,
            source: source,
            jockey_name: jockey_name || null,
            trainer_name: trainer_name || null,
            ml_info: ml_info || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('Creating new shortlist entry:', shortlistData);

        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(shortlistData)
        });

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Failed to insert shortlist entry:', errorText);
            throw new Error(`Failed to add horse to shortlist: ${errorText}`);
        }

        const insertedEntry = await insertResponse.json();
        console.log('Added horse to shortlist successfully:', insertedEntry[0]?.id);

        return new Response(JSON.stringify({
            success: true,
            message: 'Horse added to shortlist successfully',
            data: insertedEntry[0]
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Add to shortlist error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'ADD_TO_SHORTLIST_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});