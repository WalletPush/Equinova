import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight
  try {
    // Get request data
    const { id } = await req.json();
    // Validate required parameters
    if (!id) {
      throw new Error('Missing required parameter: id is required');
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
    // Remove selection
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/selections?id=eq.${id}&user_id=eq.${userId}`, {
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
      throw new Error(`Failed to remove selection: ${errorText}`);
    }
    const deletedEntries = await deleteResponse.json();
    return new Response(JSON.stringify({
      success: true,
      message: 'Selection removed successfully',
      removedCount: deletedEntries.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Remove from selections failed');
    const errorResponse = {
      success: false,
      error: {
        code: 'REMOVE_FROM_SELECTIONS_ERROR',
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
