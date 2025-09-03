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
        console.log('Diagnostic function started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        console.log('Environment check:', {
            hasServiceRoleKey: !!serviceRoleKey,
            hasSupabaseUrl: !!supabaseUrl,
            supabaseUrl: supabaseUrl
        });

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Test 1: Basic database connectivity
        console.log('Testing basic database connectivity...');
        const testResponse = await fetch(`${supabaseUrl}/rest/v1/races?limit=1`, {
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            }
        });

        console.log('Database test response status:', testResponse.status);
        
        if (!testResponse.ok) {
            const errorText = await testResponse.text();
            console.error('Database connectivity failed:', errorText);
            throw new Error(`Database connectivity failed: ${errorText}`);
        }

        const testData = await testResponse.json();
        console.log('Database test successful, records found:', testData.length);

        // Test 2: Check if new tables exist
        console.log('Testing new tables existence...');
        const tableTests = [
            'horse_market_movement',
            'ai_insider_alerts',
            'course_distance_specialists', 
            'trainer_intent_analysis'
        ];

        const tableResults = {};
        for (const tableName of tableTests) {
            try {
                const tableResponse = await fetch(`${supabaseUrl}/rest/v1/${tableName}?limit=1`, {
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    }
                });
                tableResults[tableName] = {
                    exists: tableResponse.ok,
                    status: tableResponse.status
                };
                console.log(`Table ${tableName}:`, tableResults[tableName]);
            } catch (error) {
                tableResults[tableName] = {
                    exists: false,
                    error: error.message
                };
                console.error(`Error testing table ${tableName}:`, error.message);
            }
        }

        // Test 3: External API connectivity (simplified)
        console.log('Testing external API connectivity...');
        const API_USERNAME = 'B06mvaMg9rdqfPBMJLe6wU0m';
        const API_PASSWORD = 'WC4kl7E2GvweCA9uxFAywbOY';
        const credentials = btoa(`${API_USERNAME}:${API_PASSWORD}`);
        
        try {
            const apiTestResponse = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });
            
            console.log('Racing API test status:', apiTestResponse.status);
            
            const apiTestResult = {
                status: apiTestResponse.status,
                ok: apiTestResponse.ok,
                accessible: true
            };
            
            if (apiTestResponse.ok) {
                const apiData = await apiTestResponse.json();
                apiTestResult.dataReceived = !!(apiData && apiData.racecards);
                apiTestResult.racecardCount = apiData?.racecards?.length || 0;
            }
            
            console.log('Racing API test result:', apiTestResult);
        } catch (apiError) {
            console.error('Racing API test failed:', apiError.message);
        }

        const result = {
            data: {
                message: 'Diagnostic test completed',
                timestamp: new Date().toISOString(),
                tests: {
                    database_connectivity: 'passed',
                    table_existence: tableResults,
                    environment_variables: {
                        supabase_url: !!supabaseUrl,
                        service_role_key: !!serviceRoleKey
                    }
                }
            }
        };

        console.log('Diagnostic completed successfully');

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Diagnostic function error:', error);

        const errorResponse = {
            error: {
                code: 'DIAGNOSTIC_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});