// supabase/functions/ai-top-picks/index.ts
// Returns horses where N models agree on the per-model top pick in each race.
//
// Query params:
//   ?date=YYYY-MM-DD        default: today (Europe/London)
//   ?min_agree=3            default: 3 (clamped to [1..5])
//   ?min_prob=0             default: 0 (ignore model tops below this)

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "false",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url = new URL(req.url);

    // -------- inputs --------
    const minAgree = Math.max(1, Math.min(5, Number(url.searchParams.get("min_agree") ?? "3")));
    const minProb  = Number(url.searchParams.get("min_prob") ?? "0") || 0;

    const date = (() => {
      const forced = url.searchParams.get("date");
      if (forced) return forced;
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date());
      const get = (t: string) => parts.find(p => p.type === t)?.value!;
      return `${get("year")}-${get("month")}-${get("day")}`;
    })();

    const headers = { "Authorization": `Bearer ${supabaseKey}`, "apikey": supabaseKey };
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    // -------- 1) races for date --------
    const racesRes = await fetch(
      `${supabaseUrl}/rest/v1/races?date=eq.${date}&select=race_id,off_time,date,course_name,race_class,distance,field_size,prize,surface`,
      { headers }
    );
    if (!racesRes.ok) return json({ success:false, step:"races", status:racesRes.status, error: await racesRes.text() }, 500);
    const races: Array<{ 
      race_id: string; 
      off_time: string | null; 
      date: string;
      course_name: string;
      race_class: string;
      distance: string;
      field_size: number;
      prize: string;
      surface: string;
    }> = await racesRes.json();
    if (!races?.length) return json({ success:true, date, min_agree:minAgree, count:0, data:[], message:"No races for date" });

    const raceIds = races.map(r => r.race_id);
    const raceMeta = new Map(races.map(r => [r.race_id, { 
      off_time: r.off_time, 
      date: r.date,
      course_name: r.course_name,
      race_class: r.race_class || 'Class 4',
      distance: r.distance || '1m',
      field_size: r.field_size || 10,
      prize: r.prize || '8140',
      surface: r.surface || 'Turf'
    }]));
    const inList = raceIds.join(","); // ids like rac_1234 are safe in PostgREST in.(...)

    // -------- 2) entries for those races --------
    const entriesRes = await fetch(
      `${supabaseUrl}/rest/v1/race_entries` +
      `?race_id=in.(${inList})` +
      `&select=race_id,horse_id,horse_name,trainer_name,jockey_name,current_odds,silk_url,number,` +
      `mlp_proba,rf_proba,xgboost_proba,benter_proba,ensemble_proba`,
      { headers }
    );
    if (!entriesRes.ok) return json({ success:false, step:"entries", status:entriesRes.status, error: await entriesRes.text() }, 500);
    const entries: any[] = await entriesRes.json();

    // group entries by race
    const byRace: Record<string, any[]> = {};
    for (const e of entries) (byRace[e.race_id] ??= []).push(e);

    // tie-breaker: prefer higher ensemble, then shorter odds, then name
    const tieRank = (row: any) => {
      const ens = Number(row?.ensemble_proba ?? 0);
      const odds = Number(row?.current_odds ?? Infinity);
      // Higher ensemble is better -> use negative so larger => smaller rank
      // Shorter odds are better
      return [-ens, odds, String(row?.horse_name ?? "")] as const;
    };

    // pick top for a probability field with minProb and tie-breaks
    const topFor = (rows: any[], field: string) => {
      let bestRow: any = null;
      let bestProb = -Infinity;
      let bestTie: any = null;

      for (const r of rows) {
        const p = Number(r?.[field] ?? 0);
        if (!Number.isFinite(p) || p < minProb) continue;

        if (p > bestProb) {
          bestProb = p;
          bestRow = r;
          bestTie = tieRank(r);
        } else if (p === bestProb && bestRow) {
          const t = tieRank(r);
          // lexicographic compare of [-ensemble, odds, name]
          if (t < bestTie) { bestRow = r; bestTie = t; }
        }
      }
      return bestRow ? { pick: bestRow, p: Number(bestProb.toFixed(6)) } : null;
    };

    const models = [
      { key: "mlp",      field: "mlp_proba" },
      { key: "rf",       field: "rf_proba" },
      { key: "xgboost",  field: "xgboost_proba" },
      { key: "benter",   field: "benter_proba" },
      { key: "ensemble", field: "ensemble_proba" },
    ] as const;

    const results: any[] = [];

    // -------- 3) per-race: compute model tops & agreements --------
    for (const r of races) {
      const rows = byRace[r.race_id] ?? [];
      if (!rows.length) continue;

      // per-model top horse in this race
      const tops: Record<string, { horse_id: string; horse_name: string; prob: number }> = {};
      for (const m of models) {
        const t = topFor(rows, m.field);
        if (t) {
          tops[m.key] = {
            horse_id: String(t.pick.horse_id),
            horse_name: t.pick.horse_name,
            prob: t.p,
          };
        }
      }

      // count agreements by horse
      const counts = new Map<string, { models: string[]; horse: { horse_id: string; horse_name: string; prob: number } }>();
      for (const m of models) {
        const t = tops[m.key]; if (!t) continue;
        const key = `${r.race_id}::${t.horse_id}`;
        if (!counts.has(key)) counts.set(key, { models: [], horse: t });
        counts.get(key)!.models.push(m.key);
      }

      // keep only horses meeting the threshold
      const agreed = Array.from(counts.values())
        .filter(b => b.models.length >= minAgree)
        .sort((a, b) => b.models.length - a.models.length || b.horse.prob - a.horse.prob);

      for (const g of agreed) {
        const eRow = rows.find(row => String(row.horse_id) === g.horse.horse_id);
        const raceInfo = raceMeta.get(r.race_id);
        results.push({
          race_id: r.race_id,
          off_time: raceInfo?.off_time ?? null,
          horse_id: g.horse.horse_id,
          horse_name: g.horse.horse_name,
          models_agree: g.models.length,
          models: g.models.sort(),             // e.g. ["benter","ensemble","rf"]
          max_probability: g.horse.prob,
          trainer_name: eRow?.trainer_name ?? null,
          jockey_name:  eRow?.jockey_name ?? null,
          current_odds: eRow?.current_odds ?? null,
          silk_url:     eRow?.silk_url ?? null,
          number:       eRow?.number ?? null,
          // Race details from races table
          course_name: raceInfo?.course_name || 'Unknown',
          race_class: raceInfo?.race_class || 'Class 4',
          dist: raceInfo?.distance || '1m',
          field_size: raceInfo?.field_size || 10,
          prize: raceInfo?.prize || '8140',
          surface: raceInfo?.surface || 'Turf',
          ai_reason: `${g.models.length} model top pick`,
          source: "ai_top_picks",
        });
      }
    }

    // -------- 4) sort and return --------
    // Convert stored times to minutes: only 01:XX-09:XX are PM, 10-12 are morning/noon
    const raceTimeMinutes = (t: string | null): number => {
      if (!t) return 0;
      const [h, m] = t.substring(0, 5).split(":").map(Number);
      return (h >= 1 && h <= 9 ? h + 12 : h) * 60 + (m || 0);
    };
    results.sort((a, b) => {
      const ta = raceTimeMinutes(a.off_time), tb = raceTimeMinutes(b.off_time);
      if (ta !== tb) return ta - tb;                          // time first
      if (a.models_agree !== b.models_agree) return b.models_agree - a.models_agree; // agreements next
      return b.max_probability - a.max_probability;         // then prob
    });

    return json({
      success: true,
      date,
      min_agree: minAgree,
      min_prob: minProb,
      races_considered: races.length,
      entries_considered: entries.length,
      count: results.length,
      data: results,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success:false, error: err?.message || String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});