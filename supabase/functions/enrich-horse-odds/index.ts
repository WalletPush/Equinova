// supabase/functions/enrich-horse-odds/index.ts
// Selective per-horse odds enrichment using TheRacingAPI /v1/odds/{race_id}/{horse_id}
//
// Called with a list of { race_id, horse_id } pairs (market movers, ML picks, value bets).
// For each horse:
//   1. Fetches detailed per-bookmaker odds + price history
//   2. Inserts timestamped records into horse_odds_history
//   3. Updates horse_market_movement with latest Betfair price
//   4. Updates race_entries.current_odds so all UI displays refresh
//
// Rate limit: 5 requests/second to TheRacingAPI — we self-throttle with 220ms delays.

Deno.serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    // ── Env ──
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SUPABASE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const API_USER = "B06mvaMg9rdqfPBMJLe6wU0m";
    const API_PASS = "WC4kl7E2GvweCA9uxFAywbOY";
    const apiAuth = btoa(`${API_USER}:${API_PASS}`);

    const restHeaders = {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };

    // ── Parse request ──
    const body = await req.json().catch(() => ({}));
    const horses: { race_id: string; horse_id: string }[] = Array.isArray(body.horses) ? body.horses : [];

    if (horses.length === 0) {
      return json({ success: true, message: "No horses to enrich", enriched: 0 });
    }

    // Cap at 60 horses per call (keeps within ~13 seconds at 5 req/s)
    const batch = horses.slice(0, 60);

    const results: {
      race_id: string;
      horse_id: string;
      status: "ok" | "error" | "no_data";
      latestOdds?: number;
      fractional?: string;
      bookmakers?: number;
      historyPoints?: number;
    }[] = [];

    // ── Process each horse with rate limiting ──
    for (let i = 0; i < batch.length; i++) {
      const { race_id, horse_id } = batch[i];

      try {
        // Rate limit: 220ms between requests (≈4.5/sec, safely under 5/sec limit)
        if (i > 0) await sleep(220);

        const url = `https://api.theracingapi.com/v1/odds/${encodeURIComponent(race_id)}/${encodeURIComponent(horse_id)}`;
        const apiRes = await fetch(url, {
          headers: {
            Authorization: `Basic ${apiAuth}`,
            "Content-Type": "application/json",
          },
        });

        if (!apiRes.ok) {
          const errText = await safeText(apiRes);
          console.error(`[enrich] ${race_id}/${horse_id} API ${apiRes.status}: ${errText}`);
          results.push({ race_id, horse_id, status: "error" });
          continue;
        }

        const data = await apiRes.json().catch(() => null);
        if (!data) {
          results.push({ race_id, horse_id, status: "no_data" });
          continue;
        }

        // ── Parse response ──
        // Expected format from TheRacingAPI /v1/odds/{race_id}/{horse_id}:
        // {
        //   "horse_id": "...",
        //   "race_id": "...",
        //   "odds": [
        //     {
        //       "bookmaker": "Betfair",
        //       "decimal": "5.0",
        //       "fractional": "4/1",
        //       "updated": "2026-02-12T10:30:00Z",
        //       "history": [
        //         { "decimal": "6.0", "fractional": "5/1", "recorded_at": "..." },
        //         ...
        //       ]
        //     },
        //     ...
        //   ]
        // }

        const oddsEntries = Array.isArray(data.odds) ? data.odds : [];
        if (oddsEntries.length === 0) {
          results.push({ race_id, horse_id, status: "no_data" });
          continue;
        }

        // ── 1. Insert history records ──
        const historyRows: any[] = [];
        const now = new Date().toISOString();

        for (const bk of oddsEntries) {
          const bookmaker = String(bk.bookmaker || "Unknown");
          const currentDec = Number(bk.decimal);
          const currentFrac = String(bk.fractional || "");

          // Current price as a history point
          if (Number.isFinite(currentDec) && currentDec > 0) {
            historyRows.push({
              race_id,
              horse_id,
              bookmaker,
              decimal_odds: currentDec,
              fractional_odds: currentFrac || null,
              recorded_at: bk.updated || now,
              source: "enrichment",
            });
          }

          // Historical prices if available
          const history = Array.isArray(bk.history) ? bk.history : [];
          for (const h of history) {
            const hDec = Number(h.decimal);
            if (Number.isFinite(hDec) && hDec > 0) {
              historyRows.push({
                race_id,
                horse_id,
                bookmaker,
                decimal_odds: hDec,
                fractional_odds: h.fractional || null,
                recorded_at: h.recorded_at || h.timestamp || now,
                source: "enrichment_history",
              });
            }
          }
        }

        // Bulk insert history (no conflict — append-only)
        if (historyRows.length > 0) {
          const histUrl = `${SUPABASE_URL}/rest/v1/horse_odds_history`;
          const histRes = await fetch(histUrl, {
            method: "POST",
            headers: { ...restHeaders, Prefer: "return=minimal" },
            body: JSON.stringify(historyRows),
          });
          if (!histRes.ok) {
            console.error(`[enrich] history insert failed ${histRes.status}: ${await safeText(histRes)}`);
          }
        }

        // ── 2. Update horse_market_movement with Betfair price ──
        const betfair = oddsEntries.find((o: any) => /betfair/i.test(String(o.bookmaker || "")));
        const bestOdds = betfair || oddsEntries[0]; // Prefer Betfair, fallback to first
        const latestDec = Number(bestOdds?.decimal);
        const latestFrac = String(bestOdds?.fractional || "");

        if (Number.isFinite(latestDec) && latestDec > 0) {
          // Fetch existing row to compute movement
          const existUrl = `${SUPABASE_URL}/rest/v1/horse_market_movement` +
            `?race_id=eq.${encodeURIComponent(race_id)}` +
            `&horse_id=eq.${encodeURIComponent(horse_id)}` +
            `&bookmaker=eq.Betfair` +
            `&select=initial_odds,decimal_odds,change_count`;
          const existRes = await fetch(existUrl, { headers: restHeaders });
          const existRows = existRes.ok ? await existRes.json().catch(() => []) : [];
          const existing = existRows[0] || null;

          const initialOdds = existing?.initial_odds || String(latestDec);
          const initialNum = toDecimal(initialOdds);
          const diff = Number.isFinite(initialNum) ? latestDec - initialNum : 0;
          const changePct = Number.isFinite(initialNum) && initialNum !== 0
            ? round2(100 * (diff / initialNum))
            : null;
          const movement = Number.isFinite(initialNum)
            ? latestDec < initialNum ? "steaming"
            : latestDec > initialNum ? "drifting"
            : "stable"
            : "stable";
          const prevDec = Number(existing?.decimal_odds ?? NaN);
          const priceChanged = Number.isFinite(prevDec) ? prevDec !== latestDec : false;
          const changeCount = (Number(existing?.change_count) || 0) + (priceChanged ? 1 : 0);

          const upsertRow = {
            race_id,
            horse_id,
            bookmaker: "Betfair",
            initial_odds: initialOdds,
            current_odds: String(latestDec),
            decimal_odds: latestDec,
            prev_decimal_odds: Number.isFinite(prevDec) ? prevDec : null,
            odds_change: fmt2(diff),
            odds_movement: movement,
            odds_movement_pct: changePct,
            last_updated: now,
            updated_at: now,
            change_count: changeCount,
            last_change_at: priceChanged ? now : null,
          };

          const upUrl = `${SUPABASE_URL}/rest/v1/horse_market_movement?on_conflict=race_id,horse_id,bookmaker`;
          const upRes = await fetch(upUrl, {
            method: "POST",
            headers: { ...restHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([upsertRow]),
          });
          if (!upRes.ok) {
            console.error(`[enrich] market movement upsert failed ${upRes.status}: ${await safeText(upRes)}`);
          }

          // ── 3. Update race_entries.current_odds so ALL UI displays refresh ──
          const reUrl = `${SUPABASE_URL}/rest/v1/race_entries` +
            `?race_id=eq.${encodeURIComponent(race_id)}` +
            `&horse_id=eq.${encodeURIComponent(horse_id)}`;
          const reRes = await fetch(reUrl, {
            method: "PATCH",
            headers: { ...restHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ current_odds: latestDec }),
          });
          if (!reRes.ok) {
            console.error(`[enrich] race_entries update failed ${reRes.status}: ${await safeText(reRes)}`);
          }
        }

        results.push({
          race_id,
          horse_id,
          status: "ok",
          latestOdds: Number.isFinite(latestDec) ? latestDec : undefined,
          fractional: latestFrac || undefined,
          bookmakers: oddsEntries.length,
          historyPoints: historyRows.length,
        });
      } catch (err) {
        console.error(`[enrich] ${race_id}/${horse_id} error:`, err?.message ?? String(err));
        results.push({ race_id, horse_id, status: "error" });
      }
    }

    const enriched = results.filter((r) => r.status === "ok").length;
    const errors = results.filter((r) => r.status === "error").length;

    return json({
      success: true,
      message: `Enriched ${enriched}/${batch.length} horses (${errors} errors)`,
      total: batch.length,
      enriched,
      errors,
      results,
    });
  } catch (e) {
    console.error("enrich-horse-odds error:", e?.message ?? String(e));
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});

// ── Utils ──

function mustEnv(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toDecimal(text: string | null): number {
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt2(n: number): string {
  const v = Math.abs(n) < 1e-9 ? 0 : Math.round(n * 100) / 100;
  return v.toFixed(2);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
