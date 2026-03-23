/**
 * EquiNOVA Mastermind Scanner -- Edge Function
 *
 * Computes 80+ atomic signals for today's entries, matches them against
 * lifetime profitable patterns from mastermind_patterns (split by segment),
 * and returns pattern matches with quality scores for each runner.
 *
 * Informational only -- no blocking, no anti-patterns, no vetoing.
 * Shows how many lifetime profitable patterns each runner matches.
 */

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const hdrs: Record<string, string> = {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    };

    let targetDate: string;
    try {
      const body = await req.json().catch(() => ({}));
      targetDate = body?.date || new Date().toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      });
    } catch {
      targetDate = new Date().toLocaleDateString("en-CA", {
        timeZone: "Europe/London",
      });
    }
    const today = targetDate;

    console.log(`mastermind-scanner: date=${today}`);

    // -- Load ALL active patterns (lifetime + 21-day) --
    const patternCols = "id,pattern_label,signal_keys,segment,pattern_type,total_bets,wins,win_rate,roi_pct,stability_windows,outlier_trimmed_roi,max_drawdown,drawdown_health,d21_bets,d21_wins,d21_roi_pct,d21_profit,status";
    const patternBase = `${supabaseUrl}/rest/v1/mastermind_patterns?select=${patternCols}&status=eq.ACTIVE&order=roi_pct.desc`;
    const allPatterns: MastermindPattern[] = [];
    for (let page = 0; page < 5; page++) {
      const from = page * 1000;
      const to = from + 999;
      const res = await fetch(patternBase, {
        headers: { ...hdrs, Range: `${from}-${to}` },
      });
      if (!res.ok) break;
      const batch: MastermindPattern[] = await res.json();
      allPatterns.push(...batch);
      if (batch.length < 1000) break;
    }

    const lifetimePatterns = allPatterns.filter(p => p.pattern_type === "PROFITABLE");
    const d21Patterns = allPatterns.filter(p => p.pattern_type === "21DAY_PROFITABLE");
    console.log(`Loaded ${lifetimePatterns.length} lifetime + ${d21Patterns.length} 21-day patterns`);

    // -- Load today's races + entries --
    const racesRes = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,date,off_time,course_name,type,surface&date=eq.${today}&limit=200`,
      { headers: hdrs }
    );
    const todayRaces: Race[] = racesRes.ok ? await racesRes.json() : [];

    if (todayRaces.length === 0) {
      return json({
        data: {
          matches: [],
          patterns_loaded: allPatterns.length,
          lifetime_patterns_loaded: lifetimePatterns.length,
          d21_patterns_loaded: d21Patterns.length,
          meta: {
            today_races: 0,
            generated_at: new Date().toISOString(),
          },
        },
      });
    }

    const raceIds = todayRaces.map((r) => r.race_id);

    const ENTRY_COLS = [
      "race_id", "horse_id", "horse_name", "finishing_position",
      "current_odds", "opening_odds", "jockey_name", "trainer_name",
      "jockey_id", "trainer_id", "owner_id",
      "silk_url", "number",
      "rf_proba", "xgboost_proba", "benter_proba", "ensemble_proba",
      "stage1_proba",
      "rpr", "ts", "ofr",
      "horse_win_percentage_at_distance", "horse_ae_at_distance",
      "trainer_win_percentage_at_course", "trainer_21_days_win_percentage",
      "trainer_win_percentage_at_distance",
      "trainer_avg_finishing_position_at_course",
      "jockey_21_days_win_percentage", "jockey_win_percentage_at_distance",
      "best_speed_figure_at_distance", "last_speed_figure", "mean_speed_figure",
      "best_speed_figure_on_course_going_distance", "best_speed_figure_at_track",
      "avg_finishing_position", "avg_ovr_btn",
      "comment", "last_run",
    ].join(",");

    const entries = await fetchBatch(
      supabaseUrl, "race_entries", ENTRY_COLS, raceIds, hdrs
    );
    console.log(`Fetched ${todayRaces.length} races, ${entries.length} entries`);

    const entriesByRace = groupBy(entries, "race_id");

    // -- Compute signals + match patterns for each runner --
    const allMatches: MastermindMatch[] = [];

    for (const [raceId, raceEntries] of Object.entries(entriesByRace)) {
      const race = todayRaces.find((r) => r.race_id === raceId);
      if (!race) continue;

      const segment = classifySegment(race);
      const fieldSize = raceEntries.length;

      const trainerCounts = new Map<string, number>();
      for (const e of raceEntries) {
        const tid = e.trainer_id || "";
        if (tid) trainerCounts.set(tid, (trainerCounts.get(tid) || 0) + 1);
      }

      for (const entry of raceEntries) {
        const signals = computeSignals(
          entry, raceEntries, fieldSize, segment,
          trainerCounts.get(entry.trainer_id || "") || 0
        );

        const signalSet = new Set(signals);

        // Match LIFETIME patterns for this segment
        const applicableLifetime = lifetimePatterns.filter(p => p.segment === segment);
        const matchedLifetime: PatternMatch[] = [];
        for (const pat of applicableLifetime) {
          const keys: string[] = Array.isArray(pat.signal_keys) ? pat.signal_keys : [];
          if (keys.length === 0) continue;
          if (keys.every((k) => signalSet.has(k))) {
            matchedLifetime.push({
              pattern_id: pat.id,
              pattern_label: pat.pattern_label,
              signal_keys: pat.signal_keys,
              status: pat.status,
              total_bets: pat.total_bets || 0,
              wins: pat.wins || 0,
              win_rate: pat.win_rate || 0,
              roi_pct: pat.roi_pct || 0,
              pattern_type: "PROFITABLE",
              stability_windows: pat.stability_windows || 0,
              outlier_trimmed_roi: pat.outlier_trimmed_roi || 0,
              drawdown_health: pat.drawdown_health || 0,
              d21_bets: pat.d21_bets || 0,
              d21_wins: pat.d21_wins || 0,
              d21_roi_pct: pat.d21_roi_pct || 0,
            });
          }
        }

        // Match 21-DAY patterns for this segment
        const applicable21d = d21Patterns.filter(p => p.segment === segment);
        const matched21d: PatternMatch[] = [];
        for (const pat of applicable21d) {
          const keys: string[] = Array.isArray(pat.signal_keys) ? pat.signal_keys : [];
          if (keys.length === 0) continue;
          if (keys.every((k) => signalSet.has(k))) {
            // Avoid duplicating patterns already matched as lifetime
            const alreadyMatched = matchedLifetime.some(
              lp => JSON.stringify(lp.signal_keys) === JSON.stringify(pat.signal_keys)
            );
            if (alreadyMatched) continue;
            matched21d.push({
              pattern_id: pat.id,
              pattern_label: pat.pattern_label,
              signal_keys: pat.signal_keys,
              status: pat.status,
              total_bets: 0,
              wins: 0,
              win_rate: 0,
              roi_pct: 0,
              pattern_type: "21DAY_PROFITABLE",
              stability_windows: 0,
              outlier_trimmed_roi: 0,
              drawdown_health: 0,
              d21_bets: pat.d21_bets || 0,
              d21_wins: pat.d21_wins || 0,
              d21_roi_pct: pat.d21_roi_pct || 0,
            });
          }
        }

        matchedLifetime.sort((a, b) => computeQuality(b) - computeQuality(a));
        matched21d.sort((a, b) => (b.d21_roi_pct || 0) - (a.d21_roi_pct || 0));

        const totalPatterns = matchedLifetime.length + matched21d.length;

        // Trust score from lifetime patterns (primary) + 21-day bonus
        let trustScore = 0;
        let trustTier = "none";
        if (matchedLifetime.length > 0) {
          const qualityScores = matchedLifetime.map(p => computeQuality(p));
          const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
          const countBonus = Math.min(20, matchedLifetime.length * 5);
          const d21Bonus = Math.min(10, matched21d.length * 3);
          trustScore = Math.max(0, Math.min(100, Math.round(avgQuality + countBonus + d21Bonus)));
        } else if (matched21d.length > 0) {
          trustScore = Math.max(0, Math.min(50, Math.round(matched21d.length * 10)));
        }

        if (trustScore >= 70) trustTier = "high";
        else if (trustScore >= 40) trustTier = "medium";
        else if (trustScore > 0) trustTier = "low";

        if (totalPatterns === 0) {
          const ensProba = n(entry.ensemble_proba);
          if (ensProba <= 0) continue;
        }

        // Bet decision computation
        const ensProba = n(entry.ensemble_proba);
        const curOdds = n(entry.current_odds);
        const openOdds = n(entry.opening_odds);
        const betOdds = openOdds > 1 ? openOdds : curOdds;
        const impliedP = betOdds > 1 ? 1 / betOdds : 0;
        const edgeRaw = impliedP > 0 ? ensProba - impliedP : 0;
        const edgePct = impliedP > 0 ? (edgeRaw / impliedP) * 100 : 0;

        // Kelly criterion: f* = edge / (odds - 1)
        // Quarter-Kelly capped at 3% — matches computeKelly() on the frontend
        const b = betOdds - 1;
        const kellyFull = b > 0 ? Math.max(0, edgeRaw / b) : 0;
        const quarterKelly = Math.min(kellyFull / 4, 0.03);

        // Kelly multiplier scales down based on trust confidence
        let kellyMultiplier = 0;
        if (trustTier === "high") kellyMultiplier = 1.0;
        else if (trustTier === "medium") kellyMultiplier = 0.75;
        else if (trustTier === "low") kellyMultiplier = 0.5;
        const stakeFraction = quarterKelly * kellyMultiplier;

        const worthBetting = edgePct >= 5 && totalPatterns > 0 && ensProba >= 0.10;

        allMatches.push({
          horse_name: entry.horse_name || "",
          horse_id: entry.horse_id,
          race_id: raceId,
          course: race.course_name || "",
          off_time: race.off_time || "",
          segment,
          current_odds: curOdds,
          opening_odds: openOdds,
          ensemble_proba: ensProba,
          silk_url: entry.silk_url || null,
          number: entry.number ?? null,
          jockey: entry.jockey_name || "",
          trainer: entry.trainer_name || "",
          lifetime_patterns: matchedLifetime.slice(0, 15),
          d21_patterns: matched21d.slice(0, 15),
          active_signals: signals,
          pattern_count: totalPatterns,
          lifetime_count: matchedLifetime.length,
          d21_count: matched21d.length,
          trust_score: trustScore,
          trust_tier: trustTier,
          edge_pct: Math.round(edgePct * 10) / 10,
          market_implied: Math.round(impliedP * 1000) / 10,
          fair_probability: Math.round(ensProba * 1000) / 10,
          kelly_multiplier: kellyMultiplier,
          stake_fraction: Math.round(stakeFraction * 10000) / 100,
          worth_betting: worthBetting,
        });
      }
    }

    allMatches.sort((a, b) => b.pattern_count - a.pattern_count);

    return json({
      data: {
        matches: allMatches,
        patterns_loaded: allPatterns.length,
        lifetime_patterns_loaded: lifetimePatterns.length,
        d21_patterns_loaded: d21Patterns.length,
        meta: {
          today_races: todayRaces.length,
          today_entries: entries.length,
          total_matches: allMatches.length,
          generated_at: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error("mastermind-scanner error:", err);
    return json({ error: String(err) }, 500);
  }
});

// =======================================================================
// Types
// =======================================================================

interface Race {
  race_id: string;
  date: string;
  off_time: string;
  course_name: string;
  type: string;
  surface: string;
}

interface MastermindPattern {
  id: string;
  pattern_label: string;
  signal_keys: string[];
  segment: string;
  pattern_type: string;
  total_bets: number;
  wins: number;
  win_rate: number;
  roi_pct: number;
  status: string;
  stability_windows: number;
  outlier_trimmed_roi: number;
  max_drawdown: number;
  drawdown_health: number;
  d21_bets: number;
  d21_wins: number;
  d21_roi_pct: number;
  d21_profit: number;
}

interface PatternMatch {
  pattern_id: string;
  pattern_label: string;
  signal_keys: string[];
  status: string;
  total_bets: number;
  wins: number;
  win_rate: number;
  roi_pct: number;
  pattern_type: string;
  stability_windows: number;
  outlier_trimmed_roi: number;
  drawdown_health: number;
  d21_bets: number;
  d21_wins: number;
  d21_roi_pct: number;
}

interface MastermindMatch {
  horse_name: string;
  horse_id: string;
  race_id: string;
  course: string;
  off_time: string;
  segment: string;
  current_odds: number;
  opening_odds: number;
  ensemble_proba: number;
  silk_url: string | null;
  number: number | null;
  jockey: string;
  trainer: string;
  lifetime_patterns: PatternMatch[];
  d21_patterns: PatternMatch[];
  active_signals: string[];
  pattern_count: number;
  lifetime_count: number;
  d21_count: number;
  trust_score: number;
  trust_tier: string;
  edge_pct: number;
  market_implied: number;
  fair_probability: number;
  kelly_multiplier: number;
  stake_fraction: number;
  worth_betting: boolean;
}

// =======================================================================
// Helpers
// =======================================================================

const n = (v: unknown): number => parseFloat(v as string) || 0;

function computeQuality(p: PatternMatch): number {
  const bets = p.total_bets || 0;
  const sampleScore = Math.min(25, (Math.log2(Math.max(bets, 1)) / Math.log2(500)) * 25);
  const wr = p.win_rate || 0;
  const winScore = Math.min(25, (wr / 40) * 25);
  const roi = p.roi_pct || 0;
  const roiScore = Math.min(25, Math.max(0, (roi / 50) * 25));
  const sw = p.stability_windows || 0;
  const stabilityScore = Math.min(15, (sw / 5) * 15);
  const dh = p.drawdown_health || 0;
  const drawdownScore = dh * 10;
  return Math.round(sampleScore + winScore + roiScore + stabilityScore + drawdownScore);
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const item of arr) {
    const k = item[key];
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}

async function fetchBatch(
  supabaseUrl: string,
  table: string,
  cols: string,
  ids: string[],
  hdrs: Record<string, string>
): Promise<any[]> {
  const results: any[] = [];
  const batchSize = 100;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const idsStr = batch.join(",");
    const url = `${supabaseUrl}/rest/v1/${table}?select=${cols}&race_id=in.(${idsStr})&limit=2000`;
    const res = await fetch(url, { headers: hdrs });
    if (res.ok) {
      const data = await res.json();
      results.push(...data);
    }
  }
  return results;
}

function classifySegment(race: Race): string {
  const surface = (race.surface || "").toLowerCase();
  const type = (race.type || "").toLowerCase();
  const isAW = ["all weather", "aw", "polytrack", "tapeta", "fibresand"].some(
    (k) => surface.includes(k)
  );
  if (isAW) return "flat_aw";
  if (type === "hurdle") return "hurdle_turf";
  if (type === "chase") return "chase_turf";
  if (type.includes("nh flat") || type.includes("bumper")) return "nh_flat_turf";
  return "flat_turf";
}

// =======================================================================
// Signal Computation (TypeScript port of mastermind_signals.py)
// =======================================================================

function computeSignals(
  entry: any,
  raceEntries: any[],
  fieldSize: number,
  segment: string,
  trainerRunnersAtMeeting: number
): string[] {
  const signals: string[] = [];

  const ensProb = n(entry.ensemble_proba);
  const lgbmProb = n(entry.benter_proba);
  const xgbProb = n(entry.xgboost_proba);
  const rfProb = n(entry.rf_proba);
  const odds = n(entry.current_odds);
  const impliedProb = odds > 1 ? 1 / odds : 0;

  const isTop = (val: number, col: string) => {
    if (val <= 0) return false;
    return raceEntries.every((e) => n(e[col]) <= val);
  };

  if (isTop(ensProb, "ensemble_proba")) signals.push("benter_top_pick");
  if (isTop(lgbmProb, "benter_proba")) signals.push("lgbm_top_pick");
  if (isTop(xgbProb, "xgboost_proba")) signals.push("xgb_top_pick");
  if (isTop(rfProb, "rf_proba")) signals.push("rf_top_pick");

  let modelTopCount = 0;
  if (signals.includes("benter_top_pick")) modelTopCount++;
  if (signals.includes("lgbm_top_pick")) modelTopCount++;
  if (signals.includes("xgb_top_pick")) modelTopCount++;
  if (signals.includes("rf_top_pick")) modelTopCount++;
  if (modelTopCount >= 2) signals.push("consensus_2plus");
  if (modelTopCount >= 3) signals.push("consensus_3plus");
  if (modelTopCount >= 4) signals.push("consensus_all");

  const edgePct = impliedProb > 0 ? ((ensProb / impliedProb) - 1) * 100 : 0;
  if (edgePct >= 5 && edgePct < 10) signals.push("edge_5_to_10");
  if (edgePct >= 10 && edgePct < 20) signals.push("edge_10_to_20");
  if (edgePct >= 20 && edgePct < 30) signals.push("edge_20_to_30");
  if (edgePct >= 30) signals.push("edge_30_plus");

  if (ensProb >= 0.15 && ensProb < 0.25) signals.push("prob_15_to_25");
  if (ensProb >= 0.25 && ensProb < 0.40) signals.push("prob_25_to_40");
  if (ensProb >= 0.40) signals.push("prob_40_plus");

  const totalEns = raceEntries.reduce((s, e) => s + n(e.ensemble_proba), 0);
  const normProb = totalEns > 0 ? ensProb / totalEns : 0;
  const valueScore = odds > 1 ? normProb * odds : 0;
  if (valueScore >= 1.10) signals.push("value_1_10");
  if (valueScore >= 1.20) signals.push("value_1_20");

  if (odds >= 1 && odds < 3) signals.push("odds_evs_to_2");
  if (odds >= 3 && odds < 5) signals.push("odds_2_to_4");
  if (odds >= 5 && odds < 9) signals.push("odds_4_to_8");
  if (odds >= 9 && odds < 15) signals.push("odds_8_to_14");
  if (odds >= 15) signals.push("odds_14_plus");

  if (raceEntries.every((e) => n(e.current_odds) >= odds) && odds > 0)
    signals.push("favourite");

  const openOdds = n(entry.opening_odds);
  let pctChange = 0;
  if (openOdds > 0 && odds > 0)
    pctChange = ((odds - openOdds) / openOdds) * 100;
  if (pctChange <= -25) signals.push("heavy_steaming");
  else if (pctChange <= -15) signals.push("steaming");
  else if (pctChange <= -5) signals.push("light_steaming");
  else if (pctChange < 5) signals.push("stable_market");
  if (pctChange >= 15 && pctChange < 25) signals.push("drifting");
  if (pctChange >= 25) signals.push("heavy_drifting");

  const oddsRank = raceEntries.filter((e) => n(e.current_odds) < odds).length + 1;
  if (signals.includes("benter_top_pick") && oddsRank <= 2)
    signals.push("model_market_aligned");
  if (edgePct >= 15 && odds > 9) signals.push("model_market_diverge");

  const rpr = n(entry.rpr);
  const ts = n(entry.ts);
  const ofr = n(entry.ofr);
  const rprs = raceEntries.map((e) => n(e.rpr)).filter((v) => v > 0);
  const tss = raceEntries.map((e) => n(e.ts)).filter((v) => v > 0);
  const ofrs = raceEntries.map((e) => n(e.ofr)).filter((v) => v > 0);

  if (rprs.length > 0 && rpr > 0 && rpr >= Math.max(...rprs)) signals.push("top_rpr");
  if (tss.length > 0 && ts > 0 && ts >= Math.max(...tss)) signals.push("top_ts");
  if (ofrs.length > 0 && ofr > 0 && ofr >= Math.max(...ofrs)) signals.push("top_ofr");

  const bestSpeed = Math.max(
    n(entry.best_speed_figure_on_course_going_distance),
    n(entry.best_speed_figure_at_distance),
    n(entry.best_speed_figure_at_track)
  );
  const fieldSpeeds = raceEntries
    .map((e) =>
      Math.max(
        n(e.best_speed_figure_on_course_going_distance),
        n(e.best_speed_figure_at_distance),
        n(e.best_speed_figure_at_track)
      )
    )
    .filter((v) => v > 0);
  if (fieldSpeeds.length > 0 && bestSpeed > 0 && bestSpeed >= Math.max(...fieldSpeeds))
    signals.push("top_speed_fig");

  if (signals.includes("top_rpr") && signals.includes("top_ts"))
    signals.push("ratings_consensus");
  if (signals.includes("top_rpr") && signals.includes("top_ts") && signals.includes("top_ofr"))
    signals.push("ratings_triple");

  const avgRpr = rprs.length > 0 ? rprs.reduce((a, b) => a + b, 0) / rprs.length : 0;
  if (avgRpr > 0 && rpr > 0) {
    const pctAbove = ((rpr - avgRpr) / avgRpr) * 100;
    if (pctAbove >= 5) signals.push("rating_standout_5");
    if (pctAbove >= 10) signals.push("rating_standout_10");
  }

  const lastSpd = n(entry.last_speed_figure);
  const meanSpd = n(entry.mean_speed_figure);
  if (lastSpd > meanSpd && lastSpd > 0 && meanSpd > 0) signals.push("speed_improving");

  const avgSpeed = fieldSpeeds.length > 0 ? fieldSpeeds.reduce((a, b) => a + b, 0) / fieldSpeeds.length : 0;
  if (avgSpeed > 0 && bestSpeed > 0) {
    const pctAbove = ((bestSpeed - avgSpeed) / avgSpeed) * 100;
    if (pctAbove >= 5) signals.push("speed_standout_5");
    if (pctAbove >= 10) signals.push("speed_standout_10");
  }

  const avgFp = n(entry.avg_finishing_position);
  if (avgFp > 0 && avgFp <= 3) signals.push("low_avg_fp");

  const fpTrend = n(entry.finishing_position_trend);
  if (fpTrend < 0) signals.push("improving_positions");
  if (fpTrend > 0) signals.push("declining_positions");

  if (n(entry.consistency_score) >= 70) signals.push("consistent");

  const careerRuns = n(entry.career_runs);
  if (careerRuns > 0 && careerRuns < 5) signals.push("lightly_raced");
  if (careerRuns >= 20) signals.push("experienced");

  const lastRun = n(entry.last_run);
  if (lastRun > 60) signals.push("returning_from_break");
  if (lastRun >= 14 && lastRun <= 30) signals.push("fresh");
  if (lastRun > 0 && lastRun < 10) signals.push("quick_turnaround");

  if (n(entry.career_win_rate) >= 20) signals.push("career_winner");
  if (n(entry.beaten_lengths_trend) < 0) signals.push("beaten_lengths_improving");

  const t21 = n(entry.trainer_21_days_win_percentage);
  if (t21 >= 20) signals.push("trainer_21d_hot");
  else if (t21 >= 15) signals.push("trainer_21d_warm");
  else if (t21 >= 10) signals.push("trainer_21d_active");

  const tCrs = n(entry.trainer_win_percentage_at_course);
  if (tCrs >= 25) signals.push("trainer_course_elite");
  else if (tCrs >= 15) signals.push("trainer_course_specialist");

  if (n(entry.trainer_win_percentage_at_distance) >= 15) signals.push("trainer_dist_specialist");

  if (trainerRunnersAtMeeting === 1) signals.push("trainer_sole_runner");
  if (trainerRunnersAtMeeting >= 2) signals.push("trainer_multi_runner");

  if (n(entry.trainer_rtf) >= 75) signals.push("trainer_rtf_high");

  const tFpCourse = n(entry.trainer_avg_finishing_position_at_course);
  if (tFpCourse > 0 && tFpCourse <= 4) signals.push("trainer_low_fp_at_course");

  const tjc = n(entry.trainer_jockey_combo_win_pct);
  if (tjc >= 15) signals.push("tj_combo_strong");
  if (signals.includes("trainer_21d_hot") && signals.includes("trainer_course_specialist"))
    signals.push("trainer_in_form_at_course");

  const j21 = n(entry.jockey_21_days_win_percentage);
  if (j21 >= 20) signals.push("jockey_21d_hot");
  else if (j21 >= 15) signals.push("jockey_21d_warm");
  else if (j21 >= 10) signals.push("jockey_21d_active");

  if (n(entry.jockey_win_percentage_at_distance) >= 15) signals.push("jockey_dist_specialist");
  if (n(entry.jockey_booking_change) === 1) signals.push("jockey_booking_changed");

  const j21s = raceEntries.map((e) => n(e.jockey_21_days_win_percentage)).filter((v) => v > 0);
  if (j21s.length > 0 && j21 > 0 && j21 >= Math.max(...j21s))
    signals.push("top_jockey_in_field");

  if (signals.includes("trainer_21d_hot") && signals.includes("jockey_21d_hot"))
    signals.push("elite_connections");
  if (tjc === 0 && n(entry.jockey_booking_change) === 1) signals.push("tj_first_combo");

  const comment = ((entry.comment as string) || "").toLowerCase();
  if (/\bc\s*&\s*d\b/.test(comment) || /course\s+and\s+distance/.test(comment))
    signals.push("cd_winner");
  if (n(entry.horse_course_win_rate) > 0) signals.push("course_winner");
  if (n(entry.horse_win_percentage_at_distance) >= 20) signals.push("distance_specialist");

  const cc = n(entry.class_change);
  if (cc < 0) signals.push("class_drop");
  if (cc > 0) signals.push("class_rise");
  if (n(entry.first_time_headgear) === 1) signals.push("first_time_headgear");
  if (n(entry.sire_win_rate_at_distance) >= 10) signals.push("sire_suited");
  if (n(entry.weight_change) < 0) signals.push("weight_drop");
  if (n(entry.horse_ae_at_distance) > 1.0) signals.push("proven_ae");

  const drawBias = n(entry.draw_bias_at_course);
  if (drawBias > 0) {
    const fieldDraws = raceEntries.map((e) => n(e.draw_bias_at_course)).filter((v) => v > 0);
    fieldDraws.sort((a, b) => a - b);
    const threshold = fieldDraws[Math.floor(fieldDraws.length * 0.25)] || 0;
    if (drawBias <= threshold) signals.push("draw_advantage");
  }

  if (fieldSize > 0 && fieldSize <= 7) signals.push("small_field");
  if (fieldSize >= 8 && fieldSize <= 13) signals.push("medium_field");
  if (fieldSize >= 14) signals.push("large_field");

  if (segment === "flat_turf") signals.push("segment_flat_turf");
  if (segment === "flat_aw") signals.push("segment_flat_aw");
  if (segment === "hurdle_turf") signals.push("segment_hurdle");
  if (segment === "chase_turf") signals.push("segment_chase");
  if (segment === "nh_flat_turf") signals.push("segment_nh_flat");

  return signals;
}
