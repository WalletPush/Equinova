// OpenAI Value Bets Analysis Function
// Analyzes whether a horse represents genuine value based on field comparison
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    // Get API keys from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required API keys or Supabase configuration');
    }
    // Parse request body
    const requestData = await req.json();
    const { raceId, horseId } = requestData;
    if (!raceId || !horseId) {
      throw new Error('Missing required parameters: raceId and horseId');
    }
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Fetch race data
    const { data: raceData, error: raceError } = await supabase.from('races').select('race_id, course_name, off_time, type, race_class').eq('race_id', raceId).single();
    if (raceError || !raceData) {
      throw new Error(`Failed to fetch race data: ${raceError?.message}`);
    }
    // Fetch the specific horse data (the potential value bet)
    const { data: targetHorse, error: horseError } = await supabase.from('race_entries').select('id, horse_name, trainer_name, jockey_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form').eq('id', horseId).eq('race_id', raceId).single();
    if (horseError || !targetHorse) {
      throw new Error(`Failed to fetch horse data: ${horseError?.message}`);
    }
    // Fetch all other runners in the same race
    const { data: allRunners, error: runnersError } = await supabase.from('race_entries').select('horse_name, trainer_name, jockey_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form').eq('race_id', raceId).neq('id', horseId).order('current_odds', {
      ascending: true
    }); // Order by odds to show favorites first
    if (runnersError) {
      throw new Error(`Failed to fetch other runners: ${runnersError?.message}`);
    }
    // Find the best ML model probability for the target horse
    const mlProbabilities = {
      'Benter': targetHorse.benter_proba,
      'Ensemble': targetHorse.ensemble_proba,
      'MLP': targetHorse.mlp_proba,
      'XgBoost': targetHorse.xgboost_proba,
      'Random Forest': targetHorse.rf_proba
    };
    const bestModel = Object.entries(mlProbabilities).reduce((best, [model, prob])=>prob > best.probability ? {
        name: model,
        probability: prob
      } : best, {
      name: 'Benter',
      probability: targetHorse.benter_proba
    });
    // Construct the OpenAI prompt
    const otherHorsesText = allRunners?.map((runner, index)=>`${index + 1}. ${runner.horse_name} - Odds: ${runner.current_odds}, Benter: ${runner.benter_proba}%, Ensemble: ${runner.ensemble_proba}%, MLP: ${runner.mlp_proba}%, XgBoost: ${runner.xgboost_proba}%, RF: ${runner.rf_proba}%, Trainer: ${runner.trainer_name}, Jockey: ${runner.jockey_name}, Form: ${runner.form}`).join('\n') || 'No other runners found';
    // Calculate implied probability from odds
    const impliedProbability = (1 / targetHorse.current_odds * 100).toFixed(1);
    // Find the favorite (lowest odds)
    const favorite = allRunners?.reduce((min, runner)=>runner.current_odds < min.current_odds ? runner : min, allRunners[0]);
    const prompt = `Analyze this value bet: ${targetHorse.horse_name} at ${targetHorse.current_odds} odds in the ${raceData.off_time} race at ${raceData.course_name}.

This horse is the top ${bestModel.name} pick with ${bestModel.probability}% ML probability.

Value Bet Analysis:
- Horse: ${targetHorse.horse_name}
- Current Odds: ${targetHorse.current_odds} (${impliedProbability}% implied probability)
- Best ML Model: ${bestModel.name} at ${bestModel.probability}%
- All ML Probabilities: Benter ${targetHorse.benter_proba}%, Ensemble ${targetHorse.ensemble_proba}%, MLP ${targetHorse.mlp_proba}%, XgBoost ${targetHorse.xgboost_proba}%, RF ${targetHorse.rf_proba}%
- Trainer: ${targetHorse.trainer_name}
- Jockey: ${targetHorse.jockey_name}
- Form: ${targetHorse.form}
- Race: ${raceData.type} ${raceData.race_class} at ${raceData.course_name}

Here are ALL the other runners in this race with their details:
${otherHorsesText}

${favorite ? `The current favorite is ${favorite.horse_name} at ${favorite.current_odds} odds with Benter ${favorite.benter_proba}%, Ensemble ${favorite.ensemble_proba}% ML probabilities.` : ''}

Question: Is this a genuine value bet worth backing, or is it priced well because it's up against a strong odds-on favorite or competitive field?

Evaluate the true betting worthiness considering:
1. **Value Assessment**: Does the ${targetHorse.ml_probability}% ML probability justify the ${targetHorse.odds} odds?
2. **Field Strength**: How does this horse compare to the competition, especially the favorite?
3. **Market Efficiency**: Is the horse underpriced due to market oversight or correctly priced due to genuine competition?
4. **Risk vs Reward**: What are the realistic winning chances against this specific field?
5. **Betting Recommendation**: Should this be backed, and if so, with what confidence level?

Provide a comprehensive analysis with a clear recommendation on whether this represents genuine betting value.`;
    // Call OpenAI API
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
            content: 'You are an expert horse racing analyst and professional bettor specializing in value bet identification. Provide detailed, practical analysis focusing on genuine betting value and market efficiency.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
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
    // Return successful response
    const response = {
      success: true,
      analysis
    };
    return new Response(JSON.stringify({
      data: response
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Value Bet Analysis Error:', error);
    const errorResponse = {
      success: false,
      error: error.message || 'Unknown error occurred during value bet analysis'
    };
    return new Response(JSON.stringify({
      error: errorResponse
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
