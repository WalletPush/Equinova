// supabase/functions/racing-market-monitor-cron/index.ts
// Betfair-only market monitor: keeps a rolling snapshot and movement in horse_market_movement.

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // ---- Time gate (UK 08:00–21:00)
    const now = new Date();
    const hhmm = now.toLocaleString('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const [hh, mm] = hhmm.split(':').map(Number);
    const minutes = hh * 60 + mm;
    if (minutes < 8 * 60) {
      return json({ success: true, message: `Not active yet (${hhmm} UK); starts 08:00` }, corsHeaders);
    }
    if (minutes >= 21 * 60) {
      return json({ success: true, message: `Ended for the day (${hhmm} UK); ends 21:00` }, corsHeaders);
    }

    // ---- Env
    const supabaseUrl = mustGetEnv('SUPABASE_URL');
    const supabaseKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');

    // Racing API (same creds you were using)
    const API_USER = 'B06mvaMg9rdqfPBMJLe6wU0m';
    const API_PASS = 'WC4kl7E2GvweCA9uxFAywbOY';
    const auth = btoa(`${API_USER}:${API_PASS}`);

    const restHeaders: Record<string, string> = {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
      // merge-duplicates + return row so we can log what the DB stored
      'Prefer': 'resolution=merge-duplicates,return=representation'
    };

    console.log('[MM] Start (Betfair only)');

    // ---- Fetch racecards
    const apiRes = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    });
    if (!apiRes.ok) {
      const t = await apiRes.text();
      throw new Error(`Racing API failed: ${apiRes.status} - ${t}`);
    }
    const data = await apiRes.json();
    const racecards = Array.isArray(data?.racecards) ? data.racecards : [];
    if (racecards.length === 0) {
      return json({ success: true, message: 'No racecards from API', horses_processed: 0 }, corsHeaders);
    }

    // ---- Processing
    let horsesProcessed = 0;
    let betfairSeen = 0;
    let changedCount = 0;
    let unchanged = 0;

    // small escape util for building "current_odds"
    const escText = (v: unknown) => String(v ?? '').replace(/'/g, "''");

    for (const race of racecards) {
      const runners = Array.isArray(race?.runners) ? race.runners : [];
      for (const runner of runners) {
        horsesProcessed++;

        // Betfair only (case/space tolerant)
        const bf = (runner?.odds || []).find(
          (o: any) => String(o?.bookmaker || '').trim().toLowerCase() === 'betfair'
        );
        if (!bf || !bf.decimal) continue;
        betfairSeen++;

        const race_id = race.race_id;
        const horse_id = runner.horse_id;
        const course = race.course;
        const off_time = race.off_time;
        const fractional = bf.fractional || '';
        const decimalNow = Number(bf.decimal);
        const updated = bf.updated || new Date().toISOString();

        // fetch existing snapshot row (if any)
        let existing: any = null;
        try {
          const getUrl =
            `${supabaseUrl}/rest/v1/horse_market_movement` +
            `?select=id,decimal_odds,initial_odds,change_count,last_change_at` +
            `&race_id=eq.${encodeURIComponent(race_id)}` +
            `&horse_id=eq.${encodeURIComponent(horse_id)}` +
            `&bookmaker=eq.${encodeURIComponent('Betfair')}` +
            `&limit=1`;
          const exRes = await fetch(getUrl, { headers: restHeaders });
          if (exRes.ok) {
            const rows = await exRes.json();
            existing = rows?.[0] ?? null;
          }
        } catch (_) {
          // treat as first write
        }

        const prev = Number(existing?.decimal_odds);
        const hadPrev = Number.isFinite(prev);
        const priceChanged = hadPrev && prev !== decimalNow;

        const changeAbs = priceChanged ? +(decimalNow - prev).toFixed(2) : 0;
        const changePct = priceChanged && prev !== 0 ? +(100 * (changeAbs / prev)).toFixed(2) : null;
        const movement = priceChanged ? (decimalNow < prev ? 'steaming' : 'drifting') : 'stable';

        // retain the very first fractional string we saw
        const initialOdds = existing?.initial_odds ?? (fractional || null);

        // optional counters if you added these columns
        const nextChangeCount = (existing?.change_count ?? 0) + (priceChanged ? 1 : 0);
        const lastChangeAt = priceChanged ? new Date().toISOString() : (existing?.last_change_at ?? null);

        // build payload for REST upsert
        const payload: Record<string, unknown> = {
          race_id,
          horse_id,
          bookmaker: 'Betfair',
          course,
          off_time,
          initial_odds: initialOdds,
          current_odds: `${decimalNow} (${escText(fractional)})`,
          prev_decimal_odds: hadPrev ? prev : null,
          decimal_odds: decimalNow,
          odds_change: changeAbs,
          odds_movement: movement,          // 'steaming' | 'drifting' | 'stable'
          odds_movement_pct: changePct,     // nullable
          last_updated: updated,
          updated_at: new Date().toISOString()
        };

        // include these only if your table has them
        if ('change_count' in (existing ?? {}) || priceChanged) {
          (payload as any).change_count = nextChangeCount;
        }
        if ('last_change_at' in (existing ?? {}) || priceChanged) {
          (payload as any).last_change_at = lastChangeAt;
        }

        const upsertRes = await fetch(
          `${supabaseUrl}/rest/v1/horse_market_movement?on_conflict=race_id,horse_id,bookmaker`,
          { method: 'POST', headers: restHeaders, body: JSON.stringify(payload) }
        );

        if (!upsertRes.ok) {
          console.error(`[MM] SNAPSHOT UPSERT FAIL ${race_id}/${horse_id}:`, await upsertRes.text());
        } else {
          if (priceChanged) changedCount++; else unchanged++;
          const saved = await upsertRes.json();
          const row = Array.isArray(saved) ? saved[0] : saved;
          console.log(`[MM] SNAPSHOT OK ${race_id}/${horse_id}`, {
            from: hadPrev ? prev : null,
            to: decimalNow,
            movement,
            change_count: row?.change_count ?? null
          });
        }
      }
    }

    // (Optional) keep this if your other pipeline depends on it
    try {
      console.log('[MM] Updating persistent market movers...');
      const updateResponse = await fetch(`${supabaseUrl}/functions/v1/update-persistent-market-movers`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' }
      });
      if (updateResponse.ok) {
        const updateResult = await updateResponse.json();
        console.log('[MM] Persistent market movers updated:', updateResult.summary);
      } else {
        console.warn('[MM] Failed to update persistent market movers');
      }
    } catch (error) {
      console.error('[MM] Error updating persistent market movers:', error);
    }

    return json({
      success: true,
      message: 'Betfair market snapshot updated; movement stored in snapshot',
      horses_processed: horsesProcessed,
      betfair_seen: betfairSeen,
      prices_changed: changedCount,
      unchanged
    }, corsHeaders);

  } catch (err: any) {
    console.error('Racing market monitor error:', err);
    return json({ success: false, error: { code: 'RACING_MARKET_ERROR', message: err?.message || String(err) } }, corsHeaders, 500);
  }
});

// -------------------- helpers --------------------
function mustGetEnv(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}
function json(body: any, headers: Record<string,string>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
