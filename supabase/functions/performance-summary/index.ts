import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const hdrs = { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey };

    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split('T')[0];
    const ago14 = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

    const startDate = body.start_date || ago14;
    const endDate = body.end_date || today;
    const raceType = body.race_type || 'all';
    const modelFilter = body.model || 'all';
    const signalFilter = body.signal || 'all';

    // ── 1. Fetch races ──
    const racesRes = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date,off_time,course_name,type,surface&date=gte.${startDate}&date=lte.${endDate}&limit=2000`,
      { headers: hdrs },
    );
    let races: any[] = racesRes.ok ? await racesRes.json() : [];

    if (raceType !== 'all') races = filterByRaceType(races, raceType);
    if (races.length === 0) return json({ data: emptyData({ startDate, endDate, raceType, modelFilter, signalFilter }) });

    const raceIds = races.map((r: any) => r.race_id);
    const raceMeta: Record<string, { date: string; course: string; off_time: string }> = {};
    for (const r of races) {
      raceMeta[r.race_id] = { date: r.date, course: r.course_name, off_time: r.off_time };
    }

    // ── 2. Fetch entries, runners, ml_results in parallel ──
    const ENTRY_COLS = 'race_id,horse_id,horse_name,finishing_position,current_odds,opening_odds,jockey_name,trainer_name,mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba,rpr,ts,horse_win_percentage_at_distance,trainer_win_percentage_at_course,trainer_21_days_win_percentage,best_speed_figure_at_distance,last_speed_figure,mean_speed_figure,best_speed_figure_on_course_going_distance,best_speed_figure_at_track,comment';

    const [entries, runners, mlResults] = await Promise.all([
      fetchBatch(supabaseUrl, 'race_entries', ENTRY_COLS, raceIds, hdrs),
      fetchBatch(supabaseUrl, 'race_runners', 'race_id,horse,position,sp,sp_dec,jockey,trainer', raceIds, hdrs),
      fetchBatch(supabaseUrl, 'ml_model_race_results', 'race_id,model_name,is_winner,is_top3,horse_id', raceIds, hdrs),
    ]);

    console.log(`Races: ${races.length}, Entries: ${entries.length}, Runners: ${runners.length}, ML: ${mlResults.length}`);

    // ── 3. Build lookup maps ──
    const spMap: Record<string, { sp: string; sp_dec: number }> = {};
    const runnerJT: Record<string, { jockey: string; trainer: string }> = {};
    for (const r of runners) {
      const key = `${r.race_id}_${bare(r.horse)}`;
      spMap[key] = { sp: r.sp || '', sp_dec: r.sp_dec || parseSP(r.sp) };
      runnerJT[key] = { jockey: r.jockey || '', trainer: r.trainer || '' };
    }

    // ── 4. ML Model Performance (aggregated + by_date) ──
    const mlAgg: Record<string, Stats> = {};
    const mlDay: Record<string, Record<string, Stats>> = {};
    const filtered = modelFilter === 'all' ? mlResults : mlResults.filter((r: any) => r.model_name?.toLowerCase() === modelFilter);

    for (const r of filtered) {
      const meta = raceMeta[r.race_id];
      if (!meta) continue;
      const mn = r.model_name;
      if (!mlAgg[mn]) mlAgg[mn] = mkStats();
      if (!mlDay[meta.date]) mlDay[meta.date] = {};
      if (!mlDay[meta.date][mn]) mlDay[meta.date][mn] = mkStats();

      const hn = findHorseName(r, entries);
      const spd = hn ? (spMap[`${r.race_id}_${hn}`]?.sp_dec || 0) : 0;
      accumStats(mlAgg[mn], r.is_winner, r.is_top3, spd);
      accumStats(mlDay[meta.date][mn], r.is_winner, r.is_top3, spd);
    }
    finStats(mlAgg);
    for (const v of Object.values(mlDay)) finStats(v);

    // ── 5. Signal Performance + Individual Picks ──
    const entriesByRace = groupBy(entries, 'race_id');
    const sigAgg: Record<string, SigStats> = {};
    const sigDay: Record<string, Record<string, SigStats>> = {};
    const picks: Pick[] = [];

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      const meta = raceMeta[raceId];
      if (!meta) continue;

      const completed = raceEntries.filter((e: any) => e.finishing_position != null);
      if (completed.length === 0) continue;

      const topPicks = getModelPicks(raceEntries, modelFilter);

      for (const entry of completed) {
        const hn = bare(entry.horse_name);
        const spInfo = spMap[`${raceId}_${hn}`] || { sp: '', sp_dec: 0 };
        const jtInfo = runnerJT[`${raceId}_${hn}`];

        const badges = topPicks.get(entry.horse_id) || [];
        const isSteaming = detectSteaming(entry, spInfo.sp_dec);
        const signals = detectSignals(entry, raceEntries, badges, isSteaming);

        if (signals.length === 0) continue;
        const won = entry.finishing_position === 1;
        const netProfit = won
          ? (spInfo.sp_dec > 0 ? Math.round((spInfo.sp_dec - 1) * 100) / 100 : 0)
          : -1;
        const cashReturned = won
          ? (spInfo.sp_dec > 0 ? Math.round(spInfo.sp_dec * 100) / 100 : 1)
          : -1;

        for (const sigKey of signals) {
          if (signalFilter !== 'all' && sigKey !== signalFilter) continue;

          if (!sigAgg[sigKey]) sigAgg[sigKey] = mkSig(sigKey);
          accumSig(sigAgg[sigKey], won, netProfit);
          if (!sigDay[meta.date]) sigDay[meta.date] = {};
          if (!sigDay[meta.date][sigKey]) sigDay[meta.date][sigKey] = mkSig(sigKey);
          accumSig(sigDay[meta.date][sigKey], won, netProfit);
        }

        // One pick row per horse (all its signals grouped)
        const filteredSignals = signalFilter !== 'all' ? signals.filter(s => s === signalFilter) : signals;
        if (filteredSignals.length > 0) {
          picks.push({
            date: meta.date,
            course: meta.course,
            off_time: meta.off_time,
            horse: entry.horse_name,
            jockey: jtInfo?.jockey || entry.jockey_name || '',
            trainer: jtInfo?.trainer || entry.trainer_name || '',
            sp: spInfo.sp,
            sp_dec: spInfo.sp_dec,
            position: entry.finishing_position,
            signals: filteredSignals,
            won,
            profit: cashReturned,
          });
        }
      }
    }

    finSig(sigAgg);
    for (const v of Object.values(sigDay)) finSig(v);

    const sortedSig = Object.values(sigAgg).sort((a, b) => b.win_rate - a.win_rate);
    const sortedSigDay: Record<string, SigStats[]> = {};
    for (const [d, s] of Object.entries(sigDay)) {
      sortedSigDay[d] = Object.values(s).sort((a, b) => b.win_rate - a.win_rate);
    }

    // Sort picks: most recent first, then by off_time
    picks.sort((a, b) => b.date.localeCompare(a.date) || a.off_time.localeCompare(b.off_time));

    console.log(`Signals: ${sortedSig.length}, Picks: ${picks.length}`);

    return json({
      data: {
        filters: { start_date: startDate, end_date: endDate, race_type: raceType, model: modelFilter, signal: signalFilter },
        dates_included: new Set(Object.values(raceMeta).map(m => m.date)).size,
        races_included: races.length,
        ml_models: { aggregated: mlAgg, by_date: mlDay },
        signals: { aggregated: sortedSig, by_date: sortedSigDay },
        picks,
      },
    });
  } catch (err) {
    console.error('performance-summary error:', err);
    return json({ data: emptyData({}) });
  }
});

// ─── Types ────────────────────────────────────────────────────────────

interface Stats { total_picks: number; wins: number; top3: number; win_rate: number; top3_rate: number; profit: number; roi_pct: number }
interface SigStats { signal_type: string; total_bets: number; wins: number; win_rate: number; profit: number; roi_pct: number }
interface Pick {
  date: string; course: string; off_time: string; horse: string;
  jockey: string; trainer: string; sp: string; sp_dec: number;
  position: number; signals: string[]; won: boolean; profit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function emptyData(f: any) {
  return { filters: f, dates_included: 0, races_included: 0, ml_models: { aggregated: {}, by_date: {} }, signals: { aggregated: [], by_date: {} }, picks: [] };
}

function filterByRaceType(races: any[], t: string) {
  const tl = t.toLowerCase();
  if (tl === 'flat') return races.filter((r: any) => r.type?.toLowerCase() === 'flat' && !isAW(r));
  if (tl === 'aw') return races.filter((r: any) => isAW(r));
  if (tl === 'hurdles') return races.filter((r: any) => r.type?.toLowerCase() === 'hurdle');
  if (tl === 'chase') return races.filter((r: any) => r.type?.toLowerCase() === 'chase');
  return races;
}

function isAW(r: any) {
  const s = (r.surface || '').toLowerCase();
  return s === 'all weather' || s === 'aw' || s.includes('polytrack') || s.includes('tapeta') || s.includes('fibresand');
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
          if (!r.ok) {
            const errText = await r.text().catch(() => '');
            console.error(`fetchBatch ${table} error: ${r.status} - ${errText.substring(0, 200)}`);
            return [];
          }
          return r.json();
        })
        .catch(err => { console.error(`fetchBatch ${table} fetch error:`, err); return []; })
    );
  }
  return (await Promise.all(promises)).flat();
}

function bare(n: string) { return (n || '').replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim(); }

function parseSP(sp: string | null): number {
  if (!sp) return 0;
  const c = sp.replace(/[^\d\/\.]/g, '');
  if (c.includes('/')) { const [n, d] = c.split('/'); return parseFloat(d) > 0 ? parseFloat(n) / parseFloat(d) + 1 : 0; }
  const v = parseFloat(c);
  return v > 0 ? v : 0;
}

function mkStats(): Stats { return { total_picks: 0, wins: 0, top3: 0, win_rate: 0, top3_rate: 0, profit: 0, roi_pct: 0 }; }
function accumStats(s: Stats, w: boolean, t3: boolean, sp: number) {
  s.total_picks++; if (w) { s.wins++; s.profit += sp > 0 ? sp - 1 : 0; } else { s.profit -= 1; } if (t3) s.top3++;
}
function finStats(m: Record<string, Stats>) {
  for (const s of Object.values(m)) {
    s.win_rate = s.total_picks > 0 ? Math.round((s.wins / s.total_picks) * 1000) / 10 : 0;
    s.top3_rate = s.total_picks > 0 ? Math.round((s.top3 / s.total_picks) * 1000) / 10 : 0;
    s.profit = Math.round(s.profit * 100) / 100; s.roi_pct = s.total_picks > 0 ? Math.round((s.profit / s.total_picks) * 1000) / 10 : 0;
  }
}

function mkSig(t: string): SigStats { return { signal_type: t, total_bets: 0, wins: 0, win_rate: 0, profit: 0, roi_pct: 0 }; }
function accumSig(s: SigStats, w: boolean, p: number) { s.total_bets++; if (w) s.wins++; s.profit += p; }
function finSig(m: Record<string, SigStats>) {
  for (const s of Object.values(m)) {
    s.win_rate = s.total_bets > 0 ? Math.round((s.wins / s.total_bets) * 1000) / 10 : 0;
    s.profit = Math.round(s.profit * 100) / 100; s.roi_pct = s.total_bets > 0 ? Math.round((s.profit / s.total_bets) * 1000) / 10 : 0;
  }
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  const m: Record<string, any[]> = {};
  for (const e of arr) { if (!m[e[key]]) m[e[key]] = []; m[e[key]].push(e); }
  return m;
}

function findHorseName(r: any, entries: any[]): string | null {
  const e = entries.find((e: any) => e.race_id === r.race_id && e.horse_id === r.horse_id);
  return e ? bare(e.horse_name) : null;
}

const MF = [
  { f: 'ensemble_proba', n: 'ensemble' }, { f: 'benter_proba', n: 'benter' },
  { f: 'mlp_proba', n: 'mlp' }, { f: 'rf_proba', n: 'rf' }, { f: 'xgboost_proba', n: 'xgboost' },
];

function getModelPicks(re: any[], modelFilter: string): Map<string, string[]> {
  const models = modelFilter === 'all' ? MF : MF.filter(md => md.n === modelFilter);
  const m = new Map<string, string[]>();
  for (const md of models) {
    let best: any = null, bp = 0;
    for (const e of re) { const p = e[md.f] || 0; if (p > bp) { bp = p; best = e; } }
    if (best) { const ex = m.get(best.horse_id) || []; ex.push(md.n); m.set(best.horse_id, ex); }
  }
  return m;
}

function detectSteaming(entry: any, spDec: number): boolean {
  const open = entry.opening_odds;
  const cur = entry.current_odds;
  // Method 1: opening_odds vs current_odds (when both available)
  if (open && cur && open > 0 && cur > 0 && cur < open * 0.8) return true;
  // Method 2: current_odds (forecast/early price) vs SP (actual starting price)
  if (cur && cur > 0 && spDec > 0 && spDec < cur * 0.85) return true;
  return false;
}

function detectCD(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const c = comment.toLowerCase();
  return /\bc\s*&\s*d\b/.test(c) || /\bcourse\s+and\s+distance\b/.test(c);
}

function detectSignals(entry: any, re: any[], badges: string[], isSteaming: boolean): string[] {
  const ml = badges.length >= 1;

  const rprs = re.map((e: any) => e.rpr || 0).filter((v: number) => v > 0);
  const topRpr = rprs.length > 0 && (entry.rpr || 0) > 0 && (entry.rpr || 0) >= Math.max(...rprs);
  const tss = re.map((e: any) => e.ts || 0).filter((v: number) => v > 0);
  const topTs = tss.length > 0 && (entry.ts || 0) > 0 && (entry.ts || 0) >= Math.max(...tss);

  const hwd = entry.horse_win_percentage_at_distance || 0;
  const twc = entry.trainer_win_percentage_at_course || 0;
  const cs = hwd >= 20 || (hwd >= 10 && twc >= 15);
  const tf = (entry.trainer_21_days_win_percentage || 0) >= 15;

  const ff = re.map((e: any) => e.best_speed_figure_at_distance || e.last_speed_figure || e.mean_speed_figure || 0).filter((v: number) => v > 0);
  const fa = ff.length > 0 ? ff.reduce((a: number, b: number) => a + b, 0) / ff.length : 0;
  const bf = entry.best_speed_figure_on_course_going_distance || entry.best_speed_figure_at_distance || entry.best_speed_figure_at_track || 0;
  const ss = fa > 0 && bf > 0 && ((bf - fa) / fa) * 100 >= 5;

  // C&D specialist from comment text
  const isCD = detectCD(entry.comment);

  // Value bet: AI probability exceeds bookmaker implied probability
  const ensProb = entry.ensemble_proba || 0;
  const totalEns = re.reduce((s: number, e: any) => s + (e.ensemble_proba || 0), 0);
  const normProb = totalEns > 0 ? ensProb / totalEns : 0;
  const curOdds = entry.current_odds || 0;
  const impliedProb = curOdds > 1 ? 1 / curOdds : 0;
  const valueEdge = impliedProb > 0 ? normProb - impliedProb : 0;
  const isValue = valueEdge >= 0.05;

  const f: Record<string, boolean> = {
    triple_signal: isSteaming && ml && (topRpr || topTs),
    steamer_ml_pick: isSteaming && ml,
    steamer_trainer_form: isSteaming && tf,
    ml_ratings_consensus: ml && topRpr && topTs,
    ml_pick_top_rpr: ml && topRpr,
    ml_pick_course_specialist: ml && cs,
    ml_pick_trainer_form: ml && tf,
    ratings_consensus: topRpr && topTs,
    ml_top_pick: ml,
    top_rpr: topRpr,
    top_ts: topTs,
    steamer: isSteaming,
    course_specialist: cs,
    trainer_form: tf,
    speed_standout: ss,
    value_bet: isValue,
    value_ml_pick: isValue && ml,
    value_backed: isValue && isSteaming,
    value_top_rated: isValue && (topRpr || topTs),
    value_ml_backed: isValue && ml && isSteaming,
    value_ml_top_rated: isValue && ml && (topRpr || topTs),
    value_ml_backed_rated: isValue && ml && isSteaming && (topRpr || topTs),
    cd_specialist: isCD,
    cd_ml_pick: isCD && ml,
    cd_value: isCD && isValue,
    cd_backed: isCD && isSteaming,
    cd_ml_value: isCD && ml && isValue,
    cd_ml_backed: isCD && ml && isSteaming,
    cd_top_rated: isCD && (topRpr || topTs),
  };

  return Object.entries(f).filter(([, v]) => v).map(([k]) => k);
}
