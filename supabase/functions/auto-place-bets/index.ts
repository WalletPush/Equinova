import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret') || '';
    if (provided !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const KELLY_DIV = 4;
  const MAX_KELLY_FRAC = 0.05;
  const MIN_STAKE = 1.0;
  const STARTING_BANKROLL = 200;
  const MAX_BETS_PER_DAY = 15;
  const MIN_PATTERN_ROI = 10;
  const MIN_ODDS = 1.5;

  async function apiFetch(path: string, opts: RequestInit = {}) {
    return fetch(`${supabaseUrl}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
  }

  try {
    const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

    // ── 1. Load proven profitable combos ──────────────────────────────
    const combosRes = await apiFetch(
      `/rest/v1/dynamic_signal_combos?status=eq.proven&roi_pct=gte.${MIN_PATTERN_ROI}&profit=gt.0&total_bets=gte.50&order=roi_pct.desc&limit=200`
    );
    if (!combosRes.ok) throw new Error(`Failed to fetch combos: ${combosRes.status}`);
    const combos: DynCombo[] = await combosRes.json();

    if (combos.length === 0) {
      return jsonResponse(corsHeaders, { message: 'No proven patterns available', bets_placed: 0 });
    }

    // ── 2. Fetch today's races and entries ────────────────────────────
    const racesRes = await apiFetch(
      `/rest/v1/races?date=eq.${todayUK}&select=race_id,course_name,off_time,type,surface&limit=200`
    );
    if (!racesRes.ok) throw new Error(`Failed to fetch races: ${racesRes.status}`);
    const races: any[] = await racesRes.json();

    if (!races.length) {
      return jsonResponse(corsHeaders, { message: 'No races today', bets_placed: 0 });
    }

    const raceIds = races.map(r => r.race_id);
    const raceInfoMap = new Map<string, { course: string; off_time: string; type: string }>();
    const raceTypeMap = new Map<string, string>();
    for (const r of races) {
      raceInfoMap.set(r.race_id, { course: r.course_name || '', off_time: r.off_time || '', type: classifyRaceType(r) });
      raceTypeMap.set(r.race_id, classifyRaceType(r));
    }

    const ENTRY_COLS = [
      'race_id', 'horse_id', 'horse_name', 'finishing_position',
      'current_odds', 'opening_odds', 'jockey_name', 'trainer_name', 'silk_url', 'number',
      'rf_proba', 'xgboost_proba', 'benter_proba', 'ensemble_proba',
      'rpr', 'ts', 'ofr',
      'horse_win_percentage_at_distance',
      'trainer_win_percentage_at_course', 'trainer_21_days_win_percentage',
      'jockey_21_days_win_percentage', 'jockey_win_percentage_at_distance',
      'best_speed_figure_at_distance', 'last_speed_figure', 'mean_speed_figure',
      'best_speed_figure_on_course_going_distance', 'best_speed_figure_at_track',
      'avg_finishing_position', 'comment',
    ].join(',');

    const entries = await fetchBatch(supabaseUrl, 'race_entries', ENTRY_COLS, raceIds, {
      'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey,
    });

    if (entries.length === 0) {
      return jsonResponse(corsHeaders, { message: 'No entries found', bets_placed: 0 });
    }

    const entriesByRace = groupBy(entries, 'race_id');

    // ── 3. Get bankroll and existing bets ─────────────────────────────
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

    // ── 4. Index combos by race type ──────────────────────────────────
    const combosByType: Record<string, DynCombo[]> = {};
    for (const c of combos) {
      const rt = c.race_type || 'all';
      if (!combosByType[rt]) combosByType[rt] = [];
      combosByType[rt].push(c);
    }

    // ── 5. Match entries against proven patterns ──────────────────────
    interface Candidate {
      raceId: string; entry: any; combo: DynCombo;
      odds: number; stake: number; fraction: number;
      normProb: number; valueScore: number; consensus: number;
    }

    const candidates: Candidate[] = [];

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      if (raceEntries.length < 2) continue;

      const rt = raceTypeMap.get(raceId) || 'flat';
      const applicableCombos = [...(combosByType[rt] || []), ...(combosByType['all'] || [])];
      if (applicableCombos.length === 0) continue;

      const topPicks = getModelPicks(raceEntries);
      const totalEns = raceEntries.reduce((s: number, e: any) => s + (parseFloat(e.ensemble_proba) || 0), 0);

      for (const entry of raceEntries) {
        const odds = parseFloat(entry.current_odds) || 0;
        if (odds < MIN_ODDS) continue;
        if (existingBets.has(`${raceId}:${entry.horse_id}`)) continue;

        const badges = topPicks.get(entry.horse_id) || [];
        const signals = computeAtomicSignals(entry, raceEntries, badges);
        const signalSet = new Set(signals);

        // Find the best-ROI matching combo
        let bestCombo: DynCombo | null = null;
        for (const combo of applicableCombos) {
          const keys: string[] = Array.isArray(combo.signal_keys) ? combo.signal_keys : [];
          if (keys.length === 0) continue;
          if (keys.every(k => signalSet.has(k))) {
            if (!bestCombo || combo.roi_pct > bestCombo.roi_pct) {
              bestCombo = combo;
            }
          }
        }

        if (!bestCombo) continue;

        // Kelly stake using pattern's historical win rate as edge estimate
        const patternWinRate = bestCombo.win_rate / 100;
        const implied = 1.0 / odds;
        const edge = patternWinRate - implied;
        if (edge <= 0) continue;

        const kelly = edge / (odds - 1);
        const fraction = Math.min(kelly / KELLY_DIV, MAX_KELLY_FRAC);
        const stake = Math.round(bankroll * fraction * 100) / 100;
        if (stake < MIN_STAKE) continue;

        const normProb = totalEns > 0 ? (parseFloat(entry.ensemble_proba) || 0) / totalEns : 0;
        const valueScore = odds > 1 ? normProb * odds : 0;

        let consensus = 0;
        for (const md of MF) {
          const p = parseFloat(entry[md.f]) || 0;
          if (p <= 0) continue;
          const sorted = raceEntries
            .filter((e: any) => (parseFloat(e[md.f]) || 0) > 0)
            .sort((a: any, b: any) => (parseFloat(b[md.f]) || 0) - (parseFloat(a[md.f]) || 0));
          const top3 = sorted.slice(0, 3).map((e: any) => e.horse_id);
          if (top3.includes(entry.horse_id)) consensus++;
        }

        candidates.push({
          raceId, entry, combo: bestCombo,
          odds, stake, fraction, normProb, valueScore, consensus,
        });
      }
    }

    // Sort by pattern ROI descending, take top N
    candidates.sort((a, b) => b.combo.roi_pct - a.combo.roi_pct);
    const selected = candidates.slice(0, MAX_BETS_PER_DAY);

    // ── 6. Build bet records ──────────────────────────────────────────
    const newBets: Record<string, any>[] = [];
    const placedHorses = new Set<string>();

    for (const c of selected) {
      const key = `${c.raceId}:${c.entry.horse_id}`;
      if (placedHorses.has(key)) continue;
      placedHorses.add(key);

      const info = raceInfoMap.get(c.raceId);

      const tags: string[] = [];
      if (c.combo.status === 'proven') tags.push('Proven Pattern');
      if (c.combo.roi_pct >= 50) tags.push('High ROI Pattern');
      if (c.valueScore >= 1.05) tags.push('Value Bet');

      const record = {
        bet_date: todayUK,
        race_id: c.raceId,
        horse_id: c.entry.horse_id,
        horse_name: c.entry.horse_name || '',
        course: info?.course || '',
        off_time: info?.off_time || '',
        jockey: c.entry.jockey_name || '',
        trainer: c.entry.trainer_name || '',
        current_odds: c.odds,
        value_score: Math.round(c.valueScore * 1000) / 1000,
        model_consensus: c.consensus,
        norm_prob: Math.round(c.normProb * 10000) / 10000,
        kelly_fraction: Math.round(c.fraction * 100000) / 100000,
        stake: c.stake,
        finishing_position: 0,
        won: false,
        profit: -c.stake,
        bankroll_after: Math.round((bankroll - c.stake) * 100) / 100,
        tags: `{${tags.map(t => `"${t}"`).join(',')}}`,
        signal_combo_key: c.combo.combo_key,
        signal_combo_label: c.combo.combo_label,
        signal_status: c.combo.status,
        signal_roi_pct: c.combo.roi_pct,
      };

      bankroll -= c.stake;
      newBets.push(record);
    }

    // ── 7. Insert bets ────────────────────────────────────────────────
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

    return jsonResponse(corsHeaders, {
      success: true,
      date: todayUK,
      bets_placed: newBets.length,
      bankroll: Math.round(bankroll * 100) / 100,
      patterns_loaded: combos.length,
      candidates_found: candidates.length,
      horses: newBets.map(b => ({
        name: b.horse_name,
        odds: b.current_odds,
        stake: b.stake,
        pattern: b.signal_combo_label,
        pattern_roi: b.signal_roi_pct,
      })),
    });
  } catch (error) {
    console.error('Auto-place-bets failed');
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Types & Helpers ────────────────────────────────────────────────────

interface DynCombo {
  combo_key: string;
  combo_label: string;
  signal_keys: string[];
  race_type: string;
  total_bets: number;
  wins: number;
  win_rate: number;
  profit: number;
  roi_pct: number;
  status: string;
}

function jsonResponse(headers: Record<string, string>, body: any) {
  return new Response(JSON.stringify(body), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function classifyRaceType(r: any): string {
  const s = (r.surface || '').toLowerCase();
  if (s === 'all weather' || s === 'aw' || s.includes('polytrack') || s.includes('tapeta') || s.includes('fibresand')) return 'aw';
  const t = (r.type || '').toLowerCase();
  if (t === 'hurdle') return 'hurdles';
  if (t === 'chase') return 'chase';
  return 'flat';
}

function computeAtomicSignals(entry: any, raceEntries: any[], badges: string[]): string[] {
  const signals: string[] = [];
  const n = (v: any) => parseFloat(v) || 0;

  const rprs = raceEntries.map((e: any) => n(e.rpr)).filter(v => v > 0);
  const myRpr = n(entry.rpr);
  if (rprs.length > 0 && myRpr > 0 && myRpr >= Math.max(...rprs)) signals.push('top_rpr');

  const tss = raceEntries.map((e: any) => n(e.ts)).filter(v => v > 0);
  const myTs = n(entry.ts);
  if (tss.length > 0 && myTs > 0 && myTs >= Math.max(...tss)) signals.push('top_ts');

  const ofrs = raceEntries.map((e: any) => n(e.ofr)).filter(v => v > 0);
  const myOfr = n(entry.ofr);
  if (ofrs.length > 0 && myOfr > 0 && myOfr >= Math.max(...ofrs)) signals.push('top_ofr');

  const bestSpeed = Math.max(
    n(entry.best_speed_figure_on_course_going_distance),
    n(entry.best_speed_figure_at_distance),
    n(entry.best_speed_figure_at_track),
  );
  const fieldSpeeds = raceEntries.map((e: any) => Math.max(
    n(e.best_speed_figure_on_course_going_distance),
    n(e.best_speed_figure_at_distance),
    n(e.best_speed_figure_at_track),
  )).filter(v => v > 0);
  if (fieldSpeeds.length > 0 && bestSpeed > 0 && bestSpeed >= Math.max(...fieldSpeeds)) {
    signals.push('top_speed_fig');
  }

  if (signals.includes('top_rpr') && signals.includes('top_ts')) signals.push('ratings_consensus');

  const modelTopCount = badges.length;
  if (modelTopCount >= 1) signals.push('ml_top_pick');
  if (modelTopCount >= 2) signals.push('consensus_2plus');
  if (modelTopCount >= 3) signals.push('consensus_3plus');
  if (modelTopCount >= 4) signals.push('consensus_4plus');

  const ensProb = n(entry.ensemble_proba);
  const totalEns = raceEntries.reduce((s: number, e: any) => s + n(e.ensemble_proba), 0);
  const normProb = totalEns > 0 ? ensProb / totalEns : 0;
  const odds = n(entry.current_odds);
  const valueScore = odds > 1 ? normProb * odds : 0;
  if (valueScore >= 1.05) signals.push('value_1_05');
  if (valueScore >= 1.10) signals.push('value_1_10');
  if (valueScore >= 1.15) signals.push('value_1_15');

  const openOdds = n(entry.opening_odds);
  const isSteaming = (openOdds > 0 && odds > 0 && odds < openOdds * 0.85);
  if (isSteaming) signals.push('steaming');
  if (openOdds > 0 && odds > 0 && odds > openOdds * 1.15) signals.push('drifting');

  const comment = ((entry.comment as string) || '').toLowerCase();
  if (/\bc\s*&\s*d\b/.test(comment) || /course\s+and\s+distance/.test(comment)) {
    signals.push('cd_winner');
  }
  const horseDist = n(entry.horse_win_percentage_at_distance);
  const trainerCrs = n(entry.trainer_win_percentage_at_course);
  if (horseDist >= 20 || (horseDist >= 10 && trainerCrs >= 15)) signals.push('course_specialist');
  if (horseDist >= 20) signals.push('distance_specialist');

  const lastSpd = n(entry.last_speed_figure);
  const meanSpd = n(entry.mean_speed_figure);
  if (lastSpd > meanSpd && lastSpd > 0 && meanSpd > 0) signals.push('improving_form');

  const t21 = n(entry.trainer_21_days_win_percentage);
  if (t21 >= 10) signals.push('trainer_21d_wr10');
  if (t21 >= 15) signals.push('trainer_21d_wr15');
  if (t21 >= 20) signals.push('trainer_21d_wr20');
  if (trainerCrs >= 15) signals.push('trainer_course_wr15');

  const j21 = n(entry.jockey_21_days_win_percentage);
  if (j21 >= 10) signals.push('jockey_21d_wr10');
  if (j21 >= 15) signals.push('jockey_21d_wr15');
  const jDist = n(entry.jockey_win_percentage_at_distance);
  if (jDist >= 15) signals.push('jockey_dist_wr15');

  const fieldAvg = fieldSpeeds.length > 0 ? fieldSpeeds.reduce((a, b) => a + b, 0) / fieldSpeeds.length : 0;
  if (fieldAvg > 0 && bestSpeed > 0) {
    const pctAbove = ((bestSpeed - fieldAvg) / fieldAvg) * 100;
    if (pctAbove >= 5) signals.push('speed_standout_5');
    if (pctAbove >= 10) signals.push('speed_standout_10');
  }

  if (odds >= 1 && odds <= 3) signals.push('odds_evs_to_3');
  if (odds > 3 && odds <= 6) signals.push('odds_3_to_6');
  if (odds > 6 && odds <= 10) signals.push('odds_6_to_10');
  if (odds > 10) signals.push('odds_10_plus');

  const avgFp = n(entry.avg_finishing_position);
  if (avgFp > 0 && avgFp <= 3) signals.push('low_avg_fp');

  return signals;
}

async function fetchBatch(url: string, table: string, select: string, ids: string[], headers: any): Promise<any[]> {
  if (!ids.length) return [];
  const size = 150;
  const promises: Promise<any[]>[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const batch = ids.slice(i, i + size);
    const inf = `in.(${batch.join(',')})`;
    const reqUrl = `${url}/rest/v1/${table}?select=${select}&race_id=${inf}&limit=10000`;
    promises.push(
      fetch(reqUrl, { headers: { ...headers, 'Content-Type': 'application/json' } })
        .then(async r => {
          if (!r.ok) return [];
          return r.json();
        })
        .catch(() => { console.error('fetchBatch failed'); return []; }),
    );
  }
  return (await Promise.all(promises)).flat();
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  const m: Record<string, any[]> = {};
  for (const e of arr) { if (!m[e[key]]) m[e[key]] = []; m[e[key]].push(e); }
  return m;
}

const MF = [
  { f: 'ensemble_proba', n: 'ensemble' }, { f: 'benter_proba', n: 'benter' },
  { f: 'rf_proba', n: 'rf' }, { f: 'xgboost_proba', n: 'xgboost' },
];

function getModelPicks(re: any[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const md of MF) {
    let best: any = null, bp = 0;
    for (const e of re) { const p = parseFloat(e[md.f]) || 0; if (p > bp) { bp = p; best = e; } }
    if (best) { const ex = m.get(best.horse_id) || []; ex.push(md.n); m.set(best.horse_id, ex); }
  }
  return m;
}
