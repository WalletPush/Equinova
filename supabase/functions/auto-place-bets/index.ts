Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const VALUE_MIN = 1.10;
  const CONSENSUS_MIN = 3;
  const MAX_ODDS = 5.0;
  const KELLY_DIV = 4;
  const MAX_KELLY_FRAC = 0.05;
  const MIN_STAKE = 1.0;
  const STARTING_BANKROLL = 200;
  const MODEL_KEYS = ['benter_proba', 'mlp_proba', 'rf_proba', 'xgboost_proba'] as const;

  async function apiFetch(path: string, opts: RequestInit = {}) {
    const res = await fetch(`${supabaseUrl}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    return res;
  }

  try {
    const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    console.log(`Auto-place-bets running for ${todayUK}`);

    const racesRes = await apiFetch(`/rest/v1/races?date=eq.${todayUK}&select=race_id`);
    if (!racesRes.ok) throw new Error(`Failed to fetch races: ${racesRes.status}`);
    const races: { race_id: string }[] = await racesRes.json();

    if (!races.length) {
      return new Response(JSON.stringify({ message: 'No races today', bets_placed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raceIds = races.map(r => r.race_id);
    const entriesRes = await apiFetch(
      `/rest/v1/race_entries?race_id=in.(${raceIds.join(',')})`
      + `&select=race_id,horse_id,horse_name,jockey_name,trainer_name,current_odds,benter_proba,mlp_proba,rf_proba,xgboost_proba,ensemble_proba,finishing_position`
    );
    if (!entriesRes.ok) throw new Error(`Failed to fetch entries: ${entriesRes.status}`);
    const entries: Record<string, any>[] = await entriesRes.json();

    const byRace = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = byRace.get(e.race_id) || [];
      arr.push(e);
      byRace.set(e.race_id, arr);
    }

    const lastLedgerRes = await apiFetch(
      `/rest/v1/auto_bet_ledger?order=id.desc&limit=1&select=bankroll_after`
    );
    let bankroll = STARTING_BANKROLL;
    if (lastLedgerRes.ok) {
      const lastRows = await lastLedgerRes.json();
      if (lastRows.length > 0 && lastRows[0].bankroll_after != null) {
        bankroll = Number(lastRows[0].bankroll_after);
      }
    }

    const existingRes = await apiFetch(
      `/rest/v1/auto_bet_ledger?bet_date=eq.${todayUK}&select=horse_id,race_id`
    );
    const existingBets = new Set<string>();
    if (existingRes.ok) {
      const existing: { horse_id: string; race_id: string }[] = await existingRes.json();
      for (const e of existing) existingBets.add(`${e.race_id}:${e.horse_id}`);
    }

    const racesInfoRes = await apiFetch(
      `/rest/v1/races?race_id=in.(${raceIds.join(',')})&select=race_id,course_name,off_time`
    );
    const raceInfo = new Map<string, { course: string; off_time: string }>();
    if (racesInfoRes.ok) {
      const ri: any[] = await racesInfoRes.json();
      for (const r of ri) raceInfo.set(r.race_id, { course: r.course_name || '', off_time: r.off_time || '' });
    }

    const newBets: Record<string, any>[] = [];

    for (const [raceId, raceEntries] of byRace) {
      if (raceEntries.length < 2) continue;

      const totalEnsemble = raceEntries.reduce((s, e) => s + (Number(e.ensemble_proba) || 0), 0);
      if (totalEnsemble <= 0) continue;

      for (const entry of raceEntries) {
        const odds = Number(entry.current_odds);
        if (!odds || odds <= 1 || odds > MAX_ODDS) continue;
        if (existingBets.has(`${raceId}:${entry.horse_id}`)) continue;

        const normProb = (Number(entry.ensemble_proba) || 0) / totalEnsemble;
        const valueScore = normProb * odds;
        if (valueScore < VALUE_MIN) continue;

        let consensus = 0;
        for (const mk of MODEL_KEYS) {
          const val = Number(entry[mk]);
          if (!val || isNaN(val)) continue;
          const top3 = raceEntries
            .filter(e => Number(e[mk]) > 0)
            .sort((a, b) => Number(b[mk]) - Number(a[mk]))
            .slice(0, 3)
            .map(e => e.horse_id);
          if (top3.includes(entry.horse_id)) consensus++;
        }
        if (consensus < CONSENSUS_MIN) continue;

        const implied = 1.0 / odds;
        const edge = normProb - implied;
        if (edge <= 0) continue;

        const kelly = edge / (odds - 1);
        const fraction = Math.min(kelly / KELLY_DIV, MAX_KELLY_FRAC);
        const stake = Math.round(bankroll * fraction * 100) / 100;
        if (stake < MIN_STAKE) continue;

        const tags: string[] = [];
        if (valueScore >= 1.30) tags.push('Strong Value');
        if (odds >= 4) tags.push('Higher Odds');

        const info = raceInfo.get(raceId);

        const record = {
          bet_date: todayUK,
          race_id: raceId,
          horse_id: entry.horse_id,
          horse_name: entry.horse_name || '',
          course: info?.course || '',
          off_time: info?.off_time || '',
          jockey: entry.jockey_name || '',
          trainer: entry.trainer_name || '',
          current_odds: odds,
          value_score: Math.round(valueScore * 1000) / 1000,
          model_consensus: consensus,
          norm_prob: Math.round(normProb * 10000) / 10000,
          kelly_fraction: Math.round(fraction * 100000) / 100000,
          stake,
          finishing_position: 0,
          won: false,
          profit: -stake,
          bankroll_after: Math.round((bankroll - stake) * 100) / 100,
          tags: `{${tags.map(t => `"${t}"`).join(',')}}`,
        };

        bankroll -= stake;
        newBets.push(record);
      }
    }

    if (newBets.length > 0) {
      const insertRes = await apiFetch('/rest/v1/auto_bet_ledger', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify(newBets),
      });
      if (!insertRes.ok) {
        const txt = await insertRes.text();
        throw new Error(`Insert failed: ${insertRes.status} ${txt}`);
      }
    }

    console.log(`Placed ${newBets.length} auto-bets, bankroll now £${bankroll.toFixed(2)}`);

    return new Response(JSON.stringify({
      success: true,
      date: todayUK,
      bets_placed: newBets.length,
      bankroll: Math.round(bankroll * 100) / 100,
      horses: newBets.map(b => `${b.horse_name} @ ${b.current_odds}`),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Auto-place-bets error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
