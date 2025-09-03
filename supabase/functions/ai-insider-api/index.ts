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
        console.log('AI Insider API request at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Call the AI Insider data function to get the data
        console.log('Calling AI Insider data function...');
        const dataResponse = await fetch(
            `${supabaseUrl}/functions/v1/ai-insider-data`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!dataResponse.ok) {
            throw new Error(`AI Insider data failed: ${dataResponse.status}`);
        }

        const dataResult = await dataResponse.json();
        console.log('AI Insider data retrieved successfully');

        // Transform the data to match the expected frontend format
        const transformedData = {
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                course_distance_specialists: dataResult.data.courseSpecialists.map((s: any, index: number) => ({
                    id: index + 1,
                    horse_id: s.horse_id,
                    race_id: s.race_id,
                    horse_name: s.horse_name,
                    course: s.course_name,
                    distance: s.distance,
                    win_percentage: s.win_percentage,
                    confidence_score: s.confidence === 'High' ? 90 : s.confidence === 'Medium' ? 70 : 50,
                    insight_type: 'course_specialist',
                    analysis: s.analysis
                })),
                trainer_intents: dataResult.data.trainerIntents.map((t: any, index: number) => ({
                    id: index + 1,
                    horse_id: t.horse_id,
                    race_id: t.race_id,
                    horse_name: t.horse_name,
                    trainer_name: t.trainer_name,
                    course: t.course,
                    confidence_score: t.confidence === 'High' ? 90 : t.confidence === 'Medium' ? 70 : 50,
                    intent_analysis: t.analysis,
                    insight_type: 'trainer_intent',
                    is_single_runner: true
                })),
                market_movers: dataResult.data.marketAlerts.map((m: any, index: number) => ({
                    id: index + 1,
                    horse_id: m.horse_id,
                    race_id: m.race_id,
                    horse_name: m.horse_name,
                    course: m.course,
                    current_odds: m.current_odds?.toString() || '',
                    initial_odds: m.opening_odds?.toString() || '',
                    odds_movement: m.movement,
                    odds_movement_pct: m.percentage_change,
                    alert_type: m.alert_type,
                    confidence_score: m.confidence === 'High' ? 90 : m.confidence === 'Medium' ? 70 : 50,
                    insight_type: 'market_movement',
                    last_updated: new Date().toISOString()
                })),
                unified_insights: [],
                race_statistics: {}
            },
            summary: {
                total_specialists: dataResult.data.courseSpecialists.length,
                total_trainer_intents: dataResult.data.trainerIntents.length,
                total_market_movers: dataResult.data.marketAlerts.length,
                courses_covered: new Set([
                    ...dataResult.data.courseSpecialists.map((s: any) => s.course_name),
                    ...dataResult.data.trainerIntents.map((t: any) => t.course),
                    ...dataResult.data.marketAlerts.map((m: any) => m.course)
                ]).size,
                last_updated: new Date().toISOString()
            }
        };

        console.log('AI Insider API data transformed successfully:', {
            specialists: transformedData.data.course_distance_specialists.length,
            intents: transformedData.data.trainer_intents.length,
            movers: transformedData.data.market_movers.length
        });

        return new Response(JSON.stringify(transformedData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Insider API error:', error);

        return new Response(JSON.stringify({
            success: false,
            error: {
                code: 'AI_INSIDER_API_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

