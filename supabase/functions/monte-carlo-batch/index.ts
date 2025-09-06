// supabase/functions/monte-carlo-batch/index.ts
// Batch worker to run Monte Carlo simulations for pending jobs (max concurrency 5)

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase configuration');

    // Fetch up to 5 pending, unlocked jobs
    const jobsResp = await fetch(`${supabaseUrl}/rest/v1/monte_carlo_jobs?status=eq.pending&locked_until=is.null&select=*&order=priority.asc,id.asc&limit=5`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${serviceRole}`, 'apikey': serviceRole }
    });
    if (!jobsResp.ok) throw new Error(`Failed to fetch jobs: ${jobsResp.status}`);
    const jobs = await jobsResp.json();
    if (!jobs || jobs.length === 0) return new Response(JSON.stringify({ success: true, processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const resultsSummary: any[] = [];

    for (const job of jobs) {
      try {
        // claim job (set status=running, locked_until)
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes lock
        const claimResp = await fetch(`${supabaseUrl}/rest/v1/monte_carlo_jobs?id=eq.${job.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRole}`,
            'apikey': serviceRole,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ status: 'running', locked_until: lockUntil, started_at: new Date().toISOString(), attempt_count: (job.attempt_count || 0) + 1 })
        });
        if (!claimResp.ok) throw new Error(`Failed to claim job ${job.id}`);

        // fetch runners for the race
        const raceId = job.race_id;
        const sims = job.num_simulations || 10000;
        const runnersResp = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(raceId)}&select=id,horse_id,horse_name,current_odds,trainer_21_days_win_percentage,jockey_21_days_win_percentage,rf_proba,ensemble_proba,benter_proba,xgboost_proba,mlp_proba`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${serviceRole}`, 'apikey': serviceRole }
        });
        if (!runnersResp.ok) throw new Error(`Failed to fetch runners for ${raceId}: ${runnersResp.status}`);
        const runners = await runnersResp.json();
        if (!runners || runners.length === 0) throw new Error(`No runners for race ${raceId}`);

        // prepare runners
        const prepared = runners.map((r: any) => ({
          entry_id: r.id,
          horse_id: String(r.horse_id),
          horse_name: r.horse_name,
          current_odds: r.current_odds || 10,
          trainer_21_days_win_percentage: r.trainer_21_days_win_percentage,
          jockey_21_days_win_percentage: r.jockey_21_days_win_percentage,
          rf_proba: (r.rf_proba || 0) / 100,
          ensemble_proba: (r.ensemble_proba || 0) / 100,
          benter_proba: (r.benter_proba || 0) / 100,
          xgboost_proba: (r.xgboost_proba || 0) / 100,
          mlp_proba: (r.mlp_proba || 0) / 100
        }));

        // run simulations
        const winCounts = new Map<string, number>();
        for (const pr of prepared) winCounts.set(pr.horse_id, 0);

        const numSims = Number(sims);
        const weights = { ensemble: 0.35, benter: 0.25, xgboost: 0.15, mlp: 0.15, rf: 0.10 };

        for (let sim = 0; sim < numSims; sim++) {
          const scores = prepared.map(p => {
            let base = p.ensemble_proba * weights.ensemble + p.benter_proba * weights.benter + p.xgboost_proba * weights.xgboost + p.mlp_proba * weights.mlp + p.rf_proba * weights.rf;
            const randomFactor = 0.8 + Math.random() * 0.4;
            const adjusted = Math.min(Math.max(base * randomFactor, 0.0001), 0.9999);
            let formModifier = 1.0;
            if (p.trainer_21_days_win_percentage) formModifier *= 1 + (p.trainer_21_days_win_percentage - 15) / 100;
            if (p.jockey_21_days_win_percentage) formModifier *= 1 + (p.jockey_21_days_win_percentage - 12) / 100;
            const finalProb = Math.min(Math.max(adjusted * formModifier, 0.0001), 0.9999);
            return { horse_id: p.horse_id, score: Math.random() * finalProb };
          });
          const winner = scores.reduce((a, b) => (b.score > a.score ? b : a));
          winCounts.set(winner.horse_id, (winCounts.get(winner.horse_id) || 0) + 1);
        }

        // compute results and upsert into monte_carlo_results
        for (const p of prepared) {
          const wins = winCounts.get(p.horse_id) || 0;
          const winProb = wins / numSims;
          const implied = p.current_odds ? (1 / p.current_odds) : null;
          const expectedReturn = implied ? (winProb * p.current_odds - 1) : null;
          const kelly = (winProb && p.current_odds) ? Math.max(0, Math.min(0.25, (winProb * p.current_odds - 1) / (p.current_odds - 1))) : 0;
          const confidence = Math.round(Math.min(95, Math.max(50, (winProb / Math.max(0.0001, implied || 0.0001)) * 60 + numSims / 10000 * 20)));
          const risk = (winProb >= 0.25 && expectedReturn && expectedReturn >= 0.20) ? 'Low Risk' : (winProb >= 0.15 && expectedReturn && expectedReturn >= 0.10) ? 'Medium Risk' : 'High Risk';

          const row = {
            race_id: raceId,
            horse_id: p.horse_id,
            monte_carlo_probability: Number(winProb.toFixed(6)),
            num_simulations: numSims,
            implied_probability: implied,
            expected_return: expectedReturn,
            kelly_fraction: kelly,
            confidence: confidence,
            risk_assessment: risk,
            is_value_bet: (winProb > (implied || 0) && winProb >= 0.10 && (expectedReturn || 0) > 0.05),
            metadata: { generated_at: new Date().toISOString() }
          };

          // Try to update existing row
          const patchResp = await fetch(`${supabaseUrl}/rest/v1/monte_carlo_results?race_id=eq.${encodeURIComponent(raceId)}&horse_id=eq.${encodeURIComponent(p.horse_id)}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${serviceRole}`,
              'apikey': serviceRole,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(row)
          });

          // If PATCH did not update any row (204 No Content) or failed, insert instead
          if (!patchResp.ok || patchResp.status === 204) {
            const insertResp = await fetch(`${supabaseUrl}/rest/v1/monte_carlo_results`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRole}`,
                'apikey': serviceRole,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify(row)
            });
            if (!insertResp.ok) console.warn('Failed to insert monte carlo row', await insertResp.text());
          }
        }

        // mark job done
        await fetch(`${supabaseUrl}/rest/v1/monte_carlo_jobs?id=eq.${job.id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${serviceRole}`, 'apikey': serviceRole, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done', finished_at: new Date().toISOString(), locked_until: null })
        });

        resultsSummary.push({ job: job.id, race: raceId, status: 'done', sims: numSims });
      } catch (jobErr) {
        console.error('Job failed', job.id, jobErr?.message || jobErr);
        await fetch(`${supabaseUrl}/rest/v1/monte_carlo_jobs?id=eq.${job.id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${serviceRole}`, 'apikey': serviceRole, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed', last_error: String(jobErr?.message || jobErr), locked_until: null })
        });
        resultsSummary.push({ job: job.id, status: 'failed', error: String(jobErr?.message || jobErr) });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: resultsSummary.length, results: resultsSummary }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Monte Carlo batch error:', err);
    return new Response(JSON.stringify({ success: false, error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


