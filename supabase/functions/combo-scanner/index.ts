Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors });
  }

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const hdrs = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };

    const body = await req.json().catch(() => ({}));
    const minBets = body.min_bets ?? 20;
    const minRoi = body.min_roi ?? 0;
    const statusFilter = body.status ?? 'all';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

    console.log(`combo-scanner v2: date=${today}, min_bets=${minBets}, min_roi=${minRoi}`);

    // ═══════════════════════════════════════════════════════════════════
    //  PHASE A — Load pre-computed profitable combos from database
    // ═══════════════════════════════════════════════════════════════════

    let comboQuery = `${supabaseUrl}/rest/v1/dynamic_signal_combos?total_bets=gte.${minBets}&profit=gt.0&order=roi_pct.desc&limit=500`;
    if (minRoi > 0) comboQuery += `&roi_pct=gte.${minRoi}`;
    if (statusFilter !== 'all') comboQuery += `&status=eq.${statusFilter}`;

    const combosRes = await fetch(comboQuery, { headers: hdrs });
    const allCombos: DynCombo[] = combosRes.ok ? await combosRes.json() : [];

    console.log(`Phase A: ${allCombos.length} profitable combos loaded from DB`);

    if (allCombos.length === 0) {
      return json({ data: { top_combinations: [], today_matches: [], meta: { combos_available: 0 } } });
    }

    // ═══════════════════════════════════════════════════════════════════
    //  PHASE B — Match today's runners against profitable combos
    // ═══════════════════════════════════════════════════════════════════

    const racesRes = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date,off_time,course_name,type,surface&date=eq.${today}&limit=200`,
      { headers: hdrs },
    );
    const todayRaces: any[] = racesRes.ok ? await racesRes.json() : [];

    if (todayRaces.length === 0) {
      return json({
        data: {
          top_combinations: allCombos.slice(0, 50),
          today_matches: [],
          meta: { combos_available: allCombos.length, today_races: 0, generated_at: new Date().toISOString() },
        },
      });
    }

    const raceIds = todayRaces.map((r: any) => r.race_id);

    const ENTRY_COLS = [
      'race_id', 'horse_id', 'horse_name', 'finishing_position',
      'current_odds', 'opening_odds', 'jockey_name', 'trainer_name', 'silk_url', 'number',
      'mlp_proba', 'rf_proba', 'xgboost_proba', 'benter_proba', 'ensemble_proba',
      'rpr', 'ts', 'ofr',
      'horse_win_percentage_at_distance',
      'trainer_win_percentage_at_course', 'trainer_21_days_win_percentage',
      'jockey_21_days_win_percentage', 'jockey_win_percentage_at_distance',
      'best_speed_figure_at_distance', 'last_speed_figure', 'mean_speed_figure',
      'best_speed_figure_on_course_going_distance', 'best_speed_figure_at_track',
      'avg_finishing_position', 'comment',
    ].join(',');

    const entries = await fetchBatch(supabaseUrl, 'race_entries', ENTRY_COLS, raceIds, hdrs);
    console.log(`Fetched ${todayRaces.length} races, ${entries.length} entries`);

    const entriesByRace = groupBy(entries, 'race_id');
    const raceTypeMap: Record<string, string> = {};
    for (const r of todayRaces) raceTypeMap[r.race_id] = classifyRaceType(r);

    // Index combos by race_type for fast lookup
    const combosByType: Record<string, DynCombo[]> = {};
    for (const c of allCombos) {
      const rt = c.race_type || 'all';
      if (!combosByType[rt]) combosByType[rt] = [];
      combosByType[rt].push(c);
    }

    interface TodayMatch {
      horse_name: string; horse_id: string; race_id: string;
      course: string; off_time: string; race_type: string;
      jockey: string; trainer: string; current_odds: number;
      silk_url: string | null; number: number | null;
      finishing_position: number | null;
      matching_combos: DynCombo[];
      active_signals: string[];
      rpr: number; ts: number; ofr: number;
      comment: string;
      trainer_21d_wr: number; trainer_course_wr: number;
      jockey_21d_wr: number; jockey_dist_wr: number;
      best_speed: number; last_speed: number; mean_speed: number;
      avg_fp: number;
    }

    const todayMatches: TodayMatch[] = [];

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      const race = todayRaces.find((r: any) => r.race_id === raceId);
      if (!race) continue;

      const rt = raceTypeMap[raceId] || 'flat';
      const applicableCombos = [...(combosByType[rt] || []), ...(combosByType['all'] || [])];
      if (applicableCombos.length === 0) continue;

      const topPicks = getModelPicks(raceEntries);

      for (const entry of raceEntries) {
        const badges = topPicks.get(entry.horse_id) || [];
        const signals = computeAtomicSignals(entry, raceEntries, badges);

        const signalSet = new Set(signals);
        const matchedCombos: DynCombo[] = [];

        for (const combo of applicableCombos) {
          const keys: string[] = Array.isArray(combo.signal_keys) ? combo.signal_keys : [];
          if (keys.length === 0) continue;
          if (keys.every(k => signalSet.has(k))) {
            matchedCombos.push(combo);
          }
        }

        if (matchedCombos.length === 0) continue;
        matchedCombos.sort((a, b) => (b.roi_pct || 0) - (a.roi_pct || 0));

        const n = (v: any) => parseFloat(v) || 0;
        todayMatches.push({
          horse_name: entry.horse_name,
          horse_id: entry.horse_id,
          race_id: raceId,
          course: race.course_name,
          off_time: race.off_time,
          race_type: rt,
          jockey: entry.jockey_name || '',
          trainer: entry.trainer_name || '',
          current_odds: entry.current_odds || 0,
          silk_url: entry.silk_url || null,
          number: entry.number ?? null,
          finishing_position: entry.finishing_position ?? null,
          matching_combos: matchedCombos.slice(0, 10),
          active_signals: signals,
          rpr: n(entry.rpr),
          ts: n(entry.ts),
          ofr: n(entry.ofr),
          comment: entry.comment || '',
          trainer_21d_wr: n(entry.trainer_21_days_win_percentage),
          trainer_course_wr: n(entry.trainer_win_percentage_at_course),
          jockey_21d_wr: n(entry.jockey_21_days_win_percentage),
          jockey_dist_wr: n(entry.jockey_win_percentage_at_distance),
          best_speed: Math.max(n(entry.best_speed_figure_on_course_going_distance), n(entry.best_speed_figure_at_distance), n(entry.best_speed_figure_at_track)),
          last_speed: n(entry.last_speed_figure),
          mean_speed: n(entry.mean_speed_figure),
          avg_fp: n(entry.avg_finishing_position),
        });
      }
    }

    todayMatches.sort((a, b) => {
      const aTop = a.matching_combos[0]?.roi_pct || 0;
      const bTop = b.matching_combos[0]?.roi_pct || 0;
      return bTop - aTop;
    });

    console.log(`Phase B: ${todayMatches.length} matches for today`);

    return json({
      data: {
        top_combinations: allCombos.slice(0, 50),
        today_matches: todayMatches,
        meta: {
          combos_available: allCombos.length,
          today_races: todayRaces.length,
          today_entries: entries.length,
          generated_at: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('combo-scanner error:', err);
    return json({ error: { message: (err as Error).message } }, 500);
  }
});

// ─── Types ─────────────────────────────────────────────────────────────

interface DynCombo {
  id?: number;
  combo_key: string;
  combo_label: string;
  signal_keys: string[];
  race_type: string;
  total_bets: number;
  wins: number;
  win_rate: number;
  profit: number;
  roi_pct: number;
  avg_odds?: number;
  p_value?: number;
  status: string;
}

// ─── Atomic signal computation (mirrors Python scanner) ───────────────

function computeAtomicSignals(entry: any, raceEntries: any[], badges: string[]): string[] {
  const signals: string[] = [];
  const n = (v: any) => parseFloat(v) || 0;

  // Ratings: top in field
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

  // Model picks
  const modelTopCount = badges.length;
  if (modelTopCount >= 1) signals.push('ml_top_pick');
  if (modelTopCount >= 2) signals.push('consensus_2plus');
  if (modelTopCount >= 3) signals.push('consensus_3plus');
  if (modelTopCount >= 4) signals.push('consensus_4plus');

  // Value scores
  const ensProb = n(entry.ensemble_proba);
  const totalEns = raceEntries.reduce((s: number, e: any) => s + n(e.ensemble_proba), 0);
  const normProb = totalEns > 0 ? ensProb / totalEns : 0;
  const odds = n(entry.current_odds);
  const valueScore = odds > 1 ? normProb * odds : 0;
  if (valueScore >= 1.05) signals.push('value_1_05');
  if (valueScore >= 1.10) signals.push('value_1_10');
  if (valueScore >= 1.15) signals.push('value_1_15');

  // Market movement
  const openOdds = n(entry.opening_odds);
  const isSteaming = (openOdds > 0 && odds > 0 && odds < openOdds * 0.85);
  if (isSteaming) signals.push('steaming');
  if (openOdds > 0 && odds > 0 && odds > openOdds * 1.15) signals.push('drifting');

  // Form
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

  // Trainer stats
  const t21 = n(entry.trainer_21_days_win_percentage);
  if (t21 >= 10) signals.push('trainer_21d_wr10');
  if (t21 >= 15) signals.push('trainer_21d_wr15');
  if (t21 >= 20) signals.push('trainer_21d_wr20');
  if (trainerCrs >= 15) signals.push('trainer_course_wr15');

  // Jockey stats
  const j21 = n(entry.jockey_21_days_win_percentage);
  if (j21 >= 10) signals.push('jockey_21d_wr10');
  if (j21 >= 15) signals.push('jockey_21d_wr15');
  const jDist = n(entry.jockey_win_percentage_at_distance);
  if (jDist >= 15) signals.push('jockey_dist_wr15');

  // Speed standout
  const fieldAvg = fieldSpeeds.length > 0 ? fieldSpeeds.reduce((a, b) => a + b, 0) / fieldSpeeds.length : 0;
  if (fieldAvg > 0 && bestSpeed > 0) {
    const pctAbove = ((bestSpeed - fieldAvg) / fieldAvg) * 100;
    if (pctAbove >= 5) signals.push('speed_standout_5');
    if (pctAbove >= 10) signals.push('speed_standout_10');
  }

  // Odds bands
  if (odds >= 1 && odds <= 3) signals.push('odds_evs_to_3');
  if (odds > 3 && odds <= 6) signals.push('odds_3_to_6');
  if (odds > 6 && odds <= 10) signals.push('odds_6_to_10');
  if (odds > 10) signals.push('odds_10_plus');

  // Misc
  const avgFp = n(entry.avg_finishing_position);
  if (avgFp > 0 && avgFp <= 3) signals.push('low_avg_fp');

  return signals;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function classifyRaceType(r: any): string {
  const s = (r.surface || '').toLowerCase();
  if (s === 'all weather' || s === 'aw' || s.includes('polytrack') || s.includes('tapeta') || s.includes('fibresand')) return 'aw';
  const t = (r.type || '').toLowerCase();
  if (t === 'hurdle') return 'hurdles';
  if (t === 'chase') return 'chase';
  return 'flat';
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
      fetch(reqUrl, { headers })
        .then(async r => {
          if (!r.ok) { console.error(`fetchBatch ${table}: ${r.status}`); return []; }
          return r.json();
        })
        .catch(err => { console.error(`fetchBatch ${table}:`, err); return []; }),
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
  { f: 'mlp_proba', n: 'mlp' }, { f: 'rf_proba', n: 'rf' }, { f: 'xgboost_proba', n: 'xgboost' },
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
