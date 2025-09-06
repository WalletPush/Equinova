// supabase/functions/fetch-race-results/index.ts
// Fetch a single race's results from upstream and persist into Supabase
// - 404 from upstream -> success:false, code:"RESULT_NOT_AVAILABLE"
// - UPSERTs into race_results (on race_id) and race_runners (on race_id, horse_id)
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
    // --- Config ----------------------------------------------------------------
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) throw new Error("Supabase configuration missing");
    // Upstream API creds (Basic)
    const API_USERNAME = "B06mvaMg9rdqfPBMJLe6wU0m";
    const API_PASSWORD = "WC4kl7E2GvweCA9uxFAywbOY";
    // --- Input ----------------------------------------------------------------
    const isJson = req.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await req.json() : {};
    const race_id = body?.race_id;
    if (!race_id || typeof race_id !== "string" || race_id.trim() === "") {
      return new Response(JSON.stringify({
        success: false,
        code: "BAD_REQUEST",
        message: "Missing required parameter: race_id"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // --- Fetch upstream --------------------------------------------------------
    const apiResp = await fetch(`https://api.theracingapi.com/v1/results/${encodeURIComponent(race_id)}`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${btoa(`${API_USERNAME}:${API_PASSWORD}`)}`,
        "Content-Type": "application/json"
      }
    });
    // 404 means result not published yet
    if (apiResp.status === 404) {
      const t = await apiResp.text();
      console.warn("Upstream 404 (not ready):", race_id, t);
      return new Response(JSON.stringify({
        success: false,
        code: "RESULT_NOT_AVAILABLE",
        message: "Result not available yet",
        race_id
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Other upstream errors
    if (!apiResp.ok) {
      const t = await apiResp.text();
      console.error("Upstream error:", apiResp.status, t);
      return new Response(JSON.stringify({
        success: false,
        code: "UPSTREAM_ERROR",
        message: `API call failed: ${apiResp.status}`,
        detail: safeText(t),
        race_id
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const raceData = await apiResp.json();
    // Basic sanity
    if (!raceData || typeof raceData !== "object" || raceData.race_id !== race_id) {
      return new Response(JSON.stringify({
        success: false,
        code: "UPSTREAM_PAYLOAD_INVALID",
        message: "Upstream payload missing/invalid",
        detail: tryStringify(raceData),
        race_id
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // --- Prepare race_results UPSERT ------------------------------------------
    const raceResultData = {
      race_id: raceData.race_id,
      date: raceData.date ?? null,
      region: raceData.region ?? null,
      course: raceData.course ?? null,
      course_id: raceData.course_id ?? null,
      off: raceData.off ?? null,
      off_dt: raceData.off_dt ?? null,
      race_name: raceData.race_name ?? null,
      type: raceData.type ?? null,
      class: raceData.class ?? null,
      pattern: raceData.pattern ?? null,
      rating_band: raceData.rating_band ?? null,
      age_band: raceData.age_band ?? null,
      sex_rest: raceData.sex_rest ?? null,
      dist: raceData.dist ?? null,
      dist_y: numOrNull(raceData.dist_y),
      dist_m: numOrNull(raceData.dist_m),
      dist_f: numOrNull(raceData.dist_f),
      going: raceData.going ?? null,
      surface: raceData.surface ?? null,
      jumps: raceData.jumps ?? null,
      winning_time_detail: raceData.winning_time_detail ?? null,
      comments: raceData.comments ?? null,
      non_runners: raceData.non_runners ?? null,
      tote_win: raceData.tote_win ?? null,
      tote_pl: raceData.tote_pl ?? null,
      tote_ex: raceData.tote_ex ?? null,
      tote_csf: raceData.tote_csf ?? null,
      tote_tricast: raceData.tote_tricast ?? null,
      tote_trifecta: raceData.tote_trifecta ?? null
    };
    // UPSERT race_results
    const upsertRaceResp = await fetch(`${supabaseUrl}/rest/v1/race_results?on_conflict=race_id`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates, return=representation"
      },
      body: JSON.stringify(raceResultData)
    });
    if (!upsertRaceResp.ok) {
      const t = await upsertRaceResp.text();
      console.error("race_results UPSERT failed:", upsertRaceResp.status, t);
      return new Response(JSON.stringify({
        success: false,
        code: "INSERT_RACE_RESULT_FAILED",
        message: "Failed to upsert race result",
        detail: safeText(t),
        race_id
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const insertedRace = await upsertRaceResp.json();
    // if your table has an internal id, you can read it here:
    // const raceResultRow = Array.isArray(insertedRace) ? insertedRace[0] : insertedRace;
    // --- Insert runners (UPSERT) ----------------------------------------------
    const runners = Array.isArray(raceData.runners) ? raceData.runners : [];
    let runnersInserted = 0;
    const runnerErrors = [];
    for (const runner of runners){
      const runnerData = {
        race_id: raceData.race_id,
        horse_id: runner.horse_id ?? null,
        horse: runner.horse ?? null,
        sp: runner.sp ?? null,
        sp_dec: floatOrNull(runner.sp_dec ?? convertSpToDecimal(runner.sp)),
        number: intOrNull(runner.number),
        position: intOrNull(runner.position),
        draw: intOrNull(runner.draw),
        btn: floatOrNull(runner.btn),
        ovr_btn: floatOrNull(runner.ovr_btn),
        age: intOrNull(runner.age),
        sex: runner.sex ?? null,
        weight: runner.weight ?? null,
        weight_lbs: intOrNull(runner.weight_lbs),
        headgear: runner.headgear ?? null,
        time: runner.time ?? null,
        or_rating: intOrNull(runner.or),
        rpr: intOrNull(runner.rpr),
        tsr: intOrNull(runner.tsr),
        prize: floatOrNull(runner.prize),
        jockey: runner.jockey ?? null,
        jockey_claim_lbs: intOrDefault(runner.jockey_claim_lbs, 0),
        jockey_id: runner.jockey_id ?? null,
        trainer: runner.trainer ?? null,
        trainer_id: runner.trainer_id ?? null,
        owner: runner.owner ?? null,
        owner_id: runner.owner_id ?? null,
        sire: runner.sire ?? null,
        sire_id: runner.sire_id ?? null,
        dam: runner.dam ?? null,
        dam_id: runner.dam_id ?? null,
        damsire: runner.damsire ?? null,
        damsire_id: runner.damsire_id ?? null,
        comment: runner.comment ?? null,
        silk_url: runner.silk_url ?? null
      };
      const upsertRunnerResp = await fetch(`${supabaseUrl}/rest/v1/race_runners?on_conflict=race_id,horse_id`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates, return=representation"
        },
        body: JSON.stringify(runnerData)
      });
      if (!upsertRunnerResp.ok) {
        const t = await upsertRunnerResp.text();
        runnerErrors.push({
          horse: runner.horse ?? null,
          status: upsertRunnerResp.status,
          body: safeText(t)
        });
      } else {
        runnersInserted++;
      }
    }
    // --- Decide outcome --------------------------------------------------------
    // If we saved at least the race row and any runner rows, mark success.
    // (You can decide to consider "race row only" as success if desired.)
    const savedAnything = runners.length === 0 ? true : runnersInserted > 0;
    if (!savedAnything) {
      return new Response(JSON.stringify({
        success: false,
        code: "INSERT_RUNNERS_FAILED",
        message: "No runners were saved",
        race_id,
        runners_count: runners.length,
        runners_inserted: runnersInserted,
        detail: runnerErrors
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      message: "Race results fetched and processed successfully",
      race_id,
      runners_count: runners.length,
      runners_inserted: runnersInserted,
      runner_errors: runnerErrors
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error(`fetch-race-results: unexpected error for race ${race_id}:`, error?.stack || error);
    return new Response(JSON.stringify({
      success: false,
      code: "FETCH_RACE_RESULTS_ERROR",
      message: error?.message || String(error)
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
// ---------------- helpers ----------------
function intOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function intOrDefault(v, d) {
  const n = intOrNull(v);
  return n === null ? d : n;
}
function floatOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function numOrNull(v) {
  // accepts numeric strings too
  return v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
}
function convertSpToDecimal(sp) {
  if (!sp) return null;
  const s = sp.trim().toUpperCase();
  if (s === "EVS") return 2.0; // evens
  if (s === "SP") return null; // unspecified starting price
  if (s.includes("/")) {
    const [num, den] = s.split("/").map((x)=>Number(x));
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return round2(num / den + 1);
    }
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n + 1 : null;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function safeText(t) {
  // trim to avoid massive error blobs
  return t.length > 8000 ? t.slice(0, 8000) + "...<truncated>" : t;
}
function tryStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch  {
    return String(obj);
  }
}
