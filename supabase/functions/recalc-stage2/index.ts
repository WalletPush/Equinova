// supabase/functions/recalc-stage2/index.ts
//
// Live Benter Stage 2 recalculation + Smart Money detection.
//
// Stage 1 (conditional logit) runs once at 9am and is fixed for the day.
// Stage 2 combines 5 probability sources via racewise softmax:
//
//   u_i = w[0]*log(s1_i) + w[1]*log(market_i) + w[2]*log(lgbm_i) + w[3]*log(xgb_i) + w[4]*log(rf_i)
//   P(i wins) = exp(u_i) / Σ_j exp(u_j)
//
// When odds change, only log(market) changes; tree model probabilities
// are fixed from the morning run. Recompute u with all 5 terms and re-softmax.
//
// After recalculating ensemble_proba, scans for "Smart Money" triggers:
// horses where Benter edge AND market backing converge. Inserts alerts
// into smart_money_alerts table.
//
// Segment weights [stage1, market, lgbm, xgb, rf] are updated after each
// weekly retrain. Current values below are PLACEHOLDERS until first retrain
// with the extended 5-source combiner.
//
// Called by the market-monitor cron after it updates current_odds,
// or on-demand via POST { date?: "YYYY-MM-DD" }.

interface EntryRow {
  race_id: string;
  horse_id: string;
  horse_name: string | null;
  stage1_proba: string | null;
  current_odds: string | null;
  opening_odds: string | null;
  ensemble_proba: string | null;
  benter_proba: string | null;  // actually LightGBM (legacy naming)
  rf_proba: string | null;
  xgboost_proba: string | null;
}

interface RaceRow {
  race_id: string;
  type: string;
  surface: string;
  course: string;
  off_time: string;
}

Deno.serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error("Missing Supabase config");
    }

    const body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};

    const ukNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/London" })
    );
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayUK = `${ukNow.getFullYear()}-${pad(ukNow.getMonth() + 1)}-${pad(ukNow.getDate())}`;
    const targetDate: string = body.date || todayUK;

    const restHeaders = {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    };

    // weights: [stage1, market, lgbm, xgb, rf]
    // Updated after retrain with true OOF (leakage-free) — 2026-03-21
    // These will be overwritten by retrain_weekly.py after each weekly retrain.
    const SEGMENT_WEIGHTS: Record<string, { weights: number[] }> = {
      Flat_Turf: { weights: [0.0326, 0.9253, 0.0978, 0.0, 0.1400] },
      Flat_AW: { weights: [0.0, 1.0355, 0.0, 0.0479, 0.3520] },
      Hurdle_Turf: { weights: [0.0, 0.9347, 0.0, 0.2794, 0.4421] },
      Chase_Turf: { weights: [0.0, 0.6512, 0.1327, 0.3517, 0.0909] },
      NH_Flat_Turf: { weights: [0.5875, 0.3311, 0.0, 0.0, 0.0] },
    };

    // ── 1) Fetch races for this date ─────────────────────────────────────
    const racesUrl =
      `${SUPABASE_URL}/rest/v1/races?date=eq.${targetDate}&select=race_id,type,surface,course,off_time`;
    const racesResp = await fetch(racesUrl, { headers: restHeaders });
    if (!racesResp.ok) throw new Error(`Races fetch failed: ${racesResp.status}`);
    const races: RaceRow[] = await racesResp.json();

    if (!races.length) {
      return json({ success: true, message: "No races for date", date: targetDate, updated: 0 });
    }

    const raceSegment = new Map<string, string>();
    const raceInfo = new Map<string, { course: string; off_time: string }>();
    for (const r of races) {
      const seg = `${(r.type || "").replace(/ /g, "_")}_${r.surface || ""}`;
      raceSegment.set(r.race_id, seg);
      raceInfo.set(r.race_id, { course: r.course || "", off_time: r.off_time || "" });
    }

    // ── 2) Fetch all entries (with extra fields for smart money) ─────────
    const raceIds = races.map((r) => r.race_id);
    let allEntries: EntryRow[] = [];

    const BATCH = 50;
    const entryCols = "race_id,horse_id,horse_name,stage1_proba,current_odds,opening_odds,ensemble_proba,benter_proba,rf_proba,xgboost_proba";
    for (let i = 0; i < raceIds.length; i += BATCH) {
      const batch = raceIds.slice(i, i + BATCH);
      const inList = batch.map(encodeURIComponent).join(",");
      const url =
        `${SUPABASE_URL}/rest/v1/race_entries?race_id=in.(${inList})&select=${entryCols}`;
      const resp = await fetch(url, { headers: restHeaders });
      if (!resp.ok) throw new Error(`Entries fetch failed: ${resp.status}`);
      const data = await resp.json();
      allEntries = allEntries.concat(data);
    }

    // ── 3) Group by race and recalculate Stage 2 ────────────────────────
    const byRace = new Map<string, EntryRow[]>();
    for (const e of allEntries) {
      if (!byRace.has(e.race_id)) byRace.set(e.race_id, []);
      byRace.get(e.race_id)!.push(e);
    }

    const EPS = 1e-8;
    const updates: { race_id: string; horse_id: string; ensemble_proba: number }[] = [];
    // Store old ensemble_proba per horse for smart money "morning edge" comparison
    const morningEnsemble = new Map<string, number>();
    let skippedNoS1 = 0;
    let skippedNoWeights = 0;
    let recalcedRaces = 0;

    for (const [raceId, entries] of byRace) {
      const segment = raceSegment.get(raceId);
      if (!segment || !SEGMENT_WEIGHTS[segment]) {
        skippedNoWeights += entries.length;
        continue;
      }

      const { weights } = SEGMENT_WEIGHTS[segment];
      const [wS1, wMkt, wLgbm, wXgb, wRf] = weights;

      const hasS1 = entries.every(
        (e) => e.stage1_proba !== null && e.stage1_proba !== undefined
      );
      if (!hasS1) {
        skippedNoS1 += entries.length;
        continue;
      }

      // Store pre-recalc ensemble_proba as "morning" value
      for (const e of entries) {
        const key = `${e.race_id}::${e.horse_id}`;
        const oldVal = Number(e.ensemble_proba);
        morningEnsemble.set(key, Number.isFinite(oldVal) ? oldVal : 0);
      }

      const s1 = entries.map((e) => {
        const v = Number(e.stage1_proba);
        return Number.isFinite(v) && v > 0 ? v : EPS;
      });

      const rawMarket = entries.map((e) => {
        const odds = Number(e.current_odds);
        return Number.isFinite(odds) && odds > 1 ? 1.0 / odds : 0;
      });
      const marketSum = rawMarket.reduce((s, v) => s + v, 0);
      const marketProb = marketSum > 0
        ? rawMarket.map((v) => v / marketSum)
        : rawMarket;

      // Tree model probabilities (fixed from morning prediction run)
      const lgbmProb = entries.map((e) => {
        const v = Number(e.benter_proba);
        return Number.isFinite(v) && v > 0 ? v : EPS;
      });
      const xgbProb = entries.map((e) => {
        const v = Number(e.xgboost_proba);
        return Number.isFinite(v) && v > 0 ? v : EPS;
      });
      const rfProb = entries.map((e) => {
        const v = Number(e.rf_proba);
        return Number.isFinite(v) && v > 0 ? v : EPS;
      });

      const u = entries.map((_, idx) => {
        return (
          wS1 * Math.log(Math.max(s1[idx], EPS)) +
          wMkt * Math.log(Math.max(marketProb[idx], EPS)) +
          wLgbm * Math.log(Math.max(lgbmProb[idx], EPS)) +
          wXgb * Math.log(Math.max(xgbProb[idx], EPS)) +
          wRf * Math.log(Math.max(rfProb[idx], EPS))
        );
      });

      const maxU = Math.max(...u);
      const expU = u.map((v) => Math.exp(v - maxU));
      const sumExp = expU.reduce((s, v) => s + v, 0);
      const probs = expU.map((v) => v / sumExp);

      for (let idx = 0; idx < entries.length; idx++) {
        updates.push({
          race_id: entries[idx].race_id,
          horse_id: entries[idx].horse_id,
          ensemble_proba: probs[idx],
        });
      }
      recalcedRaces++;
    }

    // ── 4) Batch-update ensemble_proba back to race_entries ─────────────
    let patched = 0;
    const PATCH_BATCH = 20;
    for (let i = 0; i < updates.length; i += PATCH_BATCH) {
      const batch = updates.slice(i, i + PATCH_BATCH);
      const promises = batch.map(async (upd) => {
        const patchUrl =
          `${SUPABASE_URL}/rest/v1/race_entries` +
          `?race_id=eq.${encodeURIComponent(upd.race_id)}` +
          `&horse_id=eq.${encodeURIComponent(upd.horse_id)}`;
        try {
          const resp = await fetch(patchUrl, {
            method: "PATCH",
            headers: { ...restHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ ensemble_proba: upd.ensemble_proba }),
          });
          if (resp.ok) patched++;
        } catch { /* non-fatal */ }
      });
      await Promise.all(promises);
    }

    // ── 5) Smart Money Detection ────────────────────────────────────────
    // After recalculation, scan for horses where:
    // - Top Pick candidate (edge>=5%, odds<=13, ensemble>=15%)
    // - Backed >=15% from opening (current_odds < opening_odds * 0.85)
    // - Live edge still >=10% (double the base threshold)
    // - Kelly-qualified (>=£1 after rounding to nearest 50p)
    // - Race still upcoming

    const ukNowMs = ukNow.getTime();
    const smartAlerts: {
      race_id: string;
      horse_id: string;
      horse_name: string;
      course: string;
      off_time: string;
      date: string;
      opening_odds: number;
      current_odds: number;
      pct_backed: number;
      morning_ensemble: number;
      live_ensemble: number;
      morning_edge: number;
      live_edge: number;
      kelly_stake: number;
    }[] = [];

    // Build a lookup from updates for the new ensemble_proba
    const newEnsembleMap = new Map<string, number>();
    for (const u of updates) {
      newEnsembleMap.set(`${u.race_id}::${u.horse_id}`, u.ensemble_proba);
    }

    // Use a reasonable bankroll estimate for Kelly (£200 default — matches user's starting bankroll)
    const KELLY_BANKROLL = 200;

    for (const e of allEntries) {
      const key = `${e.race_id}::${e.horse_id}`;
      const liveEnsemble = newEnsembleMap.get(key);
      if (liveEnsemble === undefined) continue;

      const openOdds = Number(e.opening_odds);
      const curOdds = Number(e.current_odds);
      if (!Number.isFinite(openOdds) || openOdds <= 1) continue;
      if (!Number.isFinite(curOdds) || curOdds <= 1) continue;

      // Max odds 12/1 = decimal 13
      if (curOdds > 13) continue;

      // Minimum ensemble probability 15%
      if (liveEnsemble < 0.15) continue;

      // Edge checks (model agreement removed — base models now feed into Stage 2)
      const impliedProb = 1 / curOdds;
      const liveEdge = liveEnsemble - impliedProb;
      if (liveEdge < 0.10) continue; // must be 10%+ edge for smart money

      // Backing check: current_odds < opening_odds * 0.85 means backed >=15%
      if (curOdds >= openOdds * 0.85) continue;
      const pctBacked = ((openOdds - curOdds) / openOdds) * 100;

      // Kelly sizing
      const kellyFraction = liveEdge / (curOdds - 1);
      const quarterKelly = Math.min(kellyFraction / 4, 0.03);
      const rawStake = KELLY_BANKROLL * quarterKelly;
      const stake = Math.round(rawStake * 2) / 2; // nearest 50p
      if (stake < 1) continue;

      // Race still upcoming? (compare off_time against UK now)
      const ri = raceInfo.get(e.race_id);
      if (ri?.off_time) {
        const [h, m] = (ri.off_time.substring(0, 5)).split(":").map(Number);
        if (!isNaN(h) && !isNaN(m)) {
          const raceDate = new Date(ukNow);
          raceDate.setHours(h, m, 0, 0);
          if (raceDate.getTime() <= ukNowMs) continue; // race already off
        }
      }

      const morningEns = morningEnsemble.get(key) ?? 0;
      const morningImplied = openOdds > 1 ? 1 / openOdds : 0;
      const morningEdge = morningEns - morningImplied;

      smartAlerts.push({
        race_id: e.race_id,
        horse_id: e.horse_id,
        horse_name: e.horse_name || "Unknown",
        course: ri?.course || "",
        off_time: ri?.off_time || "",
        date: targetDate,
        opening_odds: openOdds,
        current_odds: curOdds,
        pct_backed: pctBacked,
        morning_ensemble: morningEns,
        live_ensemble: liveEnsemble,
        morning_edge: morningEdge,
        live_edge: liveEdge,
        kelly_stake: stake,
      });
    }

    // ── 6) Upsert smart money alerts ────────────────────────────────────
    let alertsInserted = 0;
    for (const alert of smartAlerts) {
      try {
        const upsertUrl = `${SUPABASE_URL}/rest/v1/smart_money_alerts`;
        const resp = await fetch(upsertUrl, {
          method: "POST",
          headers: {
            ...restHeaders,
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(alert),
        });
        if (resp.ok) alertsInserted++;
      } catch { /* non-fatal */ }
    }

    return json({
      success: true,
      date: targetDate,
      races_recalculated: recalcedRaces,
      entries_updated: patched,
      entries_total: updates.length,
      skipped_no_stage1: skippedNoS1,
      skipped_no_segment_weights: skippedNoWeights,
      smart_money_alerts: alertsInserted,
      smart_money_candidates: smartAlerts.length,
    });
  } catch (error) {
    console.error("recalc-stage2 error:", error);
    return json(
      { success: false, message: (error as Error).message },
      500
    );
  }
});
