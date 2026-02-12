// OpenAI Value Bets Analysis Function
// Analyzes whether horses represent genuine value — supports multiple value bet candidates per race
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const requestData = await req.json();
    const { raceId, horseId, horseIds } = requestData;

    // Use env var first, fall back to request body (user's own key)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY') || requestData.openaiApiKey;
    if (!openaiApiKey) {
      throw new Error('Missing OpenAI API key - set OPENAI_API_KEY env var or pass openaiApiKey in request');
    }

    // Support both legacy single horseId and new horseIds array
    const targetIds: string[] = horseIds?.length
      ? horseIds.map((id: any) => String(id))
      : horseId
        ? [String(horseId)]
        : [];

    if (!raceId || targetIds.length === 0) {
      throw new Error('Missing required parameters: raceId and horseId/horseIds');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch race data
    const { data: raceData, error: raceError } = await supabase
      .from('races')
      .select('race_id, course_name, off_time, type, race_class')
      .eq('race_id', raceId)
      .single();
    if (raceError || !raceData) {
      throw new Error(`Failed to fetch race data: ${raceError?.message}`);
    }

    // Fetch ALL target value bet horses
    const { data: targetHorses, error: horseError } = await supabase
      .from('race_entries')
      .select('id, horse_name, trainer_name, jockey_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form')
      .eq('race_id', raceId)
      .in('id', targetIds);
    if (horseError || !targetHorses || targetHorses.length === 0) {
      throw new Error(`Failed to fetch horse data: ${horseError?.message}`);
    }

    // Fetch all OTHER runners in the same race (exclude all value bet horses)
    const targetIdNums = targetHorses.map(h => h.id);
    const { data: allRunners, error: runnersError } = await supabase
      .from('race_entries')
      .select('horse_name, trainer_name, jockey_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form')
      .eq('race_id', raceId)
      .not('id', 'in', `(${targetIdNums.join(',')})`)
      .order('current_odds', { ascending: true });
    if (runnersError) {
      throw new Error(`Failed to fetch other runners: ${runnersError?.message}`);
    }

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

    // Call OpenAI API — increase max_tokens for multi-horse analysis
    const maxTokens = isMultiple ? 1500 : 1000;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert horse racing analyst and professional bettor specializing in value bet identification. Provide detailed, practical analysis focusing on genuine betting value and market efficiency. When multiple value bet candidates are presented, you MUST analyze each one and provide a clear comparative ranking.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorData}`);
    }

    const openaiData = await openaiResponse.json();
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
