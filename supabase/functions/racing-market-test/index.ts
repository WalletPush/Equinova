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
        console.log('Racing market test started at:', new Date().toISOString());

        // Racing API credentials
        const API_USERNAME = 'B06mvaMg9rdqfPBMJLe6wU0m';
        const API_PASSWORD = 'WC4kl7E2GvweCA9uxFAywbOY';
        
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        console.log('Testing database connection...');
        
        // Test database insertion
        const testData = {
            race_id: `test_${Date.now()}`,
            horse_id: `horse_${Date.now()}`,
            course: 'Test Course',
            off_time: new Date().toISOString(),
            bookmaker: 'Test Bookmaker',
            initial_odds: '5/1',
            current_odds: '6.0',
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        console.log('Attempting to insert test data:', JSON.stringify(testData));

        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });

        console.log('Insert response status:', insertResponse.status);

        if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            console.error('Insert error:', errorText);
            throw new Error(`Database insert failed: ${insertResponse.status} - ${errorText}`);
        }

        let insertResult = null;
        const responseText = await insertResponse.text();
        console.log('Insert response text:', responseText);
        
        if (responseText && responseText.trim()) {
            try {
                insertResult = JSON.parse(responseText);
                console.log('Insert successful:', JSON.stringify(insertResult));
            } catch (e) {
                console.log('Response is not JSON, but insert was successful');
            }
        } else {
            console.log('Empty response, but status was OK so insert was successful');
        }

        return new Response(JSON.stringify({
            data: {
                message: 'Test insert completed successfully',
                inserted: testData,
                result: insertResult,
                timestamp: new Date().toISOString()
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Test error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'TEST_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
