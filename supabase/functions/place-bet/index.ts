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
    const {
      horse_name, horse_id, race_id, course, off_time,
      trainer_name, jockey_name, current_odds, bet_amount, odds,
      trust_tier, trust_score, edge_pct, ensemble_proba, signal_combo_key,
    } = await req.json();
    if (!horse_name || !race_id || !course || !off_time || !bet_amount || bet_amount <= 0) {
      throw new Error('Missing required parameters');
    }
    const parsedAmount = Number(bet_amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      throw new Error('Invalid bet amount');
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
    // Require client to provide the race_entries horse_id. Do NOT attempt fuzzy name lookups.
    const resolvedHorseId = horse_id || null;
    if (!resolvedHorseId) {
      throw new Error('Missing required horse_id from race_entries. Place bet requests must include race_entries.horse_id')
    }

    // Fetch server-side odds to prevent client spoofing
    const entryRes = await fetch(
      `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(race_id)}&horse_id=eq.${encodeURIComponent(resolvedHorseId)}&select=current_odds,opening_odds`,
      { headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'apikey': serviceRoleKey, 'Content-Type': 'application/json' } }
    );
    const entryRows = entryRes.ok ? await entryRes.json() : [];
    const serverOdds = Number(entryRows[0]?.current_odds) || Number(entryRows[0]?.opening_odds) || Number(odds) || 1;
    const verifiedReturn = parsedAmount * serverOdds;

    const betData: Record<string, unknown> = {
      user_id: userId,
      race_id: race_id,
      race_date: new Date().toISOString().split('T')[0],
      course: course,
      off_time: off_time,
      horse_id: resolvedHorseId,
      horse_name: horse_name,
      trainer_name: trainer_name || '',
      jockey_name: jockey_name || '',
      current_odds: String(serverOdds),
      bet_amount: parsedAmount,
      bet_type: 'win',
      status: 'pending',
      potential_return: verifiedReturn,
    };
    if (trust_tier) betData.trust_tier = trust_tier;
    if (trust_score != null) betData.trust_score = trust_score;
    if (edge_pct != null) betData.edge_pct = edge_pct;
    if (ensemble_proba != null) betData.ensemble_proba = ensemble_proba;
    if (signal_combo_key) betData.signal_combo_key = signal_combo_key;
    // Verify bankroll has sufficient funds BEFORE creating bet
    const getBankrollResponse = await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}&select=current_amount`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!getBankrollResponse.ok) {
      throw new Error('Failed to get bankroll');
    }
    const bankrollData = await getBankrollResponse.json();
    if (!bankrollData || bankrollData.length === 0) {
      throw new Error('No bankroll found for user');
    }
    const currentAmount = parseFloat(bankrollData[0].current_amount);
    if (currentAmount < parsedAmount) {
      throw new Error(`Insufficient bankroll: £${currentAmount.toFixed(2)} available, £${parsedAmount.toFixed(2)} required`);
    }

    // Deduct bankroll FIRST (before creating the bet)
    const newAmount = currentAmount - parsedAmount;
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
      throw new Error('Failed to deduct bankroll — bet not placed');
    }

    // Insert the bet (bankroll already deducted)
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
      // Rollback: restore bankroll since bet creation failed
      await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          current_amount: currentAmount,
          updated_at: new Date().toISOString()
        })
      }).catch(() => {});
      const errorText = await insertBetResponse.text();
      throw new Error(`Failed to create bet: ${errorText}`);
    }
    const createdBet = await insertBetResponse.json();
    return new Response(JSON.stringify({
      success: true,
      message: 'Bet placed successfully',
      bet: createdBet[0],
      potential_return: verifiedReturn
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('place-bet failed');
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
