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
    const { amount } = await req.json();
    console.log('Add bankroll amount request:', {
      amount
    });
    // Validate required parameters
    if (!amount || amount <= 0) {
      throw new Error('Missing required parameter: amount must be greater than 0');
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
    // Check if user has a bankroll record
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
      console.error('Failed to fetch bankroll:', errorText);
      throw new Error(`Failed to fetch bankroll: ${errorText}`);
    }
    const bankrollData = await bankrollResponse.json();
    if (!bankrollData || bankrollData.length === 0) {
      // Create new bankroll record
      const createBankrollResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: userId,
          current_amount: amount
        })
      });
      if (!createBankrollResponse.ok) {
        const errorText = await createBankrollResponse.text();
        console.error('Failed to create bankroll:', errorText);
        throw new Error(`Failed to create bankroll: ${errorText}`);
      }
      const newBankroll = await createBankrollResponse.json();
      console.log('Created new bankroll with amount:', newBankroll);
      return new Response(JSON.stringify({
        success: true,
        message: 'Bankroll created successfully',
        data: newBankroll[0]
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      // Update existing bankroll
      const currentAmount = parseFloat(bankrollData[0].current_amount);
      const newAmount = currentAmount + amount;
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
        throw new Error(`Failed to update bankroll: ${errorText}`);
      }
      const updatedBankroll = await updateBankrollResponse.json();
      console.log('Updated bankroll:', updatedBankroll);
      return new Response(JSON.stringify({
        success: true,
        message: 'Bankroll updated successfully',
        data: updatedBankroll[0]
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    console.error('Add bankroll amount error:', error);
    const errorResponse = {
      success: false,
      error: {
        code: 'ADD_BANKROLL_AMOUNT_ERROR',
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


