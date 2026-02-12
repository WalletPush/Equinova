// supabase/functions/racing-market-monitor-cron/index.ts
// Fast Betfair market monitor with BULK IO to avoid timeouts.
// - initial_odds (text): first decimal seen (e.g. "9.8")
// - current_odds (text): latest decimal (e.g. "9.8")
// - odds_change / odds_movement_pct = current - initial
// Query params:
//   ?force=1              bypass 08:00–21:00 UK window
//   ?batch_size=300       rows per bulk upsert (100..1000)
//   ?log=1                light per-batch logging
Deno.serve(async (req)=>{
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false"
  };
  if (req.method === "OPTIONS") return new Response(null, {
    status: 200,
    headers: CORS
  });
  const json = (body, status = 200)=>new Response(JSON.stringify(body), {
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json"
      }
    });
  try {
    // ---- Params & time gate ----
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const batchSize = clampInt(url.searchParams.get("batch_size"), 100, 1000, 300);
    const doLog = url.searchParams.get("log") === "1";
    const now = new Date();
    const hhmm = now.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const [hh, mm] = hhmm.split(":").map(Number);
    const minutes = hh * 60 + mm;
    if (!force && (minutes < 8 * 60 || minutes >= 21 * 60)) {
      return json({
        success: true,
        message: minutes < 8 * 60 ? `Not active yet (${hhmm} UK); starts 08:00` : `Ended for the day (${hhmm} UK); ends 21:00`,
        force,
        batch_size: batchSize
      });
    }
    // ---- Env / headers ----
    const SUPABASE_URL = mustGetEnv("SUPABASE_URL");
    const SUPABASE_KEY = mustGetEnv("SUPABASE_SERVICE_ROLE_KEY");
    const BOOKMAKER_DB = "Betfair"; // EXACT case stored in DB
    const API_USER = "B06mvaMg9rdqfPBMJLe6wU0m";
    const API_PASS = "WC4kl7E2GvweCA9uxFAywbOY";
    const apiAuth = btoa(`${API_USER}:${API_PASS}`);
    const restHeaders = {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    };
    // ---- 1) Fetch racecards once ----
    const rcRes = await fetch("https://api.theracingapi.com/v1/racecards/pro", {
      headers: {
        Authorization: `Basic ${apiAuth}`,
        "Content-Type": "application/json"
      }
    });
    if (!rcRes.ok) throw new Error(`Racing API failed: ${rcRes.status} - ${await safeText(rcRes)}`);
    const rc = await rcRes.json().catch(()=>({}));
    const racecards = Array.isArray(rc?.racecards) ? rc.racecards : [];
    if (racecards.length === 0) {
      return json({
        success: true,
        message: "No racecards from API",
        force,
        batch_size: batchSize,
        horses_found: 0,
        upserted: 0
      });
    }
    const picks = [];
    for (const race of racecards){
      const runners = Array.isArray(race?.runners) ? race.runners : [];
      for (const runner of runners){
        const odds = Array.isArray(runner?.odds) ? runner.odds : [];
        const betfairs = odds.filter((o)=>/betfair/i.test(String(o?.bookmaker ?? "")));
        if (!betfairs.length) continue;
        // prefer Exchange entry if present
        betfairs.sort((a, b)=>{
          const ax = /exchange/i.test(String(a?.bookmaker ?? ""));
          const bx = /exchange/i.test(String(b?.bookmaker ?? ""));
          return ax === bx ? 0 : ax ? -1 : 1;
        });
        const sel = betfairs[0];
        const n = Number(sel?.decimal);
        if (!Number.isFinite(n)) continue; // skip "SP"/"odds"
        const raw = String(sel?.decimal ?? "");
        const asStr = /^\s*\d+(\.\d+)?\s*$/.test(raw) ? raw.trim() : String(n);
        picks.push({
          race_id: String(race?.race_id ?? ""),
          horse_id: String(runner?.horse_id ?? ""),
          course: race?.course ?? null,
          off_time: race?.off_time ?? null,
          decNow: n,
          decText: asStr,
          updatedText: String(sel?.updated ?? new Date().toISOString())
        });
      }
    }
    if (!picks.length) {
      return json({
        success: true,
        message: "No Betfair prices found in payload",
        force,
        batch_size: batchSize,
        horses_found: 0,
        upserted: 0
      });
    }
    // ---- 3) Bulk-load existing rows for these races (one request; filters by bookmaker) ----
    const raceIds = Array.from(new Set(picks.map((p)=>p.race_id)));
    // Build in.(...) safely; small batches if too many race_ids
    const EXISTING = new Map();
    const RACE_CHUNK = 100; // keep query string reasonable
    for(let i = 0; i < raceIds.length; i += RACE_CHUNK){
      const chunk = raceIds.slice(i, i + RACE_CHUNK);
      const inList = chunk.map((id)=>encodeURIComponent(id)).join(",");
      const selUrl = `${SUPABASE_URL}/rest/v1/horse_market_movement` + `?bookmaker=eq.${encodeURIComponent(BOOKMAKER_DB)}` + `&race_id=in.(${inList})` + `&select=race_id,horse_id,initial_odds,decimal_odds,change_count,last_change_at`;
      const exRes = await fetch(selUrl, {
        headers: restHeaders
      });
      if (!exRes.ok) throw new Error(`SELECT existing ${exRes.status}: ${await safeText(exRes)}`);
      const rows = await exRes.json().catch(()=>[]);
      for (const r of rows){
        const key = `${r.race_id}::${r.horse_id}`;
        EXISTING.set(key, {
          initial_odds: r.initial_odds ?? undefined,
          decimal_odds: Number(r.decimal_odds ?? NaN),
          change_count: Number.isFinite(Number(r.change_count)) ? Number(r.change_count) : 0,
          last_change_at: r.last_change_at ?? null
        });
      }
    }
    const rows = [];
    for (const p of picks){
      const key = `${p.race_id}::${p.horse_id}`;
      const ex = EXISTING.get(key);
      const initialText = ex?.initial_odds ?? p.decText;
      const initialNum = toDecimal(initialText); // supports fractional legacy; here it’ll just be decimal string
      const diff = Number.isFinite(initialNum) ? p.decNow - initialNum : 0;
      const changeAbsStr = fmt2(diff); // TEXT(2dp)
      const changePct = Number.isFinite(initialNum) && initialNum !== 0 ? round2(100 * (diff / initialNum)) : null;
      const movement = Number.isFinite(initialNum) ? p.decNow < initialNum ? "steaming" : p.decNow > initialNum ? "drifting" : "stable" : "stable";
      const prevNum = Number(ex?.decimal_odds ?? NaN);
      const priceChanged = Number.isFinite(prevNum) ? prevNum !== p.decNow : false;
      rows.push({
        race_id: p.race_id,
        horse_id: p.horse_id,
        bookmaker: BOOKMAKER_DB,
        course: p.course,
        off_time: p.off_time,
        initial_odds: initialText,
        current_odds: p.decText,
        decimal_odds: p.decNow,
        prev_decimal_odds: Number.isFinite(prevNum) ? prevNum : null,
        odds_change: changeAbsStr,
        odds_movement: movement,
        odds_movement_pct: changePct,
        last_updated: p.updatedText,
        updated_at: new Date().toISOString(),
        change_count: (ex?.change_count ?? 0) + (priceChanged ? 1 : 0),
        last_change_at: priceChanged ? new Date().toISOString() : ex?.last_change_at ?? null
      });
    }
    // ---- 5) Bulk UPSERT in batches (super fast) ----
    let upserted = 0;
    for(let i = 0; i < rows.length; i += batchSize){
      const chunk = rows.slice(i, i + batchSize);
      const upUrl = `${SUPABASE_URL}/rest/v1/horse_market_movement?on_conflict=race_id,horse_id,bookmaker`;
      const upRes = await fetch(upUrl, {
        method: "POST",
        headers: {
          ...restHeaders,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(chunk)
      });
      if (!upRes.ok) {
        // If payload too large, nudge the batch_size down via query param
        throw new Error(`UPSERT ${upRes.status}: ${await safeText(upRes)}`);
      }
      upserted += chunk.length;
      if (doLog) console.log(`[MM] upserted batch ${i + 1}-${i + chunk.length}`);
    }
    // ---- 6) Sync latest prices back to race_entries.current_odds ----
    // This ensures ALL UI displays (which read from race_entries) show fresh prices.
    let reSynced = 0;
    const RE_BATCH = 50;
    for (let i = 0; i < rows.length; i += RE_BATCH) {
      const chunk = rows.slice(i, i + RE_BATCH);
      // Build individual updates; PostgREST doesn't support batch PATCH with different values
      // so we fire them in parallel within each batch
      const promises = chunk.map(async (r) => {
        const patchUrl = `${SUPABASE_URL}/rest/v1/race_entries` +
          `?race_id=eq.${encodeURIComponent(r.race_id)}` +
          `&horse_id=eq.${encodeURIComponent(r.horse_id)}`;
        try {
          const pRes = await fetch(patchUrl, {
            method: "PATCH",
            headers: { ...restHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ current_odds: r.decimal_odds }),
          });
          if (pRes.ok) reSynced++;
        } catch { /* non-fatal */ }
      });
      await Promise.all(promises);
    }
    return json({
      success: true,
      message: "horse_market_movement updated (bulk)",
      force,
      batch_size: batchSize,
      bookmaker: BOOKMAKER_DB,
      horses_found: picks.length,
      upserted,
      race_entries_synced: reSynced
    });
  } catch (e) {
    console.error("racing-market-monitor-cron error:", e?.message ?? String(e));
    return json({
      success: false,
      error: {
        code: "RACING_MARKET_ERROR",
        message: e?.message ?? String(e)
      }
    }, 500);
  }
});
// ---------- utils ----------
function mustGetEnv(k) {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}
function clampInt(v, min, max, dflt) {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : dflt;
}
// accepts numeric strings or fractional like "10/1" or "EVS"
function toDecimal(text) {
  if (text == null) return NaN;
  const s = String(text).trim().toUpperCase();
  if (!s) return NaN;
  if (s === "EVS") return 2.0;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b) return round2(a / b + 1);
    return NaN;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
// 2dp string; avoid "-0.00"
function fmt2(n) {
  const v = Math.abs(n) < 1e-9 ? 0 : Math.round(n * 100) / 100;
  return v.toFixed(2);
}
async function safeText(res) {
  try {
    return await res.text();
  } catch  {
    return "";
  }
}
