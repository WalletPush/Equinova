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
    const minBets = body.min_bets ?? 10;
    const today = new Date().toISOString().split('T')[0];
    const startDate = '2024-01-01';

    console.log(`combo-scanner: ${startDate} to ${today}, min_bets=${minBets}`);

    // ══════════════════════════════════════════════════════════════════
    //  PHASE A — Find top profitable combinations per race type
    // ══════════════════════════════════════════════════════════════════

    // 1. Fetch ALL historical races at once
    const racesRes = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date,off_time,course_name,type,surface&date=gte.${startDate}&date=lte.${today}&limit=5000`,
      { headers: hdrs },
    );
    const allRaces: any[] = racesRes.ok ? await racesRes.json() : [];
    if (allRaces.length === 0) return json({ data: { top_combinations: [], today_matches: [] } });

    const allRaceIds = allRaces.map((r: any) => r.race_id);

    // 2. Fetch entries and runners for ALL races
    const ENTRY_COLS = 'race_id,horse_id,horse_name,finishing_position,current_odds,opening_odds,jockey_name,trainer_name,silk_url,mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba,rpr,ts,horse_win_percentage_at_distance,trainer_win_percentage_at_course,trainer_21_days_win_percentage,best_speed_figure_at_distance,last_speed_figure,mean_speed_figure,best_speed_figure_on_course_going_distance,best_speed_figure_at_track,comment';

    const [allEntries, runners] = await Promise.all([
      fetchBatch(supabaseUrl, 'race_entries', ENTRY_COLS, allRaceIds, hdrs),
      fetchBatch(supabaseUrl, 'race_runners', 'race_id,horse,position,sp,sp_dec', allRaceIds, hdrs),
    ]);

    console.log(`Fetched ${allRaces.length} races, ${allEntries.length} entries, ${runners.length} runners`);

    // 3. Build SP lookup
    const spMap: Record<string, number> = {};
    for (const r of runners) {
      const key = `${r.race_id}_${bare(r.horse)}`;
      spMap[key] = r.sp_dec || parseSP(r.sp);
    }

    // 4. Classify races by type and compute signals per type
    const RACE_TYPES = ['flat', 'aw', 'hurdles', 'chase'] as const;

    interface Combo { race_type: string; signal: string; label: string; total_bets: number; wins: number; win_rate: number; profit: number; roi_pct: number }
    const topCombos: Combo[] = [];

    const raceTypeMap: Record<string, string> = {};
    for (const r of allRaces) {
      raceTypeMap[r.race_id] = classifyRaceType(r);
    }

    const entriesByRace = groupBy(allEntries, 'race_id');

    for (const rt of RACE_TYPES) {
      const rtRaceIds = new Set(
        allRaces.filter((r: any) => classifyRaceType(r) === rt).map((r: any) => r.race_id),
      );
      if (rtRaceIds.size === 0) continue;

      const sigAgg: Record<string, SigStats> = {};

      for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
        if (!rtRaceIds.has(raceId)) continue;

        const completed = raceEntries.filter((e: any) => e.finishing_position != null);
        if (completed.length === 0) continue;

        const topPicks = getModelPicks(raceEntries);

        for (const entry of completed) {
          const hn = bare(entry.horse_name);
          const spDec = spMap[`${raceId}_${hn}`] || 0;
          const badges = topPicks.get(entry.horse_id) || [];
          const isSteaming = detectSteaming(entry, spDec);
          const signals = detectSignals(entry, raceEntries, badges, isSteaming);

          if (signals.length === 0) continue;
          const won = entry.finishing_position === 1;
          const netProfit = won ? (spDec > 0 ? Math.round((spDec - 1) * 100) / 100 : 0) : -1;

          for (const sigKey of signals) {
            if (!sigAgg[sigKey]) sigAgg[sigKey] = mkSig(sigKey);
            accumSig(sigAgg[sigKey], won, netProfit);
          }
        }
      }

      finSig(sigAgg);

      for (const s of Object.values(sigAgg)) {
        if (s.total_bets >= minBets && s.profit > 0) {
          topCombos.push({
            race_type: rt,
            signal: s.signal_type,
            label: SIGNAL_LABELS[s.signal_type] || s.signal_type,
            total_bets: s.total_bets,
            wins: s.wins,
            win_rate: s.win_rate,
            profit: s.profit,
            roi_pct: s.roi_pct,
          });
        }
      }
    }

    topCombos.sort((a, b) => b.roi_pct - a.roi_pct);
    console.log(`Phase A: ${topCombos.length} profitable combos found`);

    // ══════════════════════════════════════════════════════════════════
    //  PHASE B — Match today's runners against top combos
    // ══════════════════════════════════════════════════════════════════

    const todayRaces = allRaces.filter((r: any) => r.date === today);
    if (todayRaces.length === 0) {
      return json({ data: { top_combinations: topCombos, today_matches: [] } });
    }

    const todayRaceIds = new Set(todayRaces.map((r: any) => r.race_id));

    // Build a fast lookup: race_type -> Set<signal>
    const profitableLookup: Record<string, Set<string>> = {};
    for (const c of topCombos) {
      if (!profitableLookup[c.race_type]) profitableLookup[c.race_type] = new Set();
      profitableLookup[c.race_type].add(c.signal);
    }

    const comboByKey: Record<string, Combo> = {};
    for (const c of topCombos) comboByKey[`${c.race_type}__${c.signal}`] = c;

    interface TodayMatch {
      horse_name: string; horse_id: string; race_id: string;
      course: string; off_time: string; race_type: string;
      jockey: string; trainer: string; current_odds: number;
      silk_url: string | null; finishing_position: number | null;
      matching_combos: Combo[]; model_picks: string[];
    }

    const todayMatches: TodayMatch[] = [];

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      if (!todayRaceIds.has(raceId)) continue;

      const race = todayRaces.find((r: any) => r.race_id === raceId);
      if (!race) continue;

      const rt = classifyRaceType(race);
      const profitableSignals = profitableLookup[rt];
      if (!profitableSignals || profitableSignals.size === 0) continue;

      const topPicks = getModelPicks(raceEntries);

      for (const entry of raceEntries) {
        const badges = topPicks.get(entry.horse_id) || [];
        const isSteaming = detectSteaming(entry, 0);
        const signals = detectSignals(entry, raceEntries, badges, isSteaming);

        const matchedCombos: Combo[] = [];
        for (const sig of signals) {
          if (profitableSignals.has(sig)) {
            const combo = comboByKey[`${rt}__${sig}`];
            if (combo) matchedCombos.push(combo);
          }
        }

        if (matchedCombos.length === 0) continue;

        matchedCombos.sort((a, b) => b.roi_pct - a.roi_pct);

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
          finishing_position: entry.finishing_position ?? null,
          matching_combos: matchedCombos,
          model_picks: badges,
        });
      }
    }

    todayMatches.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''));
    console.log(`Phase B: ${todayMatches.length} matches for today`);

    return json({
      data: {
        top_combinations: topCombos,
        today_matches: todayMatches,
        meta: {
          historical_races: allRaces.length,
          historical_entries: allEntries.length,
          today_races: todayRaces.length,
          min_bets_threshold: minBets,
          generated_at: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('combo-scanner error:', err);
    return json({ error: { message: (err as Error).message } }, 500);
  }
});

// ─── Signal labels (same as frontend) ──────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  cd_ml_value: 'C&D + ML Pick + Value',
  cd_ml_backed: 'C&D + ML Pick + Backed',
  cd_ml_pick: 'C&D + ML Pick',
  cd_value: 'C&D + Value Bet',
  cd_backed: 'C&D + Backed',
  cd_top_rated: 'C&D + Top Rated',
  cd_specialist: 'C&D Specialist',
  value_ml_backed_rated: 'Value + ML + Backed + Top Rated',
  value_ml_top_rated: 'Value + ML Pick + Top Rated',
  value_ml_backed: 'Value + ML Pick + Backed',
  value_ml_pick: 'Value + ML Pick',
  value_top_rated: 'Value + Top Rated',
  value_bet: 'Value Bet (AI Edge)',
  value_backed: 'Value + Backed',
  triple_signal: 'Triple Signal (Backed + ML + Top Rated)',
  steamer_ml_pick: 'Backed + ML Pick',
  steamer_trainer_form: 'Backed + Trainer in Form',
  ml_ratings_consensus: 'ML Pick + Top RPR + Top TS',
  ml_pick_top_rpr: 'ML Pick + Top RPR',
  ml_pick_course_specialist: 'ML Pick + Course Specialist',
  ml_pick_trainer_form: 'ML Pick + Trainer in Form',
  ratings_consensus: 'Top RPR + Top TS',
  ml_top_pick: 'ML Top Pick',
  top_rpr: 'Top RPR in Field',
  top_ts: 'Top Topspeed in Field',
  steamer: 'Backed (Odds Shortening)',
  course_specialist: 'Course Specialist',
  trainer_form: 'Trainer in Form (21d)',
  speed_standout: 'Speed Figure Standout',
};

// ─── Types ─────────────────────────────────────────────────────────────

interface SigStats { signal_type: string; total_bets: number; wins: number; win_rate: number; profit: number; roi_pct: number }

// ─── Helpers (same as performance-summary) ─────────────────────────────

function classifyRaceType(r: any): string {
  if (isAW(r)) return 'aw';
  const t = (r.type || '').toLowerCase();
  if (t === 'flat') return 'flat';
  if (t === 'hurdle') return 'hurdles';
  if (t === 'chase') return 'chase';
  return 'flat';
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
          if (!r.ok) { console.error(`fetchBatch ${table}: ${r.status}`); return []; }
          return r.json();
        })
        .catch(err => { console.error(`fetchBatch ${table}:`, err); return []; }),
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

function mkSig(t: string): SigStats { return { signal_type: t, total_bets: 0, wins: 0, win_rate: 0, profit: 0, roi_pct: 0 }; }
function accumSig(s: SigStats, w: boolean, p: number) { s.total_bets++; if (w) s.wins++; s.profit += p; }
function finSig(m: Record<string, SigStats>) {
  for (const s of Object.values(m)) {
    s.win_rate = s.total_bets > 0 ? Math.round((s.wins / s.total_bets) * 1000) / 10 : 0;
    s.profit = Math.round(s.profit * 100) / 100;
    s.roi_pct = s.total_bets > 0 ? Math.round((s.profit / s.total_bets) * 1000) / 10 : 0;
  }
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
    for (const e of re) { const p = e[md.f] || 0; if (p > bp) { bp = p; best = e; } }
    if (best) { const ex = m.get(best.horse_id) || []; ex.push(md.n); m.set(best.horse_id, ex); }
  }
  return m;
}

function detectSteaming(entry: any, spDec: number): boolean {
  const open = entry.opening_odds;
  const cur = entry.current_odds;
  if (open && cur && open > 0 && cur > 0 && cur < open * 0.8) return true;
  if (cur && cur > 0 && spDec > 0 && spDec < cur * 0.85) return true;
  return false;
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

  const isCD = detectCD(entry.comment);

  const ensProb = entry.ensemble_proba || 0;
  const totalEns = re.reduce((s: number, e: any) => s + (e.ensemble_proba || 0), 0);
  const normProb = totalEns > 0 ? ensProb / totalEns : 0;
  const curOdds = entry.current_odds || 0;
  const impliedProb = curOdds > 1 ? 1 / curOdds : 0;
  const isValue = impliedProb > 0 && (normProb - impliedProb) >= 0.05;

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

function detectCD(comment: string | null | undefined): boolean {
  if (!comment) return false;
  const c = comment.toLowerCase();
  return /\bc\s*&\s*d\b/.test(c) || /\bcourse\s+and\s+distance\b/.test(c);
}
