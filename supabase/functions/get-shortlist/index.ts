import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight
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
    // Get today's date in YYYY-MM-DD format (UK timezone)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

    // Fetch user's shortlist for today only
    const shortlistResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&order=created_at.desc`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!shortlistResponse.ok) {
      const errorText = await shortlistResponse.text();
      throw new Error(`Failed to fetch shortlist: ${errorText}`);
    }
    const shortlistData = await shortlistResponse.json();
    return new Response(JSON.stringify({
      success: true,
      data: shortlistData,
      count: shortlistData.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Get shortlist failed');
    const errorResponse = {
      success: false,
      error: {
        code: 'GET_SHORTLIST_ERROR',
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
