// supabase/functions/race-results-scheduler/index.ts
// Sequential, rate-limited scheduler that ONLY fetches races without results.
// It reads from the DB view: public.races_pending_results
//
// Optional POST body:
//   { "limit": number, "rateMs": number }
//     - limit: max candidates per run (default 8, max 50)
//     - rateMs: delay between calls in ms (default 600 ≈ 1.6 calls/sec)
Deno.serve(async (req)=>{
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false"
  };
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    // --- CONFIG ---------------------------------------------------------------
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) throw new Error("Supabase configuration missing");
    // Optional runtime parameters
    let limit = 8; // small batch per run
    let rateMs = 600; // ~1.6 calls/sec (stays under your 2/sec budget)
    try {
      const isJson = req.headers.get("content-type")?.includes("application/json");
      const body = isJson ? await req.json() ?? {} : {};
      if (typeof body?.limit === "number" && body.limit > 0) limit = Math.min(50, body.limit);
      if (typeof body?.rateMs === "number" && body.rateMs >= 0) rateMs = body.rateMs;
    } catch  {
    // ignore malformed JSON
    }
    const FUNC_FETCH_RESULTS = `${supabaseUrl}/functions/v1/fetch-race-results`;
    // --- HELPERS --------------------------------------------------------------
    const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
    const safeJson = (t)=>{
      try {
        return JSON.parse(t);
      } catch  {
        return {};
      }
    };
    const fmtErr = (child, text, status)=>{
      const base = typeof child?.detail === "string" ? child.detail : typeof child?.error === "string" ? child.error : child?.error ? JSON.stringify(child.error) : text || "";
      return status ? `${base} [http ${status}]` : base;
    };
    // --- STEP 1: Pull ONLY races without results (from the view) --------------
    // View must exist:
    //   create or replace view public.races_pending_results as
    //   select r.* from public.races r
    //   left join public.race_results rr on rr.race_id = r.race_id
    //   where rr.race_id is null;
    const pendingResp = await fetch(`${supabaseUrl}/rest/v1/races_pending_results` + `?select=race_id,date,off_time,course_id` + `&order=date.asc,off_time.asc` + `&limit=${limit}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json"
      }
    });
    if (!pendingResp.ok) {
      const t = await pendingResp.text();
      console.error("Failed to fetch pending races:", t);
      return new Response(JSON.stringify({
        success: false,
        code: "LIST_PENDING_RACES_FAILED",
        message: "Failed to fetch pending races",
        detail: t
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const candidates = await pendingResp.json() ?? [];
    console.log(`Scheduler: ${candidates.length} pending races (limit=${limit})`);
    if (candidates.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No pending races (all done or none match filter)",
        processed_count: 0,
        ready_count: 0,
        not_ready_count: 0,
        failed_count: 0,
        results: []
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // --- STEP 2: Process sequentially with rate limiting ----------------------
    let processed_count = 0;
    let ready_count = 0; // child saved results
    let not_ready_count = 0; // upstream 404 / not available yet
    let failed_count = 0; // other failures
    const results = [];
    for (const race of candidates){
      if (rateMs > 0) await sleep(rateMs); // keep under your per-second limit
      try {
        console.log(`Scheduler: processing ${race.race_id}`);
        const res = await fetch(FUNC_FETCH_RESULTS, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            race_id: race.race_id
          })
        });
        const text = await res.text();
        const child = safeJson(text);
        const code = child?.code ?? null;
        const msg = child?.message ?? null;
        const notReady = code === "RESULT_NOT_AVAILABLE" || (msg ? /not available/i.test(msg) : false);
        const saved = res.ok && child?.success === true && !notReady;
        if (saved) {
          processed_count++;
          ready_count++;
          
          // Call our new function to update race entries, ML models, and bets
          try {
            console.log(`🔄 Updating race entries, ML models, and bets for ${race.race_id}`);
            const updateRes = await fetch(`${supabaseUrl}/functions/v1/update-race-results-and-bets`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                race_id: race.race_id
              })
            });
            
            if (updateRes.ok) {
              const updateData = await updateRes.json();
              console.log(`✅ Updated race results and bets for ${race.race_id}:`, updateData.summary);
            } else {
              console.warn(`⚠️ Failed to update race results and bets for ${race.race_id}`);
            }
          } catch (updateError) {
            console.error(`❌ Error updating race results and bets for ${race.race_id}:`, updateError);
          }
          
          results.push({
            race_id: race.race_id,
            success: true,
            code,
            message: msg
          });
          console.log(`✅ Saved ${race.race_id}`);
        } else if (notReady) {
          not_ready_count++;
          results.push({
            race_id: race.race_id,
            success: false,
            code: "RESULT_NOT_AVAILABLE",
            message: msg ?? "Result not available yet"
          });
          console.log(`⏰ Not ready ${race.race_id}`);
        } else {
          failed_count++;
          const errText = fmtErr(child, text, res?.status);
          results.push({
            race_id: race.race_id,
            success: false,
            code: code ?? "UPSTREAM_OR_INSERT_ERROR",
            message: msg,
            error: errText
          });
          console.warn(`❌ Failed ${race.race_id}: ${errText}`);
        }
      } catch (e) {
        failed_count++;
        results.push({
          race_id: race.race_id,
          success: false,
          code: "SCHEDULER_ERROR",
          message: e.message,
          error: e.stack ?? null
        });
        console.error(`Scheduler error ${race.race_id}:`, e);
      }
    }
    // --- STEP 3: Final response ----------------------------------------------
    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${processed_count} races`,
      processed_count,
      ready_count,
      not_ready_count,
      failed_count,
      results
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      code: "RACE_RESULTS_SCHEDULER_ERROR",
      message: error.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
