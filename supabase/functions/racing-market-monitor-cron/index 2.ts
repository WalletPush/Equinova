// supabase/functions/racing-market-monitor-cron/index.ts
// Ladbrokes-only market monitor: updates snapshot and logs EVERY odds change.

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
      // ---- Time gate (UK 08:00–21:00) ----------------------------------------
      const now = new Date();
      const londonTimeString = now.toLocaleString('en-GB', {
        timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
      });
      const [hh, mm] = londonTimeString.split(':').map(Number);
      const minutes = hh * 60 + mm;
      if (minutes < 8 * 60) {
        return json({ success: true, message: `Not active yet (${londonTimeString} UK); starts 08:00` }, corsHeaders);
      }
      if (minutes >= 21 * 60) {
        return json({ success: true, message: `Ended for the day (${londonTimeString} UK); ends 21:00` }, corsHeaders);
      }
  
      // ---- Env ----------------------------------------------------------------
      const supabaseUrl = mustGetEnv('SUPABASE_URL');
      const supabaseKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
  
      // Racing API (Ladbrokes only)
      const API_USER = 'B06mvaMg9rdqfPBMJLe6wU0m';
      const API_PASS = 'WC4kl7E2GvweCA9uxFAywbOY';
      const auth = btoa(`${API_USER}:${API_PASS}`);
  
      console.log('[MM] Start (Ladbrokes only)');
  
      // ---- Fetch racecards ----------------------------------------------------
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
  
      // ---- Processing ---------------------------------------------------------
      let horsesProcessed = 0;
      let ladbrokesSeen = 0;
      let changesRecorded = 0;
      let unchanged = 0;
  
      // Helper to POST SQL
      const execSql = async (sql: string) => {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: sql })
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`exec_sql failed: HTTP ${r.status} - ${t}`);
        }
        return r;
      };
  
      // Tiny sanitizer for SQL strings
      const esc = (v: unknown) => String(v ?? '').replace(/'/g, "''");
  
      for (const race of racecards) {
        const runners = Array.isArray(race?.runners) ? race.runners : [];
        for (const runner of runners) {
          horsesProcessed++;
  
          // --- pick Ladbrokes only (tolerant casing/spacing) -------------------
          const lad = (runner?.odds || []).find((o: any) =>
            String(o?.bookmaker || '').trim().toLowerCase() === 'ladbrokes'
          );
          if (!lad || !lad.decimal) continue;
  
          ladbrokesSeen++;
  
          const race_id = race.race_id;
          const horse_id = runner.horse_id;
          const course = race.course;
          const off_time = race.off_time;
          const fractional = lad.fractional || '';
          const decimalNow = parseFloat(lad.decimal);
          const updated = lad.updated || new Date().toISOString();
  
          // --- fetch existing snapshot for this horse --------------------------
          let prevDecimal: number | null = null;
          let initialOdds = fractional;
  
          {
            const getUrl =
              `${supabaseUrl}/rest/v1/horse_market_movement` +
              `?select=decimal_odds,initial_odds&race_id=eq.${encodeURIComponent(race_id)}` +
              `&horse_id=eq.${encodeURIComponent(horse_id)}` +
              `&bookmaker=eq.${encodeURIComponent('Ladbrokes')}` +
              `&limit=1`;
            const exRes = await fetch(getUrl, {
              headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
            });
            if (exRes.ok) {
              const rows = await exRes.json();
              if (rows?.length) {
                prevDecimal = rows[0]?.decimal_odds ?? null;
                // keep original initial_odds if already set
                initialOdds = rows[0]?.initial_odds || initialOdds;
              }
            }
          }
  
          // --- compute movement & build statements -----------------------------
          let changeAbs = 0;
          let changePct: number | null = null;
          let direction = 'stable';
  
          if (prevDecimal != null && isFinite(prevDecimal) && prevDecimal !== decimalNow) {
            changeAbs = +(decimalNow - prevDecimal).toFixed(2);
            changePct = prevDecimal !== 0 ? +(100 * (changeAbs / prevDecimal)).toFixed(2) : null;
            direction = changeAbs < 0 ? 'in' : 'out'; // IN = shortened (more likely), OUT = lengthened
          }
  
          // Snapshot UPSERT (always keep current)
          const upsertSql = `
            insert into horse_market_movement (
              race_id, horse_id, course, off_time, bookmaker,
              initial_odds, current_odds, decimal_odds, prev_decimal_odds,
              odds_change, odds_movement, odds_movement_pct,
              last_updated, created_at, updated_at
            ) values (
              '${esc(race_id)}','${esc(horse_id)}','${esc(course)}','${esc(off_time)}','Ladbrokes',
              '${esc(initialOdds)}','${decimalNow} (${esc(fractional)})', ${decimalNow},
              ${prevDecimal == null ? 'null' : prevDecimal},
              ${changeAbs}, '${direction === 'stable' ? 'stable' : (direction === 'in' ? 'steaming' : 'drifting')}',
              ${changePct == null ? 'null' : changePct},
              '${esc(updated)}', now(), now()
            )
            on conflict (race_id, horse_id, bookmaker) do update set
              current_odds       = excluded.current_odds,
              prev_decimal_odds  = horse_market_movement.decimal_odds,
              decimal_odds       = excluded.decimal_odds,
              odds_change        = excluded.odds_change,
              odds_movement      = excluded.odds_movement,
              odds_movement_pct  = excluded.odds_movement_pct,
              last_updated       = excluded.last_updated,
              updated_at         = excluded.updated_at;
          `;
  
          // Change log insert (only when price actually moved)
          const changeSql = (prevDecimal != null && prevDecimal !== decimalNow)
            ? `
              insert into horse_market_movement_changes (
                race_id, horse_id, bookmaker,
                from_decimal, to_decimal, change_abs, change_pct, direction,
                source_updated_at, course, off_time
              ) values (
                '${esc(race_id)}','${esc(horse_id)}','Ladbrokes',
                ${prevDecimal}, ${decimalNow},
                ${changeAbs}, ${changePct == null ? 'null' : changePct},
                '${direction}',
                '${esc(updated)}','${esc(course)}','${esc(off_time)}'
              );
            `
            : '';
  
          try {
            await execSql(upsertSql);
            if (changeSql) {
              await execSql(changeSql);
              changesRecorded++;
              console.log(`[MM] ${horse_id} ${direction.toUpperCase()}: ${prevDecimal} -> ${decimalNow}`);
            } else {
              unchanged++;
            }
          } catch (e: any) {
            console.error(`[MM] DB error for ${horse_id}:`, e?.message || e);
          }
        }
            }

      // Update persistent market movers
      try {
        console.log('[MM] Updating persistent market movers...');
        const updateResponse = await fetch(`${supabaseUrl}/functions/v1/update-persistent-market-movers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
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
        message: 'Ladbrokes market snapshot updated; ALL changes logged',
        horses_processed: horsesProcessed,
        ladbrokes_seen: ladbrokesSeen,
        changes_recorded: changesRecorded,
        unchanged
      }, corsHeaders);
  
    } catch (err: any) {
      console.error('Racing market monitor error:', err);
      return json({
        success: false,
        error: { code: 'RACING_MARKET_ERROR', message: err?.message || String(err) }
      }, corsHeaders, 500);
    }
  });
  
  // -------------------- helpers --------------------
  function mustGetEnv(k: string): string {
    const v = Deno.env.get(k);
    if (!v) throw new Error(`Missing env: ${k}`);
    return v;
  }
  function json(body: any, headers: Record<string,string>, status = 200) {
    return new Response(JSON.stringify(body), {
      status, headers: { ...headers, 'Content-Type': 'application/json' }
    });
  }
  