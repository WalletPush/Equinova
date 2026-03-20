// supabase/functions/recalc-stage2/index.ts
//
// Live Benter Stage 2 recalculation.
//
// Stage 1 (conditional logit) runs once at 9am and is fixed for the day.
// Stage 2 combines Stage 1 output with market probabilities:
//
//   u_i = model_weight × log(stage1_proba_i) + market_weight × log(market_prob_i)
//   P(i wins) = exp(u_i) / Σ_j exp(u_j)          [racewise softmax]
//
// When odds move (horse is backed / drifts), market_prob changes, so
// the softmax output changes. This function recalculates ensemble_proba
// for all races on a given date using the latest current_odds.
//
// Segment weights (from trained Benter bundles):
//   Flat_Turf:    a=1.9527, b=0.5468
//   Flat_AW:      a=2.3646, b=0.1581
//   Hurdle_Turf:  a=2.4193, b=0.4129
//   Chase_Turf:   a=3.1392, b=0.2782
//   NH_Flat_Turf: a=0.5875, b=0.3311
//
// Called by the market-monitor cron after it updates current_odds,
// or on-demand via POST { date?: "YYYY-MM-DD" }.

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

    // Default to today's UK date
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

    // ── Segment weights from trained Benter models ──────────────────────
    const SEGMENT_WEIGHTS: Record<string, { a: number; b: number }> = {
      Flat_Turf: { a: 1.9526746421597867, b: 0.5468448239024457 },
      Flat_AW: { a: 2.364569392693001, b: 0.15805944852676032 },
      Hurdle_Turf: { a: 2.419299298189669, b: 0.4128749567533024 },
      Chase_Turf: { a: 3.1391505790313396, b: 0.2781728716289576 },
      NH_Flat_Turf: { a: 0.5874636542265078, b: 0.331126154869991 },
    };

    // ── 1) Fetch races for this date (need type + surface for segment) ──
    const racesUrl =
      `${SUPABASE_URL}/rest/v1/races?date=eq.${targetDate}&select=race_id,type,surface`;
    const racesResp = await fetch(racesUrl, { headers: restHeaders });
    if (!racesResp.ok) throw new Error(`Races fetch failed: ${racesResp.status}`);
    const races: { race_id: string; type: string; surface: string }[] =
      await racesResp.json();

    if (!races.length) {
      return json({ success: true, message: "No races for date", date: targetDate, updated: 0 });
    }

    // Map race_id → segment
    const raceSegment = new Map<string, string>();
    for (const r of races) {
      const seg = `${(r.type || "").replace(/ /g, "_")}_${r.surface || ""}`;
      raceSegment.set(r.race_id, seg);
    }

    // ── 2) Fetch all entries for these races ────────────────────────────
    const raceIds = races.map((r) => r.race_id);
    let allEntries: {
      race_id: string;
      horse_id: string;
      stage1_proba: string | null;
      current_odds: string | null;
    }[] = [];

    const BATCH = 50;
    for (let i = 0; i < raceIds.length; i += BATCH) {
      const batch = raceIds.slice(i, i + BATCH);
      const inList = batch.map(encodeURIComponent).join(",");
      const url =
        `${SUPABASE_URL}/rest/v1/race_entries?race_id=in.(${inList})&select=race_id,horse_id,stage1_proba,current_odds`;
      const resp = await fetch(url, { headers: restHeaders });
      if (!resp.ok) throw new Error(`Entries fetch failed: ${resp.status}`);
      const data = await resp.json();
      allEntries = allEntries.concat(data);
    }

    // ── 3) Group by race and recalculate Stage 2 ────────────────────────
    const byRace = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      if (!byRace.has(e.race_id)) byRace.set(e.race_id, []);
      byRace.get(e.race_id)!.push(e);
    }

    const EPS = 1e-8;
    const updates: { race_id: string; horse_id: string; ensemble_proba: number }[] = [];
    let skippedNoS1 = 0;
    let skippedNoWeights = 0;
    let recalcedRaces = 0;

    for (const [raceId, entries] of byRace) {
      const segment = raceSegment.get(raceId);
      if (!segment || !SEGMENT_WEIGHTS[segment]) {
        skippedNoWeights += entries.length;
        continue;
      }

      const { a, b } = SEGMENT_WEIGHTS[segment];

      // Check all runners have stage1_proba
      const hasS1 = entries.every(
        (e) => e.stage1_proba !== null && e.stage1_proba !== undefined
      );
      if (!hasS1) {
        skippedNoS1 += entries.length;
        continue;
      }

      // Parse Stage 1 probabilities
      const s1 = entries.map((e) => {
        const v = Number(e.stage1_proba);
        return Number.isFinite(v) && v > 0 ? v : EPS;
      });

      // Parse current odds → market probabilities (remove overround per race)
      const rawMarket = entries.map((e) => {
        const odds = Number(e.current_odds);
        return Number.isFinite(odds) && odds > 1 ? 1.0 / odds : 0;
      });
      const marketSum = rawMarket.reduce((s, v) => s + v, 0);
      const marketProb = marketSum > 0
        ? rawMarket.map((v) => v / marketSum)
        : rawMarket;

      // Racewise softmax: u_i = a*log(s1_i) + b*log(market_i)
      const u = entries.map((_, idx) => {
        const logS1 = Math.log(Math.max(s1[idx], EPS));
        const logM = Math.log(Math.max(marketProb[idx], EPS));
        return a * logS1 + b * logM;
      });

      // Numerical stability: subtract max
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

    return json({
      success: true,
      date: targetDate,
      races_recalculated: recalcedRaces,
      entries_updated: patched,
      entries_total: updates.length,
      skipped_no_stage1: skippedNoS1,
      skipped_no_segment_weights: skippedNoWeights,
    });
  } catch (error) {
    console.error("recalc-stage2 error:", error);
    return json(
      { success: false, message: (error as Error).message },
      500
    );
  }
});
