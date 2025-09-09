// OpenAI Trainer Intent Analysis Function
// Calculates trainer travel distance using Haversine formula and provides AI analysis of trainer intent
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Haversine formula to calculate distance between two latitude/longitude points
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}
// Convert distance to rough travel time
function calculateTravelTime(distanceKm) {
  const miles = distanceKm * 0.621371;
  const averageSpeed = 50; // mph average including traffic, stops
  const hours = miles / averageSpeed;
  return {
    distance: `${Math.round(miles)} miles`,
    time: hours < 1 ? `${Math.round(hours * 60)} minutes` : `${Math.round(hours * 10) / 10} hours`,
    hours: Math.round(hours * 10) / 10
  };
}
// Intelligent UK location-based distance estimation
function estimateUKTravelDistance(trainerLocation, courseName) {
  const trainer = trainerLocation.toLowerCase();
  const course = courseName.toLowerCase();
  // Major UK racing regions and approximate distances
  const regions = {
    scotland: [
      'scotland',
      'edinburgh',
      'glasgow',
      'hamilton',
      'musselburgh',
      'ayr'
    ],
    northern: [
      'york',
      'yorkshire',
      'leeds',
      'manchester',
      'lancashire',
      'cumbria',
      'newcastle',
      'hexham',
      'sedgefield',
      'thirsk',
      'ripon'
    ],
    midlands: [
      'birmingham',
      'leicester',
      'nottingham',
      'derby',
      'stafford',
      'wolverhampton',
      'warwick',
      'uttoxeter'
    ],
    wales: [
      'wales',
      'cardiff',
      'chepstow',
      'ffos las',
      'bangor'
    ],
    southwest: [
      'devon',
      'cornwall',
      'exeter',
      'newton abbot',
      'taunton'
    ],
    southeast: [
      'kent',
      'sussex',
      'surrey',
      'brighton',
      'folkestone',
      'plumpton',
      'lingfield',
      'fontwell'
    ],
    london: [
      'london',
      'ascot',
      'windsor',
      'kempton',
      'sandown',
      'epsom'
    ],
    east: [
      'suffolk',
      'norfolk',
      'essex',
      'newmarket',
      'great yarmouth',
      'fakenham'
    ],
    westcountry: [
      'gloucestershire',
      'somerset',
      'cheltenham',
      'bath'
    ]
  };
  // Find regions for trainer and course
  let trainerRegion = 'unknown';
  let courseRegion = 'unknown';
  for (const [region, locations] of Object.entries(regions)){
    if (locations.some((loc)=>trainer.includes(loc))) trainerRegion = region;
    if (locations.some((loc)=>course.includes(loc))) courseRegion = region;
  }
  // Estimate distance based on regional proximity
  let estimatedKm = 150; // Default moderate distance
  let commitment = 'MODERATE';
  if (trainerRegion === courseRegion) {
    estimatedKm = 25; // Same region - local
    commitment = 'LOCAL';
  } else {
    // Cross-regional distances
    const longDistancePairs = [
      [
        'scotland',
        'southwest'
      ],
      [
        'scotland',
        'southeast'
      ],
      [
        'scotland',
        'london'
      ],
      [
        'northern',
        'southwest'
      ],
      [
        'wales',
        'east'
      ],
      [
        'southwest',
        'east'
      ]
    ];
    const isLongDistance = longDistancePairs.some((pair)=>pair[0] === trainerRegion && pair[1] === courseRegion || pair[1] === trainerRegion && pair[0] === courseRegion);
    if (isLongDistance) {
      estimatedKm = 350; // Very long distance
      commitment = 'VERY HIGH';
    } else {
      estimatedKm = 150; // Moderate distance
      commitment = 'MODERATE';
    }
  }
  const travelInfo = calculateTravelTime(estimatedKm);
  return {
    distance: travelInfo.distance,
    time: travelInfo.time,
    hours: travelInfo.hours,
    commitment
  };
}
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
    // Fetch the specific horse data
    const { data: targetHorse, error: horseError } = await supabase.from('race_entries').select('id, horse_name, trainer_name, trainer_id, jockey_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form').eq('id', horseId).eq('race_id', raceId).single();
    if (horseError || !targetHorse) {
      throw new Error(`Failed to fetch horse data: ${horseError?.message}`);
    }
    // Fetch trainer location data
    const { data: trainerData, error: trainerError } = await supabase.from('trainers').select('location').eq('trainer_id', targetHorse.trainer_id).single();
    console.log('Trainer ID:', targetHorse.trainer_id);
    console.log('Trainer data fetch result:', trainerData);
    console.log('Trainer error:', trainerError);
    if (trainerError) {
      console.error('Failed to fetch trainer location:', trainerError);
    }
    // Handle trainer location gracefully
    const trainerLocation = trainerData?.location;
    console.log('Final trainer location:', trainerLocation);
    // Combine horse and trainer data
    const horseWithTrainer = {
      ...targetHorse,
      trainer_location: trainerLocation || 'Location not specified'
    };
    // Fetch all other runners in the same race
    const { data: allRunners, error: runnersError } = await supabase.from('race_entries').select('horse_name, trainer_name, current_odds, benter_proba, ensemble_proba, mlp_proba, xgboost_proba, rf_proba, form').eq('race_id', raceId).neq('id', horseId);
    if (runnersError) {
      throw new Error(`Failed to fetch other runners: ${runnersError?.message}`);
    }
    // Check if we have trainer location for travel analysis
    console.log('Trainer location being sent to OpenAI:', horseWithTrainer.trainer_location);
    const hasTrainerLocation = horseWithTrainer.trainer_location && horseWithTrainer.trainer_location !== 'Location not specified' && horseWithTrainer.trainer_location !== 'Location unknown';
    // Find the best ML model probability for the target horse
    const mlProbabilities = {
      'Benter': horseWithTrainer.benter_proba,
      'Ensemble': horseWithTrainer.ensemble_proba,
      'MLP': horseWithTrainer.mlp_proba,
      'XgBoost': horseWithTrainer.xgboost_proba,
      'Random Forest': horseWithTrainer.rf_proba
    };
    const bestModel = Object.entries(mlProbabilities).reduce((best, [model, prob])=>prob > best.probability ? {
        name: model,
        probability: prob
      } : best, {
      name: 'Benter',
      probability: horseWithTrainer.benter_proba
    });
    // Construct the OpenAI prompt with travel time calculation request
    const otherHorsesText = allRunners?.map((runner)=>`- ${runner.horse_name} (Trainer: ${runner.trainer_name}, Odds: ${runner.current_odds}, Benter: ${runner.benter_proba}%, Ensemble: ${runner.ensemble_proba}%, MLP: ${runner.mlp_proba}%, XgBoost: ${runner.xgboost_proba}%, RF: ${runner.rf_proba}%, Form: ${runner.form})`).join('\n') || 'No other runners found';
    const prompt = hasTrainerLocation ? `You are analyzing trainer intent for horse racing. Please provide:

**1. TRAVEL ANALYSIS FIRST:**
**CRITICAL:** Calculate the rough travel time and distance from "${horseWithTrainer.trainer_location}" to "${raceData.course_name} Racecourse" in the UK.

Required calculations:
- Distance in miles between ${horseWithTrainer.trainer_location} and ${raceData.course_name} Racecourse
- Travel time by road (driving time)
- Whether this represents local racing (under 1 hour), regional commitment (1-3 hours), or significant travel investment (4+ hours)

**2. TRAINER INTENT ANALYSIS:**
Based on this travel commitment, analyze the trainer's confidence level for running just one horse at this meeting.` : `You are analyzing trainer intent for horse racing. Please provide:

**1. TRAINER INTENT ANALYSIS:**
**Note:** Trainer location data is not available, so travel analysis cannot be performed. Focus on other aspects of trainer intent.

Analyze the trainer's confidence level for running just one horse at this meeting.`;
    const promptWithDetails = prompt + `

**Race Details:**
- Horse: ${horseWithTrainer.horse_name}
- Trainer: ${horseWithTrainer.trainer_name} (from ${horseWithTrainer.trainer_location})
- Course: ${raceData.course_name}
- Race: ${raceData.type} ${raceData.race_class} at ${raceData.off_time}
- Jockey: ${horseWithTrainer.jockey_name}
- Current Odds: ${horseWithTrainer.current_odds}
- Best ML Model: ${bestModel.name} at ${bestModel.probability}%
- All ML Probabilities: Benter ${horseWithTrainer.benter_proba}%, Ensemble ${horseWithTrainer.ensemble_proba}%, MLP ${horseWithTrainer.mlp_proba}%, XgBoost ${horseWithTrainer.xgboost_proba}%, RF ${horseWithTrainer.rf_proba}%
- Form: ${horseWithTrainer.form}

**Other runners in this race:**
${otherHorsesText}

**Please provide a comprehensive analysis covering:**
1. **Specific travel time and distance calculation**
2. **What this travel commitment suggests about trainer confidence**
3. **Single runner strategy analysis**
4. **Comparison with other runners in the race**
5. **Overall assessment of winning chances based on travel investment**

**Format your response with:**
- Clear travel time/distance at the start
- Detailed analysis of trainer intent
- Realistic winning prospects evaluation

Remember: Trainers who travel significant distances with just one horse typically have strong confidence in their runner's chances.`;
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
            content: 'You are an expert horse racing analyst specializing in trainer behavior and intent analysis. Provide detailed, insightful analysis based on racing data and trainer psychology.'
          },
          {
            role: 'user',
            content: promptWithDetails
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
    // Extract travel information from OpenAI response if possible
    // OpenAI will include travel time and distance in the analysis
    let extractedTravelInfo = 'Travel analysis included in response';
    // Look for travel time/distance patterns in the response
    const travelMatch = analysis.match(/(\d+[-.\s]*\d*\s*(?:miles?|km))\s*.*?(\d+[-.\s]*\d*\s*(?:hours?|minutes?|mins?))/i);
    if (travelMatch) {
      extractedTravelInfo = `${travelMatch[1]} (${travelMatch[2]})`;
    }
    // Return successful response
    const response = {
      success: true,
      analysis,
      travelDistance: extractedTravelInfo
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
    console.error('Trainer Intent Analysis Error:', error);
    const errorResponse = {
      success: false,
      error: error.message || 'Unknown error occurred during trainer intent analysis'
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
