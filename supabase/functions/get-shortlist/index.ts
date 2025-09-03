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
        console.log('Get shortlist request received');

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

        // Fetch user's shortlist
        const shortlistResponse = await fetch(
            `${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userId}&order=created_at.desc`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!shortlistResponse.ok) {
            const errorText = await shortlistResponse.text();
            console.error('Failed to fetch shortlist:', errorText);
            throw new Error(`Failed to fetch shortlist: ${errorText}`);
        }

        const shortlistData = await shortlistResponse.json();
        console.log(`Found ${shortlistData.length} shortlist items for user ${userId}`);

        return new Response(JSON.stringify({
            success: true,
            data: shortlistData,
            count: shortlistData.length
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Get shortlist error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'GET_SHORTLIST_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});