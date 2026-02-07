// supabase/functions/smart-signals/index.ts
// Cross-references market movers (≥10% steaming) with ML model top picks
// and trainer single-entry intent to produce high-conviction smart signals.
//
// Called by the frontend every 30s. Lightweight: 3 REST queries, no RPC.

Deno.serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false",
  };
  if (req.method === "OPTIONS")
    return new Response(null, { status: 200, headers: CORS });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const headers = {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    };

    // ── Today's date in UK timezone ──────────────────────────────────
    const todayUK = getUKDate();

    // ── 1) Significant market movers (steaming ≥ 10%) ───────────────
    // odds_movement_pct is negative for steaming (price shortening)
    // We want pct <= -10 (i.e. 10%+ inward movement)
    const moversUrl =
      `${SUPABASE_URL}/rest/v1/horse_market_movement` +
      `?odds_movement=eq.steaming` +
      `&odds_movement_pct=lte.-10` +
      `&select=race_id,horse_id,initial_odds,current_odds,decimal_odds,odds_movement_pct,change_count,last_updated,course,off_time`;

    const moversRes = await fetch(moversUrl, { headers });
    if (!moversRes.ok) {
      return json(
        { success: false, step: "movers", error: await safeText(moversRes) },
        500
      );
    }
    const movers: any[] = await moversRes.json();

    if (!movers.length) {
      return json({
        success: true,
        signals: [],
        generated_at: new Date().toISOString(),
        message: "No significant market movers right now",
      });
    }

    // Collect unique race_ids and horse_ids
    const raceIds = [...new Set(movers.map((m) => m.race_id))];
    const horseIds = [...new Set(movers.map((m) => m.horse_id))];

    // ── 2) Fetch races for today only ───────────────────────────────
    const racesUrl =
      `${SUPABASE_URL}/rest/v1/races` +
      `?race_id=in.(${raceIds.join(",")})` +
      `&date=eq.${todayUK}` +
      `&select=race_id,course_name,off_time,date,course_id`;

    const racesRes = await fetch(racesUrl, { headers });
    if (!racesRes.ok) {
      return json(
        { success: false, step: "races", error: await safeText(racesRes) },
        500
      );
    }
    const races: any[] = await racesRes.json();
    const raceMap = new Map(races.map((r) => [r.race_id, r]));

    // Filter movers to only today's races
    const todayMovers = movers.filter((m) => raceMap.has(m.race_id));
    if (!todayMovers.length) {
      return json({
        success: true,
        signals: [],
        generated_at: new Date().toISOString(),
        message: "No significant movers for today's races",
      });
    }

    // ── 3) Fetch ALL entries for these races (for ML + trainer) ─────
    const todayRaceIds = [...new Set(todayMovers.map((m) => m.race_id))];
    const entriesUrl =
      `${SUPABASE_URL}/rest/v1/race_entries` +
      `?race_id=in.(${todayRaceIds.join(",")})` +
      `&select=race_id,horse_id,horse_name,trainer_id,trainer_name,jockey_name,silk_url,number,current_odds,` +
      `mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba`;

    const entriesRes = await fetch(entriesUrl, { headers });
    if (!entriesRes.ok) {
      return json(
        { success: false, step: "entries", error: await safeText(entriesRes) },
        500
      );
    }
    const entries: any[] = await entriesRes.json();

    // Group entries by race
    const entriesByRace: Record<string, any[]> = {};
    for (const e of entries) {
      (entriesByRace[e.race_id] ??= []).push(e);
    }

    // Build horse lookup: race_id::horse_id -> entry
    const entryLookup = new Map<string, any>();
    for (const e of entries) {
      entryLookup.set(`${e.race_id}::${e.horse_id}`, e);
    }

    // ── 4) ML model top-pick analysis per race ──────────────────────
    const models = [
      { key: "mlp", field: "mlp_proba" },
      { key: "rf", field: "rf_proba" },
      { key: "xgboost", field: "xgboost_proba" },
      { key: "benter", field: "benter_proba" },
      { key: "ensemble", field: "ensemble_proba" },
    ];

    // For each race, find top horse per model
    const mlTopPicks = new Map<string, string[]>(); // race_id::horse_id -> [model keys]

    for (const raceId of todayRaceIds) {
      const raceEntries = entriesByRace[raceId] ?? [];
      if (!raceEntries.length) continue;

      for (const model of models) {
        let bestEntry: any = null;
        let bestProb = 0;
        for (const e of raceEntries) {
          const p = Number(e?.[model.field] ?? 0);
          if (p > bestProb) {
            bestProb = p;
            bestEntry = e;
          }
        }
        if (bestEntry && bestProb > 0) {
          const key = `${raceId}::${bestEntry.horse_id}`;
          if (!mlTopPicks.has(key)) mlTopPicks.set(key, []);
          mlTopPicks.get(key)!.push(model.key);
        }
      }
    }

    // ── 5) Trainer single-entry analysis ────────────────────────────
    // Group by course + trainer -> count runners at the meeting
    const trainerMeetingCounts = new Map<string, { count: number; entries: any[] }>();

    for (const e of entries) {
      const race = raceMap.get(e.race_id);
      if (!race) continue;
      const key = `${race.course_id}::${e.trainer_id}`;
      if (!trainerMeetingCounts.has(key)) {
        trainerMeetingCounts.set(key, { count: 0, entries: [] });
      }
      const bucket = trainerMeetingCounts.get(key)!;
      bucket.count++;
      bucket.entries.push(e);
    }

    // Build set of horse_ids that are single trainer entries
    const singleTrainerEntries = new Set<string>();
    for (const [_, bucket] of trainerMeetingCounts) {
      if (bucket.count === 1) {
        const e = bucket.entries[0];
        singleTrainerEntries.add(`${e.race_id}::${e.horse_id}`);
      }
    }

    // ── 6) Build smart signals ──────────────────────────────────────
    const ukNow = getUKDateTime();
    const signals: any[] = [];

    for (const mover of todayMovers) {
      const race = raceMap.get(mover.race_id);
      if (!race) continue;

      // Filter out races that have already started
      const raceTime = parseOffTime(race.off_time, race.date);
      if (raceTime && raceTime <= ukNow) continue;

      const key = `${mover.race_id}::${mover.horse_id}`;
      const entry = entryLookup.get(key);
      if (!entry) continue;

      const modelsAgreeing = mlTopPicks.get(key) ?? [];
      const isMLTopPick = modelsAgreeing.length >= 1;
      const isSingleTrainer = singleTrainerEntries.has(key);

      // Signal strength
      let signalStrength: "strong" | "medium" = "medium";
      if (isMLTopPick || isSingleTrainer) {
        signalStrength = "strong";
      }

      const movementPct = Number(mover.odds_movement_pct ?? 0);

      signals.push({
        horse_name: entry.horse_name ?? `Horse ${mover.horse_id}`,
        horse_id: mover.horse_id,
        race_id: mover.race_id,
        course_name: race.course_name ?? mover.course ?? "Unknown",
        off_time: race.off_time ?? mover.off_time ?? "",
        current_odds: mover.current_odds,
        initial_odds: mover.initial_odds,
        movement_pct: movementPct,
        is_ml_top_pick: isMLTopPick,
        ml_models_agreeing: modelsAgreeing,
        ml_top_probability: Number(entry.ensemble_proba ?? 0),
        is_single_trainer_entry: isSingleTrainer,
        trainer_name: entry.trainer_name ?? "",
        jockey_name: entry.jockey_name ?? "",
        signal_strength: signalStrength,
        silk_url: entry.silk_url ?? "",
        number: entry.number ?? null,
        change_count: mover.change_count ?? 0,
        last_updated: mover.last_updated,
      });
    }

    // Sort: strong first, then by movement magnitude (most negative = most steaming)
    signals.sort((a, b) => {
      const strengthOrder = { strong: 0, medium: 1 };
      const sa = strengthOrder[a.signal_strength as keyof typeof strengthOrder] ?? 1;
      const sb = strengthOrder[b.signal_strength as keyof typeof strengthOrder] ?? 1;
      if (sa !== sb) return sa - sb;
      return a.movement_pct - b.movement_pct; // more negative = stronger steaming = first
    });

    return json({
      success: true,
      signals,
      total: signals.length,
      strong_count: signals.filter((s) => s.signal_strength === "strong").length,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("smart-signals error:", err?.message ?? String(err));
    return json(
      { success: false, error: err?.message ?? String(err) },
      500
    );
  }
});

// ── Utilities ──────────────────────────────────────────────────────

function mustGetEnv(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function getUKDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value!;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getUKDateTime(): Date {
  const ukStr = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  // Parse "DD/MM/YYYY, HH:MM:SS" format
  const [datePart, timePart] = ukStr.split(", ");
  const [day, month, year] = datePart.split("/");
  return new Date(`${year}-${month}-${day}T${timePart}`);
}

function parseOffTime(offTime: string | null, raceDate: string | null): Date | null {
  if (!offTime) return null;
  try {
    const time = offTime.substring(0, 5); // "HH:MM"
    const [hours, minutes] = time.split(":").map(Number);
    // Race times stored as 01:XX-09:XX are PM (13:XX-21:XX)
    // Hours 10-12 are genuine morning/noon, keep as-is
    const adjustedHours = hours >= 1 && hours <= 9 ? hours + 12 : hours;
    const adjustedTime = `${String(adjustedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const date = raceDate ?? getUKDate();
    return new Date(`${date}T${adjustedTime}:00`);
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
