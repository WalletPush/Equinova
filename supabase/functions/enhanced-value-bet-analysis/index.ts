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
    const raceRes = await fetch(`${supabaseUrl}/rest/v1/races?race_id=eq.${encodeURIComponent(raceId)}&select=race_id,course_name,off_time,type,race_class`, { headers: restHeaders });
    const raceData = (raceRes.ok ? await raceRes.json() : [])[0];
    if (!raceData) throw new Error('Race not found');

    // Fetch ALL target value bet horses via REST API
    const idsFilter = targetIds.map(id => encodeURIComponent(id)).join(',');
    const horsesRes = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(raceId)}&id=in.(${idsFilter})&select=id,horse_name,trainer_name,jockey_name,current_odds,benter_proba,ensemble_proba,mlp_proba,xgboost_proba,rf_proba,form`, { headers: restHeaders });
    const targetHorses = horsesRes.ok ? await horsesRes.json() : [];
    if (!targetHorses.length) throw new Error('Failed to fetch target horse data');

    // Fetch all OTHER runners (exclude value bet horses)
    const excludeFilter = targetHorses.map((h: any) => h.id).join(',');
    const runnersRes = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${encodeURIComponent(raceId)}&id=not.in.(${excludeFilter})&select=horse_name,trainer_name,jockey_name,current_odds,benter_proba,ensemble_proba,mlp_proba,xgboost_proba,rf_proba,form&order=current_odds.asc`, { headers: restHeaders });
    const allRunners = runnersRes.ok ? await runnersRes.json() : [];

    // Build per-horse analysis blocks
    const valueBetBlocks = targetHorses.map((horse, idx) => {
      const mlProbs = {
        Benter: horse.benter_proba,
        Ensemble: horse.ensemble_proba,
        MLP: horse.mlp_proba,
        XgBoost: horse.xgboost_proba,
        'Random Forest': horse.rf_proba,
      };
      const bestModel = Object.entries(mlProbs).reduce(
        (best, [model, prob]) => (prob > best.probability ? { name: model, probability: prob } : best),
        { name: 'Ensemble', probability: horse.ensemble_proba }
      );
      const impliedProb = horse.current_odds > 0 ? (1 / horse.current_odds * 100).toFixed(1) : '0';

      return `VALUE BET #${idx + 1}: ${horse.horse_name}
- Current Odds: ${horse.current_odds} (${impliedProb}% implied probability)
- Best ML Model: ${bestModel.name} at ${bestModel.probability}%
- All ML Probabilities: Benter ${horse.benter_proba}%, Ensemble ${horse.ensemble_proba}%, MLP ${horse.mlp_proba}%, XgBoost ${horse.xgboost_proba}%, RF ${horse.rf_proba}%
- Trainer: ${horse.trainer_name}
- Jockey: ${horse.jockey_name}
- Form: ${horse.form}`;
    }).join('\n\n');

    // Other runners text
    const otherHorsesText = allRunners?.map((runner, index) =>
      `${index + 1}. ${runner.horse_name} - Odds: ${runner.current_odds}, Benter: ${runner.benter_proba}%, Ensemble: ${runner.ensemble_proba}%, MLP: ${runner.mlp_proba}%, XgBoost: ${runner.xgboost_proba}%, RF: ${runner.rf_proba}%, Trainer: ${runner.trainer_name}, Jockey: ${runner.jockey_name}, Form: ${runner.form}`
    ).join('\n') || 'No other runners found';

    // Find the favorite (lowest odds among other runners)
    const favorite = allRunners?.length
      ? allRunners.reduce((min, runner) => runner.current_odds < min.current_odds ? runner : min, allRunners[0])
      : null;

    const isMultiple = targetHorses.length > 1;
    const horseNames = targetHorses.map(h => h.horse_name).join(' and ');

    const prompt = isMultiple
      ? `Analyze these ${targetHorses.length} value bet candidates in the ${raceData.off_time} ${raceData.type} ${raceData.race_class} race at ${raceData.course_name}.

${valueBetBlocks}

Here are ALL the other runners in this race:
${otherHorsesText}

${favorite ? `The current market favorite is ${favorite.horse_name} at ${favorite.current_odds} odds with Ensemble ${favorite.ensemble_proba}%, Benter ${favorite.benter_proba}% ML probabilities.` : ''}

IMPORTANT: There are ${targetHorses.length} value bet candidates in this race. You MUST analyze EACH one individually, then compare them head-to-head.

For EACH value bet horse provide:
1. **Value Assessment**: Is the ML probability edge over the implied odds genuine or a false signal?
2. **Strengths & Weaknesses**: Form, connections, conditions suitability
3. **Risk Level**: Low / Medium / High

Then provide:
4. **Head-to-Head Comparison**: Compare ${horseNames} directly — which has the stronger case?
5. **Field Context**: How do both compare against the favorite and the rest of the field?
6. **Final Ranking & Recommendation**: Rank the value bets from strongest to weakest. Which should be backed, at what confidence level? Should you back one, both, or neither?

Be decisive. Provide a clear recommendation.`
      : `Analyze this value bet: ${targetHorses[0].horse_name} at ${targetHorses[0].current_odds} odds in the ${raceData.off_time} ${raceData.type} ${raceData.race_class} race at ${raceData.course_name}.

${valueBetBlocks}

Here are ALL the other runners in this race:
${otherHorsesText}

${favorite ? `The current market favorite is ${favorite.horse_name} at ${favorite.current_odds} odds with Ensemble ${favorite.ensemble_proba}%, Benter ${favorite.benter_proba}% ML probabilities.` : ''}

Evaluate the true betting worthiness considering:
1. **Value Assessment**: Does the ML probability justify the odds? Is the edge genuine?
2. **Field Strength**: How does this horse compare to the competition, especially the favorite?
3. **Market Efficiency**: Is the horse underpriced due to market oversight or correctly priced?
4. **Risk vs Reward**: What are the realistic winning chances against this specific field?
5. **Betting Recommendation**: Should this be backed, and if so, with what confidence level?

Provide a comprehensive analysis with a clear recommendation.`;

    // Call OpenAI API via model fallback helper — increase max_tokens for multi-horse analysis
    const maxTokens = isMultiple ? 1500 : 1000;

    const openaiData = await callOpenAI(openaiApiKey, [
      {
        role: 'system',
        content: 'You are an expert horse racing analyst and professional bettor specializing in value bet identification. Provide detailed, practical analysis focusing on genuine betting value and market efficiency. When multiple value bet candidates are presented, you MUST analyze each one and provide a clear comparative ranking.'
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
