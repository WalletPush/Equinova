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

    // Split into target value bet horses and other runners
    const targetIdSet = new Set(targetIds.map(String));
    const targetHorses = normalized.filter((h: any) => targetIdSet.has(String(h.id)));
    const otherRunners = normalized.filter((h: any) => !targetIdSet.has(String(h.id)));
    if (!targetHorses.length) throw new Error('Failed to match target horse data');

    // Build per-horse analysis blocks with NORMALIZED probabilities and value edge
    const valueBetBlocks = targetHorses.map((horse: any, idx: number) => {
      const bestModel = (['Ensemble', 'MLP', 'XGBoost', 'RF', 'Benter'] as const).reduce(
        (best, name, i) => {
          const val = horse.norm[mlFields[i]];
          return val > best.pct ? { name, pct: val } : best;
        },
        { name: 'Ensemble', pct: horse.norm.ensemble_proba }
      );

      return `VALUE BET #${idx + 1}: ${horse.horse_name}
- Odds: ${horse.current_odds} (market implied win chance: ${horse.impliedPct.toFixed(1)}%)
- ML Average Win Probability: ${horse.avgWinPct.toFixed(1)}% (normalized across the field)
- VALUE EDGE: ${horse.valueEdge.toFixed(1)}x (ML thinks ${horse.valueEdge > 1 ? 'MORE likely to win than odds suggest' : 'less likely'})
- Best ML Model: ${bestModel.name} at ${bestModel.pct.toFixed(1)}%
- All Normalized ML Win%: Ensemble ${horse.norm.ensemble_proba.toFixed(1)}%, MLP ${horse.norm.mlp_proba.toFixed(1)}%, XGB ${horse.norm.xgboost_proba.toFixed(1)}%, RF ${horse.norm.rf_proba.toFixed(1)}%, Benter ${horse.norm.benter_proba.toFixed(1)}%
- Trainer: ${horse.trainer_name}, Jockey: ${horse.jockey_name}
- Form: ${horse.form}`;
    }).join('\n\n');

    // Other runners text with normalized data
    const otherHorsesText = otherRunners.map((r: any, i: number) =>
      `${i + 1}. ${r.horse_name} - Odds: ${r.current_odds}, ML Win%: ${r.avgWinPct.toFixed(1)}%, Value Edge: ${r.valueEdge.toFixed(1)}x, Form: ${r.form}, Trainer: ${r.trainer_name}, Jockey: ${r.jockey_name}`
    ).join('\n') || 'No other runners found';

    // Find the favorite (lowest odds)
    const favorite = otherRunners.length
      ? otherRunners.reduce((min: any, r: any) => Number(r.current_odds) < Number(min.current_odds) ? r : min, otherRunners[0])
      : null;

    const isMultiple = targetHorses.length > 1;
    const horseNames = targetHorses.map((h: any) => h.horse_name).join(' and ');

    const prompt = isMultiple
      ? `You are analyzing ${targetHorses.length} CONFIRMED value bets in the ${raceData.off_time} ${raceData.type} ${raceData.race_class || ''} at ${raceData.course_name}.
Going: ${raceData.going || 'Unknown'}, Distance: ${raceData.distance || 'Unknown'}, Surface: ${raceData.surface || 'Unknown'}
Field size: ${allEntries.length} runners

CRITICAL CONTEXT: These horses have been flagged as VALUE BETS by our ML system. A value bet means the ML models believe the horse has a HIGHER true chance of winning than the betting market implies. A value edge of 2.0x means the ML models rate the horse as twice as likely to win as the odds suggest. These are long-shot plays where the market is UNDERRATING the horse. Your job is to determine WHICH value bet is the strongest play, NOT to dismiss them.

${valueBetBlocks}

Other runners in the field:
${otherHorsesText}

${favorite ? `Market favorite: ${favorite.horse_name} at ${favorite.current_odds} (ML Win%: ${favorite.avgWinPct.toFixed(1)}%, Value Edge: ${favorite.valueEdge.toFixed(1)}x)` : ''}

For EACH value bet horse, analyze:
1. **Why the ML models rate this horse higher than the market** — what the market might be missing (form cycles, trainer patterns, conditions, class drop, etc.)
2. **Strengths that could cause an upset** — any factors that support the ML edge
3. **Risks** — what could go wrong

Then:
4. **Head-to-Head**: Compare ${horseNames} directly — which has the stronger value case and why?
5. **Final Recommendation**: Which value bet to back, at what stake level (e.g., small/medium), and why. You MUST recommend at least one — these are value bets, the whole point is backing horses the market underrates.`
      : `You are analyzing a CONFIRMED value bet in the ${raceData.off_time} ${raceData.type} ${raceData.race_class || ''} at ${raceData.course_name}.
Going: ${raceData.going || 'Unknown'}, Distance: ${raceData.distance || 'Unknown'}, Surface: ${raceData.surface || 'Unknown'}
Field size: ${allEntries.length} runners

CRITICAL CONTEXT: This horse has been flagged as a VALUE BET by our ML system. The ML models believe it has a HIGHER true chance of winning than the betting market implies. Your job is to analyze WHY this horse represents value and how to play it, NOT to dismiss it.

${valueBetBlocks}

Other runners in the field:
${otherHorsesText}

${favorite ? `Market favorite: ${favorite.horse_name} at ${favorite.current_odds} (ML Win%: ${favorite.avgWinPct.toFixed(1)}%, Value Edge: ${favorite.valueEdge.toFixed(1)}x)` : ''}

Analyze:
1. **Why the ML models rate this horse higher than the market** — what might the market be missing?
2. **Upset potential** — form, trainer intent, conditions, anything supporting the value edge
3. **Key risks** — what needs to go right for this horse to hit
4. **Betting recommendation** — stake level (small/medium) and confidence. This IS a value bet — recommend how to play it.`;

    // Call OpenAI API via model fallback helper — increase max_tokens for multi-horse analysis
    const maxTokens = isMultiple ? 1500 : 1000;

    const openaiData = await callOpenAI(openaiApiKey, [
      {
        role: 'system',
        content: 'You are a professional value bettor and horse racing analyst. You understand that value betting means backing horses where the true probability of winning is HIGHER than what the market odds imply — the market is underrating them. All ML probabilities shown are NORMALIZED win percentages that sum to 100% across the field. A "value edge" of 2.0x means the ML models think the horse is twice as likely to win as the odds suggest. Your job is to explain WHY a value bet is worth backing, identify what the market is missing, and recommend which bet to place. You should NEVER dismiss a confirmed value bet — instead, rank them and recommend the best play with appropriate stake sizing.'
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
