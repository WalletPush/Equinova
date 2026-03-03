Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase credentials');

    const body = await req.json().catch(() => ({}));

    // Default to 14 days if dates not provided
    const today = new Date().toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const {
      start_date = fourteenDaysAgo,
      end_date = today,
      race_type = 'all',
      model = 'all',
      signal = 'all',
    } = body;

    console.log(`Performance summary request: ${start_date} to ${end_date}, type=${race_type}, model=${model}, signal=${signal}`);

    const authHeaders = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
    };

    // ─── Step 1: Fetch races in date range with optional type filter ───
    let racesUrl = `${supabaseUrl}/rest/v1/races?select=race_id,date,type,surface&date=gte.${start_date}&date=lte.${end_date}&order=date.desc&limit=2000`;

    const racesRes = await fetch(racesUrl, { headers: authHeaders });
    if (!racesRes.ok) {
      const errorText = await racesRes.text();
      console.error(`Failed to fetch races: ${racesRes.status} - ${errorText}`);
      throw new Error(`Failed to fetch races: ${racesRes.status}`);
    }
    let races: any[] = await racesRes.json();
    console.log(`Found ${races.length} races in date range`);

    // Apply race type filter
    if (race_type !== 'all') {
      races = filterByRaceType(races, race_type);
    }

    if (races.length === 0) {
      return new Response(JSON.stringify({
        data: emptyResponse(body),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const raceIds = races.map((r: any) => r.race_id);
    const raceDateMap: Record<string, string> = {};
    const raceTypeMap: Record<string, { type: string; surface: string }> = {};
    for (const r of races) {
      raceDateMap[r.race_id] = r.date;
      raceTypeMap[r.race_id] = { type: r.type, surface: r.surface };
    }

    // ─── Step 2: Fetch ML model race results ───────────────────────────
    const mlResults = await fetchInBatches(supabaseUrl, 'ml_model_race_results',
      'race_id,model_name,is_winner,is_top3,predicted_probability,actual_position',
      raceIds, 'race_id', authHeaders);
    console.log(`Fetched ${mlResults.length} ML model results`);

    const filteredMl = model === 'all'
      ? mlResults
      : mlResults.filter((r: any) => r.model_name?.toLowerCase() === model.toLowerCase());

    // ─── Step 3: Fetch race entries with finishing positions ────────────
    const entries = await fetchInBatches(supabaseUrl, 'race_entries',
      'race_id,horse_id,horse_name,finishing_position,current_odds,mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba,rpr,ts,odds_movement,odds_movement_pct,horse_win_percentage_at_distance,trainer_win_percentage_at_course,trainer_21_days_win_percentage,best_speed_figure_at_distance,last_speed_figure,mean_speed_figure,best_speed_figure_on_course_going_distance,best_speed_figure_at_track',
      raceIds, 'race_id', authHeaders);
    console.log(`Fetched ${entries.length} race entries`);

    // ─── Step 4: Fetch race runners for SP data ────────────────────────
    const runners = await fetchInBatches(supabaseUrl, 'race_runners',
      'race_id,horse,position,sp',
      raceIds, 'race_id', authHeaders);
    console.log(`Fetched ${runners.length} race runners`);

    // Build SP lookup: race_id+horse_lower → decimal SP
    const spMap: Record<string, number> = {};
    for (const r of runners) {
      const key = `${r.race_id}_${bareHorseName(r.horse)}`;
      spMap[key] = parseSP(r.sp);
    }

    // ─── Step 5: Compute ML Model Performance ──────────────────────────
    const mlAggregated: Record<string, ModelStats> = {};
    const mlByDate: Record<string, Record<string, ModelStats>> = {};

    for (const result of filteredMl) {
      const date = raceDateMap[result.race_id];
      if (!date) continue;

      const mn = result.model_name;
      if (!mlAggregated[mn]) mlAggregated[mn] = newModelStats();
      if (!mlByDate[date]) mlByDate[date] = {};
      if (!mlByDate[date][mn]) mlByDate[date][mn] = newModelStats();

      const horseName = getModelPickHorseName(result, entries);
      const sp = horseName ? spMap[`${result.race_id}_${horseName}`] : 0;

      accumulateModelStats(mlAggregated[mn], result, sp);
      accumulateModelStats(mlByDate[date][mn], result, sp);
    }

    finalizeAllModelStats(mlAggregated);
    for (const date of Object.keys(mlByDate)) {
      finalizeAllModelStats(mlByDate[date]);
    }

    // ─── Step 6: Compute Signal Performance ────────────────────────────
    const entriesByRace = groupByRace(entries);
    const signalAggregated: Record<string, SignalStats> = {};
    const signalByDate: Record<string, Record<string, SignalStats>> = {};

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      const date = raceDateMap[raceId];
      if (!date) continue;

      const completedEntries = raceEntries.filter((e: any) => e.finishing_position != null);
      if (completedEntries.length === 0) continue;

      const modelPicks = getModelPicksForRace(raceEntries);

      for (const entry of completedEntries) {
        const badges = modelPicks.get(entry.horse_id) || [];
        const signals = detectSignals(entry, raceEntries, badges);

        for (const sigKey of signals) {
          if (signal !== 'all' && sigKey !== signal) continue;

          const spKey = `${raceId}_${bareHorseName(entry.horse_name)}`;
          const sp = spMap[spKey] || 0;
          const isWinner = entry.finishing_position === 1;
          const profit = isWinner && sp > 0 ? sp - 1 : -1;

          if (!signalAggregated[sigKey]) signalAggregated[sigKey] = newSignalStats(sigKey);
          accumulateSignalStats(signalAggregated[sigKey], isWinner, profit);

          if (!signalByDate[date]) signalByDate[date] = {};
          if (!signalByDate[date][sigKey]) signalByDate[date][sigKey] = newSignalStats(sigKey);
          accumulateSignalStats(signalByDate[date][sigKey], isWinner, profit);
        }
      }
    }

    finalizeAllSignalStats(signalAggregated);
    for (const date of Object.keys(signalByDate)) {
      finalizeAllSignalStats(signalByDate[date]);
    }

    // Sort aggregated signals by win rate
    const sortedSignals = Object.values(signalAggregated)
      .sort((a, b) => b.win_rate - a.win_rate);

    const sortedSignalByDate: Record<string, SignalStats[]> = {};
    for (const [date, sigs] of Object.entries(signalByDate)) {
      sortedSignalByDate[date] = Object.values(sigs).sort((a, b) => b.win_rate - a.win_rate);
    }

    // ─── Step 7: Build response ────────────────────────────────────────
    const uniqueDates = new Set(Object.values(raceDateMap));

    return new Response(JSON.stringify({
      data: {
        filters: { start_date, end_date, race_type, model, signal },
        dates_included: uniqueDates.size,
        races_included: races.length,
        ml_models: {
          aggregated: mlAggregated,
          by_date: mlByDate,
        },
        signals: {
          aggregated: sortedSignals,
          by_date: sortedSignalByDate,
        },
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Performance summary error:', error);
    // Return 200 with error info in data to avoid Supabase client FunctionsHttpError
    return new Response(JSON.stringify({
      data: {
        filters: {},
        dates_included: 0,
        races_included: 0,
        ml_models: { aggregated: {}, by_date: {} },
        signals: { aggregated: [], by_date: {} },
        error_message: error?.message || 'Unknown error',
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Types ───────────────────────────────────────────────────────────────

interface ModelStats {
  total_picks: number;
  wins: number;
  top3: number;
  win_rate: number;
  top3_rate: number;
  profit: number;
  roi_pct: number;
}

interface SignalStats {
  signal_type: string;
  total_bets: number;
  wins: number;
  win_rate: number;
  profit: number;
  roi_pct: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function emptyResponse(filters: any) {
  return {
    filters,
    dates_included: 0,
    races_included: 0,
    ml_models: { aggregated: {}, by_date: {} },
    signals: { aggregated: [], by_date: {} },
  };
}

function filterByRaceType(races: any[], raceType: string): any[] {
  switch (raceType.toLowerCase()) {
    case 'flat':
      return races.filter((r: any) =>
        r.type?.toLowerCase() === 'flat' && r.surface?.toLowerCase() !== 'all weather'
      );
    case 'aw':
      return races.filter((r: any) =>
        r.surface?.toLowerCase() === 'all weather' ||
        r.surface?.toLowerCase() === 'aw' ||
        r.surface?.toLowerCase()?.includes('polytrack') ||
        r.surface?.toLowerCase()?.includes('tapeta') ||
        r.surface?.toLowerCase()?.includes('fibresand')
      );
    case 'hurdles':
      return races.filter((r: any) => r.type?.toLowerCase() === 'hurdle');
    case 'chase':
      return races.filter((r: any) => r.type?.toLowerCase() === 'chase');
    default:
      return races;
  }
}

async function fetchInBatches(
  supabaseUrl: string,
  table: string,
  select: string,
  ids: string[],
  idField: string,
  headers: Record<string, string>,
): Promise<any[]> {
  if (ids.length === 0) return [];
  const batchSize = 50;
  let all: any[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const inFilter = `in.(${batch.map(id => `"${id}"`).join(',')})`;
    const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&${idField}=${inFilter}&limit=5000`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        all = all.concat(data);
      } else {
        console.error(`Batch fetch ${table} failed: ${res.status} for batch ${i / batchSize + 1}`);
      }
    } catch (err) {
      console.error(`Batch fetch ${table} error:`, err);
    }
  }
  return all;
}

function bareHorseName(name: string): string {
  return (name || '').replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim();
}

function parseSP(sp: string | null): number {
  if (!sp) return 0;
  const clean = sp.replace(/[^\d\/\.]/g, '');
  if (clean.includes('/')) {
    const [num, den] = clean.split('/');
    const n = parseFloat(num);
    const d = parseFloat(den);
    if (d > 0) return n / d + 1;
    return 0;
  }
  const val = parseFloat(clean);
  return val > 0 ? val : 0;
}

function newModelStats(): ModelStats {
  return { total_picks: 0, wins: 0, top3: 0, win_rate: 0, top3_rate: 0, profit: 0, roi_pct: 0 };
}

function accumulateModelStats(stats: ModelStats, result: any, sp: number) {
  stats.total_picks++;
  if (result.is_winner) {
    stats.wins++;
    stats.profit += sp > 0 ? sp - 1 : 0;
  } else {
    stats.profit -= 1;
  }
  if (result.is_top3) stats.top3++;
}

function finalizeAllModelStats(map: Record<string, ModelStats>) {
  for (const stats of Object.values(map)) {
    stats.win_rate = stats.total_picks > 0 ? Math.round((stats.wins / stats.total_picks) * 1000) / 10 : 0;
    stats.top3_rate = stats.total_picks > 0 ? Math.round((stats.top3 / stats.total_picks) * 1000) / 10 : 0;
    stats.profit = Math.round(stats.profit * 100) / 100;
    stats.roi_pct = stats.total_picks > 0 ? Math.round((stats.profit / stats.total_picks) * 1000) / 10 : 0;
  }
}

function newSignalStats(signalType: string): SignalStats {
  return { signal_type: signalType, total_bets: 0, wins: 0, win_rate: 0, profit: 0, roi_pct: 0 };
}

function accumulateSignalStats(stats: SignalStats, isWinner: boolean, profit: number) {
  stats.total_bets++;
  if (isWinner) stats.wins++;
  stats.profit += profit;
}

function finalizeAllSignalStats(map: Record<string, SignalStats>) {
  for (const stats of Object.values(map)) {
    stats.win_rate = stats.total_bets > 0 ? Math.round((stats.wins / stats.total_bets) * 1000) / 10 : 0;
    stats.profit = Math.round(stats.profit * 100) / 100;
    stats.roi_pct = stats.total_bets > 0 ? Math.round((stats.profit / stats.total_bets) * 1000) / 10 : 0;
  }
}

function groupByRace(entries: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const e of entries) {
    if (!map[e.race_id]) map[e.race_id] = [];
    map[e.race_id].push(e);
  }
  return map;
}

function getModelPickHorseName(mlResult: any, entries: any[]): string | null {
  const match = entries.find((e: any) =>
    e.race_id === mlResult.race_id && e.horse_id === mlResult.horse_id
  );
  return match ? bareHorseName(match.horse_name) : null;
}

const MODEL_FIELDS = [
  { field: 'ensemble_proba', name: 'ensemble' },
  { field: 'benter_proba', name: 'benter' },
  { field: 'mlp_proba', name: 'mlp' },
  { field: 'rf_proba', name: 'rf' },
  { field: 'xgboost_proba', name: 'xgboost' },
];

function getModelPicksForRace(raceEntries: any[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of MODEL_FIELDS) {
    let bestEntry: any = null;
    let bestProba = 0;
    for (const e of raceEntries) {
      const p = e[m.field] || 0;
      if (p > bestProba) {
        bestProba = p;
        bestEntry = e;
      }
    }
    if (bestEntry) {
      const existing = map.get(bestEntry.horse_id) || [];
      existing.push(m.name);
      map.set(bestEntry.horse_id, existing);
    }
  }
  return map;
}

function detectSignals(entry: any, raceEntries: any[], badges: string[]): string[] {
  const isMLTopPick = badges.length >= 1;
  const isSteaming = entry.odds_movement === 'steaming';

  const rprs = raceEntries.map((e: any) => e.rpr || 0).filter((v: number) => v > 0);
  const isTopRpr = rprs.length > 0 && (entry.rpr || 0) > 0 && (entry.rpr || 0) >= Math.max(...rprs);

  const tss = raceEntries.map((e: any) => e.ts || 0).filter((v: number) => v > 0);
  const isTopTs = tss.length > 0 && (entry.ts || 0) > 0 && (entry.ts || 0) >= Math.max(...tss);

  const horseWinDist = entry.horse_win_percentage_at_distance || 0;
  const trainerWinCourse = entry.trainer_win_percentage_at_course || 0;
  const isCourseSpec = horseWinDist >= 20 || (horseWinDist >= 10 && trainerWinCourse >= 15);

  const t21 = entry.trainer_21_days_win_percentage || 0;
  const isTrainerForm = t21 >= 15;

  const fieldFigs = raceEntries
    .map((e: any) => e.best_speed_figure_at_distance || e.last_speed_figure || e.mean_speed_figure || 0)
    .filter((v: number) => v > 0);
  const fieldAvg = fieldFigs.length > 0 ? fieldFigs.reduce((a: number, b: number) => a + b, 0) / fieldFigs.length : 0;
  const bestFig = entry.best_speed_figure_on_course_going_distance
    || entry.best_speed_figure_at_distance
    || entry.best_speed_figure_at_track
    || 0;
  const isSpeedStandout = fieldAvg > 0 && bestFig > 0 && ((bestFig - fieldAvg) / fieldAvg) * 100 >= 5;

  const flags: Record<string, boolean> = {
    triple_signal: isSteaming && isMLTopPick && (isTopRpr || isTopTs),
    steamer_ml_pick: isSteaming && isMLTopPick,
    steamer_trainer_form: isSteaming && isTrainerForm,
    ml_ratings_consensus: isMLTopPick && isTopRpr && isTopTs,
    ml_pick_top_rpr: isMLTopPick && isTopRpr,
    ml_pick_course_specialist: isMLTopPick && isCourseSpec,
    ml_pick_trainer_form: isMLTopPick && isTrainerForm,
    ratings_consensus: isTopRpr && isTopTs,
    steamer_single_trainer: false, // No single trainer data at this level
    single_trainer_in_form: false,
    ml_top_pick: isMLTopPick,
    top_rpr: isTopRpr,
    top_ts: isTopTs,
    steamer: isSteaming,
    course_specialist: isCourseSpec,
    trainer_form: isTrainerForm,
    jockey_form: (entry.jockey_21_days_win_percentage || 0) >= 15,
    speed_standout: isSpeedStandout,
    steamer_jockey_form: isSteaming && (entry.jockey_21_days_win_percentage || 0) >= 15,
    backed_trainer_form: isSteaming && isTrainerForm,
    backed_ml_pick: isSteaming && isMLTopPick,
    backed_single_trainer: false,
  };

  return Object.entries(flags)
    .filter(([_, v]) => v)
    .map(([k]) => k);
}
