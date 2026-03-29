Deno.serve(async (req)=>{
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
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
    // Get user's bankroll
    const bankrollResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!bankrollResponse.ok) {
      const errorText = await bankrollResponse.text();
      throw new Error(`Failed to fetch bankroll: ${errorText}`);
    }
    const bankrollData = await bankrollResponse.json();
    if (!bankrollData || bankrollData.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          user_id: userId,
          current_amount: 0,
          has_bankroll: false
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const bankroll = bankrollData[0];
    return new Response(JSON.stringify({
      success: true,
      data: {
        user_id: userId,
        current_amount: bankroll.current_amount,
        created_at: bankroll.created_at,
        updated_at: bankroll.updated_at,
        has_bankroll: true
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('get-user-bankroll failed');
    const errorResponse = {
      success: false,
      error: {
        code: 'GET_USER_BANKROLL_ERROR',
        message: error.message
      }
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});



