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
    const { bet_id } = await req.json();
    console.log('Cancel bet request:', {
      bet_id
    });
    // Validate required parameters
    if (!bet_id) {
      throw new Error('Missing required parameter: bet_id');
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
    // First, get the bet details to check if it's pending and get the bet amount
    const getBetResponse = await fetch(`${supabaseUrl}/rest/v1/bets?id=eq.${bet_id}&user_id=eq.${userId}&select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!getBetResponse.ok) {
      const errorText = await getBetResponse.text();
      console.error('Failed to get bet:', errorText);
      throw new Error(`Failed to get bet: ${errorText}`);
    }
    const betData = await getBetResponse.json();
    if (!betData || betData.length === 0) {
      throw new Error('Bet not found');
    }
    const bet = betData[0];
    console.log('Found bet:', bet);
    // Check if bet is pending
    if (bet.status !== 'pending') {
      throw new Error('Can only cancel pending bets');
    }
    // Delete the bet
    const deleteBetResponse = await fetch(`${supabaseUrl}/rest/v1/bets?id=eq.${bet_id}&user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    if (!deleteBetResponse.ok) {
      const errorText = await deleteBetResponse.text();
      console.error('Failed to delete bet:', errorText);
      throw new Error(`Failed to delete bet: ${errorText}`);
    }
    const deletedBet = await deleteBetResponse.json();
    console.log('Successfully deleted bet:', deletedBet);
    // Refund the bet amount to user's bankroll
    const getBankrollResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}&select=current_amount`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!getBankrollResponse.ok) {
      const errorText = await getBankrollResponse.text();
      console.error('Failed to get bankroll:', errorText);
      throw new Error(`Failed to get bankroll: ${errorText}`);
    }
    const bankrollData = await getBankrollResponse.json();
    if (!bankrollData || bankrollData.length === 0) {
      throw new Error('No bankroll found for user');
    }
    const currentAmount = parseFloat(bankrollData[0].current_amount);
    const newAmount = currentAmount + bet.bet_amount;
    console.log(`Bankroll refund: ${currentAmount} + ${bet.bet_amount} = ${newAmount}`);
    const updateBankrollResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        current_amount: newAmount,
        updated_at: new Date().toISOString()
      })
    });
    if (!updateBankrollResponse.ok) {
      const errorText = await updateBankrollResponse.text();
      console.error('Failed to update bankroll:', errorText);
      // Don't throw error here, just log it
      console.warn('Bankroll update failed, but bet was cancelled');
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Bet cancelled successfully',
      refunded_amount: bet.bet_amount
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Cancel bet error:', error);
    const errorResponse = {
      success: false,
      error: {
        code: 'CANCEL_BET_ERROR',
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
