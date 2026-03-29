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
    // Get request data
    const { horse_name, course } = await req.json();
    // Validate required parameters
    if (!horse_name || !course) {
      throw new Error('Missing required parameters: horse_name and course are required');
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
    // Remove from shortlist
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userId}&horse_name=eq.${encodeURIComponent(horse_name)}&course=eq.${encodeURIComponent(course)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Failed to remove horse from shortlist: ${errorText}`);
    }
    const deletedEntries = await deleteResponse.json();
    return new Response(JSON.stringify({
      success: true,
      message: 'Horse removed from shortlist successfully',
      removedCount: deletedEntries.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Remove from shortlist failed');
    const errorResponse = {
      success: false,
      error: {
        code: 'REMOVE_FROM_SHORTLIST_ERROR',
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
