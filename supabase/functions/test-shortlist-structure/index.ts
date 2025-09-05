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
        console.log('Testing shortlist table structure...');

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Test 1: Check if horse_id column exists
        const columnCheckQuery = `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'shortlist' 
            AND column_name IN ('horse_id', 'race_id')
            ORDER BY column_name;
        `;

        const columnResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: columnCheckQuery })
            }
        );

        if (!columnResponse.ok) {
            throw new Error(`Column check failed: ${columnResponse.status}`);
        }

        const columns = await columnResponse.json();
        console.log('Shortlist table columns:', columns);

        // Test 2: Check recent shortlist entries
        const recentEntriesQuery = `
            SELECT id, horse_name, horse_id, race_id, course, created_at
            FROM shortlist 
            ORDER BY created_at DESC 
            LIMIT 5;
        `;

        const entriesResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: recentEntriesQuery })
            }
        );

        if (!entriesResponse.ok) {
            throw new Error(`Entries check failed: ${entriesResponse.status}`);
        }

        const entries = await entriesResponse.json();
        console.log('Recent shortlist entries:', entries);

        // Test 3: Check if trigger function exists
        const triggerCheckQuery = `
            SELECT trigger_name, event_manipulation, action_statement
            FROM information_schema.triggers 
            WHERE event_object_table = 'shortlist';
        `;

        const triggerResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: triggerCheckQuery })
            }
        );

        if (!triggerResponse.ok) {
            throw new Error(`Trigger check failed: ${triggerResponse.status}`);
        }

        const triggers = await triggerResponse.json();
        console.log('Shortlist triggers:', triggers);

        return new Response(JSON.stringify({
            success: true,
            data: {
                columns: columns,
                recent_entries: entries,
                triggers: triggers,
                message: 'Shortlist table structure check completed'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Shortlist structure test error:', error);

        return new Response(JSON.stringify({
            success: false,
            error: {
                code: 'SHORTLIST_STRUCTURE_TEST_ERROR',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});



