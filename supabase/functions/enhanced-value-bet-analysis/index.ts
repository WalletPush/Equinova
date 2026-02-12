// OpenAI Value Bets Analysis Function
// Analyzes whether horses represent genuine value — supports multiple value bet candidates per race
// API key is resolved server-side: env var -> user profile via JWT -> never from frontend
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL_CANDIDATES = ['gpt-4.1-mini','gpt-4.1-nano','gpt-4.1','gpt-4o-mini','gpt-4o','gpt-4-turbo','gpt-4','gpt-3.5-turbo'];

async function callOpenAI(apiKey: string, messages: any[], maxTokens: number) {
  for (const model of MODEL_CANDIDATES) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 })
    });
    if (res.ok) { console.log(`Model ${model} succeeded`); return await res.json(); }
    const errText = await res.text();
    if (res.status === 403 || res.status === 404 || errText.includes('model_not_found')) { continue; }
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }
  throw new Error('No OpenAI model available for your API key.');
}

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    const restHeaders = { 'Authorization': `Bearer ${supabaseServiceKey}`, 'apikey': supabaseServiceKey, 'Content-Type': 'application/json' };

    const requestData = await req.json();
    const { raceId, horseId, horseIds } = requestData;

    // Resolve OpenAI API key server-side only (never from request body)
    let openaiApiKey = Deno.env.get('OPENAI_API_KEY') || '';
    if (!openaiApiKey) {
      // Extract user ID from JWT and fetch their key from profiles
      const authHeader = req.headers.get('authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.sub) {
            const r = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${payload.sub}&select=openai_api_key`, { headers: restHeaders });
            if (r.ok) { const p = await r.json(); if (p[0]?.openai_api_key) openaiApiKey = p[0].openai_api_key; }
          }
        } catch (_e) {}
      }
      // Last resort: fetch any available key from profiles
      if (!openaiApiKey) {
        const r = await fetch(`${supabaseUrl}/rest/v1/profiles?openai_api_key=not.is.null&select=openai_api_key&limit=1`, { headers: restHeaders });
        if (r.ok) { const a = await r.json(); if (a[0]?.openai_api_key) openaiApiKey = a[0].openai_api_key; }
      }
    }
    if (!openaiApiKey) throw new Error('No OpenAI API key found. Please add it in Settings.');

    // Support both legacy single horseId and new horseIds array
    const targetIds: string[] = horseIds?.length
      ? horseIds.map((id: any) => String(id))
      : horseId
        ? [String(horseId)]
        : [];

    if (!raceId || targetIds.length === 0) {
      throw new Error('Missing required parameters: raceId and horseId/horseIds');
    }

    // Fetch race data via REST API
    const raceRes = await fetch(`${supabaseUrl}/rest/v1/races?race_id=eq.${encodeURIComponent(raceId)}&select=race_id,course_name,off_time,type,race_class,going,distance,surface`, { headers: restHeaders });
    const raceData = (raceRes.ok ? await raceRes.json() : [])[0];
    if (!raceData) throw new Error('Race not found');

    // Fetch ALL runners in the race (needed to normalize probabilities)
    const allEntriesRes = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(raceId)}&select=id,horse_name,trainer_name,jockey_name,current_odds,benter_proba,ensemble_proba,mlp_proba,xgboost_proba,rf_proba,form&order=ensemble_proba.desc.nullslast`, { headers: restHeaders });
    const allEntries = allEntriesRes.ok ? await allEntriesRes.json() : [];
    if (!allEntries.length) throw new Error('No entries found for this race');

    // Normalize ML probabilities so they sum to 100% across the field (proper win percentages)
    const mlFields = ['ensemble_proba', 'mlp_proba', 'xgboost_proba', 'rf_proba', 'benter_proba'];
    const sums: Record<string, number> = {};
    for (const f of mlFields) sums[f] = allEntries.reduce((acc: number, r: any) => acc + (Number(r[f]) || 0), 0);
    const normalized = allEntries.map((r: any) => {
      const norm: Record<string, number> = {};
      for (const f of mlFields) { const raw = Number(r[f]) || 0; norm[f] = sums[f] > 0 ? (raw / sums[f]) * 100 : 0; }
      // Average normalized win% across models
      const avgWinPct = (norm.ensemble_proba + norm.mlp_proba + norm.xgboost_proba + norm.rf_proba + norm.benter_proba) / 5;
      const impliedPct = Number(r.current_odds) > 0 ? (1 / Number(r.current_odds)) * 100 : 0;
      const valueEdge = impliedPct > 0 ? avgWinPct / impliedPct : 0;
      return { ...r, norm, avgWinPct, impliedPct, valueEdge };
    });

    // Split into target value bet horses and other runners, SORT BY VALUE EDGE (highest first = best pick)
    const targetIdSet = new Set(targetIds.map(String));
    const targetHorses = normalized
      .filter((h: any) => targetIdSet.has(String(h.id)))
      .sort((a: any, b: any) => b.valueEdge - a.valueEdge);
    const otherRunners = normalized.filter((h: any) => !targetIdSet.has(String(h.id)));
    if (!targetHorses.length) throw new Error('Failed to match target horse data');

    // The TOP PICK is always the horse with the highest value edge
    const topPick = targetHorses[0];

    // Build per-horse data blocks
    const valueBetBlocks = targetHorses.map((horse: any, idx: number) => {
      const bestModel = (['Ensemble', 'MLP', 'XGBoost', 'RF', 'Benter'] as const).reduce(
        (best, name, i) => {
          const val = horse.norm[mlFields[i]];
          return val > best.pct ? { name, pct: val } : best;
        },
        { name: 'Ensemble', pct: horse.norm.ensemble_proba }
      );

      return `${idx === 0 ? 'TOP PICK' : 'SECONDARY'}: ${horse.horse_name} at ${horse.current_odds} odds
  Value Edge: ${horse.valueEdge.toFixed(1)}x | ML Win%: ${horse.avgWinPct.toFixed(1)}% vs Market Implied: ${horse.impliedPct.toFixed(1)}%
  Best Model: ${bestModel.name} at ${bestModel.pct.toFixed(1)}%
  Models: Ens ${horse.norm.ensemble_proba.toFixed(1)}%, MLP ${horse.norm.mlp_proba.toFixed(1)}%, XGB ${horse.norm.xgboost_proba.toFixed(1)}%, RF ${horse.norm.rf_proba.toFixed(1)}%, Benter ${horse.norm.benter_proba.toFixed(1)}%
  Trainer: ${horse.trainer_name} | Jockey: ${horse.jockey_name} | Form: ${horse.form}`;
    }).join('\n\n');

    // Other runners summary
    const otherHorsesText = otherRunners.map((r: any, i: number) =>
      `${i + 1}. ${r.horse_name} - ${r.current_odds} odds, ML Win%: ${r.avgWinPct.toFixed(1)}%, Edge: ${r.valueEdge.toFixed(1)}x, Form: ${r.form}`
    ).join('\n') || 'No other runners';

    const favorite = otherRunners.length
      ? otherRunners.reduce((min: any, r: any) => Number(r.current_odds) < Number(min.current_odds) ? r : min, otherRunners[0])
      : null;

    const isMultiple = targetHorses.length > 1;

    const prompt = isMultiple
      ? `Race: ${raceData.off_time} ${raceData.type} ${raceData.race_class || ''} at ${raceData.course_name}
Conditions: ${raceData.going || 'Unknown'} going, ${raceData.distance || 'Unknown'}, ${raceData.surface || 'Unknown'}
Field: ${allEntries.length} runners

These ${targetHorses.length} horses are CONFIRMED ML value bets, ranked by value edge. The horse with the highest value edge is the TOP PICK.

${valueBetBlocks}

Rest of field:
${otherHorsesText}
${favorite ? `Favorite: ${favorite.horse_name} at ${favorite.current_odds} (ML Win%: ${favorite.avgWinPct.toFixed(1)}%)` : ''}

THE TOP PICK IS ${topPick.horse_name} (${topPick.valueEdge.toFixed(1)}x edge). This is non-negotiable — the highest value edge determines the pick.

Write your analysis as follows. Use PLAIN TEXT only — no markdown, no bold, no headers, no bullet points. Write in short clear paragraphs.

Paragraph 1 — TOP PICK VERDICT: State ${topPick.horse_name} is the value pick at ${topPick.current_odds} with a ${topPick.valueEdge.toFixed(1)}x edge. The ML models give it a ${topPick.avgWinPct.toFixed(1)}% win chance vs the market's ${topPick.impliedPct.toFixed(1)}%. Explain in 2-3 sentences what the market is likely missing.

Paragraph 2 — WHY THE EDGE EXISTS: Explain what could be driving the ML confidence — form patterns, trainer intent, class level, conditions, anything that supports the edge.

Paragraph 3 — THE OTHER VALUE BET: Briefly cover ${targetHorses.length > 1 ? targetHorses[1].horse_name : 'N/A'} as a secondary option with its ${targetHorses.length > 1 ? targetHorses[1].valueEdge.toFixed(1) : '0'}x edge. Explain why it ranks below the top pick.

Paragraph 4 — RISKS AND STAKES: What needs to go right. Recommend stake sizing (small stake for high-odds picks, medium for shorter odds). End with a clear one-line verdict.`
      : `Race: ${raceData.off_time} ${raceData.type} ${raceData.race_class || ''} at ${raceData.course_name}
Conditions: ${raceData.going || 'Unknown'} going, ${raceData.distance || 'Unknown'}, ${raceData.surface || 'Unknown'}
Field: ${allEntries.length} runners

This horse is a CONFIRMED ML value bet:

${valueBetBlocks}

Rest of field:
${otherHorsesText}
${favorite ? `Favorite: ${favorite.horse_name} at ${favorite.current_odds} (ML Win%: ${favorite.avgWinPct.toFixed(1)}%)` : ''}

Write your analysis as follows. Use PLAIN TEXT only — no markdown, no bold, no headers, no bullet points. Write in short clear paragraphs.

Paragraph 1 — VERDICT: ${topPick.horse_name} is the value pick at ${topPick.current_odds} with a ${topPick.valueEdge.toFixed(1)}x edge. ML gives it ${topPick.avgWinPct.toFixed(1)}% vs the market's ${topPick.impliedPct.toFixed(1)}%. Explain what the market is missing.

Paragraph 2 — WHY THE EDGE EXISTS: What drives the ML confidence — form, trainer, conditions, class.

Paragraph 3 — RISKS AND STAKES: What needs to go right. Recommend stake sizing. End with a clear one-line verdict.`;

    // Call OpenAI API via model fallback helper — increase max_tokens for multi-horse analysis
    const maxTokens = isMultiple ? 1500 : 1000;

    const openaiData = await callOpenAI(openaiApiKey, [
      {
        role: 'system',
        content: 'You are a value betting analyst. The horse with the HIGHEST value edge is always the top pick — this is determined by the data, not your opinion. A value edge of 3x means the ML models rate a horse 3 times more likely to win than the market odds imply. Your job is to explain WHY the edge exists, what the market is missing, and how to play it. NEVER dismiss a value bet. NEVER recommend the favorite instead. NEVER use markdown formatting — no bold, no headers, no asterisks, no bullet points. Write in plain short paragraphs only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], maxTokens);

    const analysis = openaiData.choices?.[0]?.message?.content;
    if (!analysis) {
      throw new Error('No analysis received from OpenAI');
    }

    return new Response(JSON.stringify({
      data: { success: true, analysis }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Value Bet Analysis Error:', error);
    return new Response(JSON.stringify({
      error: {
        success: false,
        error: error.message || 'Unknown error occurred during value bet analysis'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
