import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey },
    });
    if (!userRes.ok) throw new Error('Invalid authentication');
    const userData = await userRes.json();
    const userId = userData.id;

    const body = await req.json();
    const { bet_type, selections, unit_stake } = body;

    if (!bet_type || !selections?.length || !unit_stake || unit_stake <= 0) {
      throw new Error('Missing required fields: bet_type, selections, unit_stake');
    }

    interface Sel {
      horse_id: string;
      race_id: string;
      horse_name: string;
      course: string;
      off_time: string;
      jockey_name: string;
      trainer_name: string;
      odds: number;
    }

    const sels: Sel[] = selections;

    if (bet_type === 'double' && sels.length !== 2) throw new Error('Double requires exactly 2 selections');
    if (bet_type === 'patent' && sels.length !== 3) throw new Error('Patent requires exactly 3 selections');
    if (bet_type === 'lucky15' && sels.length !== 4) throw new Error('Lucky 15 requires exactly 4 selections');

    // Generate all combinations for k items from array
    function combinations<T>(arr: T[], k: number): T[][] {
      if (k === 1) return arr.map(x => [x]);
      if (k === arr.length) return [arr];
      const result: T[][] = [];
      for (let i = 0; i <= arr.length - k; i++) {
        const rest = combinations(arr.slice(i + 1), k - 1);
        for (const combo of rest) {
          result.push([arr[i], ...combo]);
        }
      }
      return result;
    }

    // Build component bets based on bet type
    interface ComponentBet {
      subtype: string;
      legs: Sel[];
      combinedOdds: number;
    }

    const components: ComponentBet[] = [];
    const n = sels.length;

    if (bet_type === 'double') {
      // Just 1 double
      const combinedOdds = sels[0].odds * sels[1].odds;
      components.push({ subtype: 'double', legs: sels, combinedOdds });
    } else {
      // Patent or Lucky 15: all combinations from singles to n-fold
      for (let k = 1; k <= n; k++) {
        const combos = combinations(sels, k);
        for (const combo of combos) {
          const combinedOdds = combo.reduce((acc, s) => acc * s.odds, 1);
          const subtype = k === 1 ? 'single' : k === 2 ? 'double' : k === 3 ? 'treble' : 'fourfold';
          components.push({ subtype, legs: combo, combinedOdds });
        }
      }
    }

    const betGroupId = crypto.randomUUID();
    const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const totalOutlay = unit_stake * components.length;

    // Check bankroll
    const bankrollRes = await fetch(
      `${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}&select=current_amount`,
      { headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey } },
    );
    if (!bankrollRes.ok) throw new Error('Failed to fetch bankroll');
    const bankrollData = await bankrollRes.json();
    if (!bankrollData?.length) throw new Error('No bankroll found for user');
    const currentBankroll = Number(bankrollData[0].current_amount);

    if (totalOutlay > currentBankroll) {
      throw new Error(`Insufficient bankroll: need £${totalOutlay.toFixed(2)}, have £${currentBankroll.toFixed(2)}`);
    }

    // Build bet rows
    const betRows = components.map(c => {
      const isSingle = c.legs.length === 1;
      const primaryLeg = c.legs[0];
      return {
        user_id: userId,
        race_id: isSingle ? primaryLeg.race_id : primaryLeg.race_id,
        race_date: todayUK,
        course: primaryLeg.course,
        off_time: primaryLeg.off_time,
        horse_id: isSingle ? primaryLeg.horse_id : primaryLeg.horse_id,
        horse_name: isSingle
          ? primaryLeg.horse_name
          : c.legs.map(l => l.horse_name).join(' + '),
        trainer_name: primaryLeg.trainer_name || '',
        jockey_name: primaryLeg.jockey_name || '',
        current_odds: String(Math.round(c.combinedOdds * 100) / 100),
        bet_amount: unit_stake,
        bet_type: 'win',
        status: 'pending',
        potential_return: Math.round(unit_stake * c.combinedOdds * 100) / 100,
        bet_group_id: betGroupId,
        bet_subtype: c.subtype,
        legs: isSingle ? null : JSON.stringify(
          c.legs.map(l => ({
            horse_id: l.horse_id,
            race_id: l.race_id,
            horse_name: l.horse_name,
            odds: l.odds,
          })),
        ),
      };
    });

    // Insert all bets
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/bets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(betRows),
    });
    if (!insertRes.ok) {
      const txt = await insertRes.text();
      throw new Error(`Failed to insert bets: ${txt}`);
    }
    const createdBets = await insertRes.json();

    // Deduct total outlay from bankroll
    const newBankroll = Math.round((currentBankroll - totalOutlay) * 100) / 100;
    await fetch(`${supabaseUrl}/rest/v1/user_bankroll?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ current_amount: newBankroll, updated_at: new Date().toISOString() }),
    });

    console.log(`[exotic-bet] Placed ${bet_type}: ${components.length} component bets, total outlay £${totalOutlay.toFixed(2)}, group ${betGroupId}`);

    return new Response(JSON.stringify({
      success: true,
      bet_type,
      bet_group_id: betGroupId,
      components_placed: components.length,
      total_outlay: totalOutlay,
      new_bankroll: newBankroll,
      bets: createdBets,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('place-exotic-bet error:', error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
