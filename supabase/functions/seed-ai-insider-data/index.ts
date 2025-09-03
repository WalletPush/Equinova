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
        console.log('AI Insider data seeding started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Sample course distance specialists data
        const specialistsData = [
            {
                horse_id: 'hrs_sample_001',
                course_name: 'Ascot',
                distance: '1m 4f',
                total_runs: 7,
                wins: 6,
                win_percentage: 85.7,
                confidence_score: 95.0
            },
            {
                horse_id: 'hrs_sample_002', 
                course_name: 'York',
                distance: '6f',
                total_runs: 9,
                wins: 7,
                win_percentage: 77.8,
                confidence_score: 88.0
            },
            {
                horse_id: 'hrs_sample_003',
                course_name: 'Newmarket',
                distance: '7f',
                total_runs: 18,
                wins: 13,
                win_percentage: 72.2,
                confidence_score: 82.0
            }
        ];

        // Sample trainer intent data
        const trainerIntentData = [
            {
                race_id: 'rac_sample_001',
                trainer_id: 'trn_sample_001',
                trainer_name: 'John Smith',
                course: 'Cheltenham',
                race_date: '2025-08-29',
                is_single_runner: true,
                horse_id: 'hrs_intent_001',
                horse_name: 'Royal Champion',
                confidence_score: 95.0,
                intent_analysis: 'Only runner for trainer at this meeting, showing clear intent'
            },
            {
                race_id: 'rac_sample_002',
                trainer_id: 'trn_sample_002',
                trainer_name: 'Sarah Williams',
                course: 'Goodwood',
                race_date: '2025-08-29',
                is_single_runner: true,
                horse_id: 'hrs_intent_002', 
                horse_name: 'Desert Storm',
                confidence_score: 90.0,
                intent_analysis: 'Special entry for this meeting only'
            }
        ];

        // Sample market alerts data
        const alertsData = [
            {
                user_id: null,
                alert_type: 'Market Movement',
                race_id: 'rac_sample_001',
                horse_id: 'hrs_alert_001',
                horse_name: 'Market Mover',
                course: 'Ascot',
                message: 'Significant odds shortening from 8/1 to 4/1 in last 30 minutes',
                confidence_score: 95.0,
                odds_improvement_pct: -50.0,
                is_sent: false
            },
            {
                user_id: null,
                alert_type: 'Course Specialist',
                race_id: 'rac_sample_002',
                horse_id: 'hrs_alert_002',
                horse_name: 'Insider Pick',
                course: 'York',
                message: 'Strong course specialist with 90% strike rate at this track',
                confidence_score: 90.0,
                odds_improvement_pct: 0,
                is_sent: false
            }
        ];

        // Clear existing seed data
        console.log('Clearing existing seed data...');
        const clearQueries = [
            "DELETE FROM course_distance_specialists WHERE horse_id LIKE 'hrs_sample_%';",
            "DELETE FROM trainer_intent_analysis WHERE horse_id LIKE 'hrs_intent_%';", 
            "DELETE FROM ai_insider_alerts WHERE alert_id LIKE 'alert_%';"
        ];

        for (const query of clearQueries) {
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });
            if (!response.ok) {
                console.warn('Clear query failed:', query);
            }
        }

        // Insert specialists data
        console.log('Inserting course distance specialists...');
        for (const specialist of specialistsData) {
            const response = await fetch(`${supabaseUrl}/rest/v1/course_distance_specialists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(specialist)
            });
            if (!response.ok) {
                console.error('Failed to insert specialist:', await response.text());
            }
        }

        // Insert trainer intent data
        console.log('Inserting trainer intent analysis...');
        for (const intent of trainerIntentData) {
            const response = await fetch(`${supabaseUrl}/rest/v1/trainer_intent_analysis`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(intent)
            });
            if (!response.ok) {
                console.error('Failed to insert trainer intent:', await response.text());
            }
        }

        // Insert alerts data
        console.log('Inserting AI insider alerts...');
        for (const alert of alertsData) {
            const response = await fetch(`${supabaseUrl}/rest/v1/ai_insider_alerts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(alert)
            });
            if (!response.ok) {
                console.error('Failed to insert alert:', await response.text());
            }
        }

        const result = {
            data: {
                message: 'AI Insider data seeded successfully',
                specialists_inserted: specialistsData.length,
                trainer_intents_inserted: trainerIntentData.length,
                alerts_inserted: alertsData.length,
                timestamp: new Date().toISOString()
            }
        };

        console.log('AI Insider seeding completed:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Insider seeding error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'SEEDING_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
