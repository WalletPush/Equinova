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
    const { horse_name, horse_id, race_id, course, off_time, trainer_name, jockey_name, current_odds, bet_amount, odds } = await req.json();
    console.log('Place bet request:', {
      horse_name,
      horse_id,
      race_id,
      course,
      off_time,
      trainer_name,
      jockey_name,
      current_odds,
      bet_amount,
      odds
    });
    // Validate required parameters
    if (!horse_name || !race_id || !course || !off_time || !bet_amount || bet_amount <= 0) {
      throw new Error(`Missing required parameters: horse_name=${horse_name}, race_id=${race_id}, course=${course}, off_time=${off_time}, bet_amount=${bet_amount}`);
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
    // Require client to provide the race_entries horse_id. Do NOT attempt fuzzy name lookups.
    const resolvedHorseId = horse_id || null;
    if (!resolvedHorseId) {
      throw new Error('Missing required horse_id from race_entries. Place bet requests must include race_entries.horse_id')
    }

    // Create the bet record with all the data from selections
    const betData = {
      user_id: userId,
      race_id: race_id,
      race_date: new Date().toISOString().split('T')[0],
      course: course,
      off_time: off_time,
      horse_id: resolvedHorseId,
      horse_name: horse_name,
      trainer_name: trainer_name || '',
      jockey_name: jockey_name || '',
      current_odds: current_odds || '',
      bet_amount: bet_amount,
      bet_type: 'win',
      status: 'pending',
      potential_return: bet_amount * odds
    };
    console.log('Creating bet with data:', betData);
    // Insert the bet
    const insertBetResponse = await fetch(`${supabaseUrl}/rest/v1/bets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(betData)
    });
    if (!insertBetResponse.ok) {
      const errorText = await insertBetResponse.text();
      console.error('Failed to create bet:', errorText);
      throw new Error(`Failed to create bet: ${errorText}`);
    }
    const createdBet = await insertBetResponse.json();
    console.log('Successfully created bet:', createdBet);
    // Update user's bankroll (deduct bet amount)
    // First get current bankroll amount
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
    const newAmount = currentAmount - bet_amount;
    console.log(`Bankroll update: ${currentAmount} - ${bet_amount} = ${newAmount}`);
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
      console.warn('Bankroll update failed, but bet was created');
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Bet placed successfully',
      bet: createdBet[0],
      potential_return: bet_amount * odds
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Place bet error:', error);
    const errorResponse = {
      success: false,
      error: {
        code: 'PLACE_BET_ERROR',
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
