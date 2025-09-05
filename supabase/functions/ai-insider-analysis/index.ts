Deno.serve(async (req)=>{
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
    console.log('AI Insider analysis started at:', new Date().toISOString());
    // Get Supabase credentials
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }
    // 1. COURSE/DISTANCE SPECIALISTS
    // Find horses with high win percentages at specific course/distance combinations
    console.log('Analyzing course/distance specialists...');
    const specialistsQuery = `
            SELECT 
                re.horse_id,
                re.race_id,
                h.name as horse_name,
                r.course_name,
                r.distance,
                re.horse_win_percentage_at_distance,
                re.trainer_win_percentage_at_course,
                re.trainer_win_percentage_at_distance,
                CASE 
                    WHEN re.horse_win_percentage_at_distance >= 0.15 THEN 'High'
                    WHEN re.horse_win_percentage_at_distance >= 0.08 THEN 'Medium'
                    ELSE 'Low'
                END as confidence,
                (re.horse_win_percentage_at_distance * 100) as win_percentage_display
            FROM race_entries re
            JOIN races r ON re.race_id = r.race_id
            LEFT JOIN horses h ON re.horse_id = h.horse_id
            WHERE re.horse_win_percentage_at_distance IS NOT NULL
            AND re.horse_win_percentage_at_distance > 0.05
            ORDER BY re.horse_win_percentage_at_distance DESC;
        `;
    const specialistsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: specialistsQuery
      })
    });
    let specialists = [];
    if (specialistsResponse.ok) {
      const specialistsData = await specialistsResponse.json();
      specialists = Array.isArray(specialistsData) ? specialistsData : [];
    }
    console.log(`Found ${specialists.length} course/distance specialists`);
    // 2. TRAINER INTENT ANALYSIS (Single Runners)
    // Find trainers who have only one runner at today's meetings
    console.log('Analyzing trainer intent (single runners)...');
    const trainerIntentQuery = `
            WITH trainer_runner_counts AS (
                SELECT 
                    r.course_id,
                    r.course_name,
                    r.date,
                    re.trainer_id,
                    t.name as trainer_name,
                    COUNT(*) as runner_count,
                    ARRAY_AGG(re.horse_id) as horse_ids,
                    ARRAY_AGG(re.race_id) as race_ids,
                    ARRAY_AGG(h.name) as horse_names
                FROM races r
                JOIN race_entries re ON r.race_id = re.race_id
                LEFT JOIN trainers t ON re.trainer_id = t.trainer_id
                LEFT JOIN horses h ON re.horse_id = h.horse_id
                WHERE r.date >= CURRENT_DATE
                GROUP BY r.course_id, r.course_name, r.date, re.trainer_id, t.name
            )
            SELECT 
                course_name,
                trainer_id,
                trainer_name,
                horse_ids[1] as horse_id,
                race_ids[1] as race_id,
                horse_names[1] as horse_name,
                'Single runner shows trainer intent' as analysis_note,
                'High' as confidence
            FROM trainer_runner_counts
            WHERE runner_count = 1
            AND trainer_name IS NOT NULL
            ORDER BY trainer_name;
        `;
    const trainerIntentResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: trainerIntentQuery
      })
    });
    let trainerIntents = [];
    if (trainerIntentResponse.ok) {
      const trainerData = await trainerIntentResponse.json();
      trainerIntents = Array.isArray(trainerData) ? trainerData : [];
    }
    console.log(`Found ${trainerIntents.length} single runner situations`);
    // 3. MARKET MOVEMENTS
    // Get real market movement data from race_entries with horse_id and race_id
    console.log('Generating market movement alerts...');
    const marketMovementsQuery = `
            SELECT 
                re.horse_id,
                re.race_id,
                h.name as horse_name,
                r.course_name,
                re.current_odds,
                re.opening_odds,
                CASE 
                    WHEN re.current_odds IS NOT NULL AND re.opening_odds IS NOT NULL 
                    AND re.opening_odds > 0 THEN
                        ROUND(((re.current_odds - re.opening_odds) / re.opening_odds) * 100, 1)
                    ELSE 0
                END as percentage_change,
                CASE 
                    WHEN re.current_odds IS NOT NULL AND re.opening_odds IS NOT NULL 
                    AND re.opening_odds > 0 THEN
                        CASE 
                            WHEN re.current_odds < re.opening_odds THEN 'Odds Drift'
                            WHEN re.current_odds > re.opening_odds THEN 'Market Support'
                            ELSE 'Stable'
                        END
                    ELSE 'No Movement'
                END as alert_type,
                CASE 
                    WHEN ABS(percentage_change) >= 20 THEN 'High'
                    WHEN ABS(percentage_change) >= 10 THEN 'Medium'
                    ELSE 'Low'
                END as confidence
            FROM race_entries re
            JOIN races r ON re.race_id = r.race_id
            LEFT JOIN horses h ON re.horse_id = h.horse_id
            WHERE r.date >= CURRENT_DATE
            AND re.current_odds IS NOT NULL 
            AND re.opening_odds IS NOT NULL
            AND re.opening_odds > 0
            AND re.current_odds != re.opening_odds
            ORDER BY ABS(percentage_change) DESC;
        `;
    const marketMovementsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: marketMovementsQuery
      })
    });
    let marketMovements = [];
    if (marketMovementsResponse.ok) {
      const marketData = await marketMovementsResponse.json();
      marketMovements = Array.isArray(marketData) ? marketData : [];
    }
    console.log(`Found ${marketMovements.length} market movements`);
    // Compile results
    const result = {
      data: {
        courseSpecialists: specialists.map((s)=>({
            horse_id: s.horse_id,
            race_id: s.race_id,
            horse_name: s.horse_name || `Horse ${s.horse_id}`,
            course_name: s.course_name,
            distance: s.distance,
            win_percentage: Math.round((s.horse_win_percentage_at_distance || 0) * 100),
            confidence: s.confidence,
            analysis: `${Math.round((s.horse_win_percentage_at_distance || 0) * 100)}% win rate at ${s.course_name} over ${s.distance}`
          })),
        trainerIntents: trainerIntents.map((t)=>({
            trainer_id: t.trainer_id,
            trainer_name: t.trainer_name,
            horse_id: t.horse_id,
            race_id: t.race_id,
            horse_name: t.horse_name || `Horse ${t.horse_id}`,
            course: t.course_name,
            confidence: t.confidence,
            analysis: t.analysis_note
          })),
        marketAlerts: marketMovements.map((m)=>({
            horse_id: m.horse_id,
            race_id: m.race_id,
            horse_name: m.horse_name || `Horse ${m.horse_id}`,
            course: m.course_name,
            current_odds: m.current_odds,
            opening_odds: m.opening_odds,
            percentage_change: m.percentage_change,
            alert_type: m.alert_type,
            confidence: m.confidence,
            movement: `${m.percentage_change > 0 ? '+' : ''}${m.percentage_change}%`
          })),
        summary: {
          totalSpecialists: specialists.length,
          totalTrainerIntents: trainerIntents.length,
          totalAlerts: marketMovements.length,
          lastUpdated: new Date().toISOString()
        },
        debug: {
          specialists_query_success: specialistsResponse.ok,
          trainer_query_success: trainerIntentResponse.ok,
          market_query_success: marketMovementsResponse.ok,
          raw_specialists_count: specialists.length,
          raw_trainer_intents_count: trainerIntents.length,
          raw_market_movements_count: marketMovements.length
        }
      }
    };
    console.log('AI Insider analysis completed:', {
      specialists: specialists.length,
      intents: trainerIntents.length,
      alerts: marketMovements.length
    });
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('AI Insider analysis error:', error);
    return new Response(JSON.stringify({
      error: {
        code: 'AI_INSIDER_ANALYSIS_FAILED',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
