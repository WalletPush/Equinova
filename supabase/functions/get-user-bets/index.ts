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
        const { limit = 20, offset = 0, order_by = 'created_at', order_dir = 'desc' } = await req.json();

        console.log('Get user bets request:', { limit, offset, order_by, order_dir });

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

        // Get user's bets
        const betsResponse = await fetch(
            `${supabaseUrl}/rest/v1/bets?user_id=eq.${userId}&order=${order_by}.${order_dir}&limit=${limit}&offset=${offset}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!betsResponse.ok) {
            const errorText = await betsResponse.text();
            console.error('Failed to fetch bets:', errorText);
            throw new Error(`Failed to fetch bets: ${errorText}`);
        }

        const bets = await betsResponse.json();
        console.log(`Found ${bets.length} bets for user ${userId}`);

        // Get total count for pagination
        const countResponse = await fetch(
            `${supabaseUrl}/rest/v1/bets?user_id=eq.${userId}&select=id`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        let totalCount = 0;
        if (countResponse.ok) {
            const countData = await countResponse.json();
            totalCount = countData.length;
        }

        // Calculate summary statistics
        const summary = {
            total_bets: totalCount,
            total_amount_wagered: 0,
            total_potential_winnings: 0,
            won_bets_count: 0,
            lost_bets_count: 0,
            pending_bets_count: 0,
            total_winnings: 0,
            total_losses: 0,
            net_profit: 0
        };

        bets.forEach((bet: any) => {
            summary.total_amount_wagered += parseFloat(bet.bet_amount);
            summary.total_potential_winnings += parseFloat(bet.potential_return || 0);
            
            if (bet.status === 'won') {
                summary.won_bets_count++;
                summary.total_winnings += parseFloat(bet.potential_return || 0);
            } else if (bet.status === 'lost') {
                summary.lost_bets_count++;
                summary.total_losses += parseFloat(bet.bet_amount);
            } else if (bet.status === 'pending') {
                summary.pending_bets_count++;
            }
        });

        summary.net_profit = summary.total_winnings - summary.total_losses;

        const result = {
            bets: bets,
            summary: summary,
            pagination: {
                limit: limit,
                offset: offset,
                total: totalCount,
                has_more: offset + limit < totalCount
            }
        };

        return new Response(JSON.stringify({
            success: true,
            data: result
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Get user bets error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'GET_USER_BETS_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});


