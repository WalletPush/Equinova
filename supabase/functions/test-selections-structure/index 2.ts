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
        console.log('Testing selections table structure...');

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Test 1: Check selections table structure
        const tableStructureQuery = `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'selections' 
            ORDER BY ordinal_position;
        `;

        const structureResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: tableStructureQuery })
            }
        );

        if (!structureResponse.ok) {
            throw new Error(`Table structure check failed: ${structureResponse.status}`);
        }

        const tableStructure = await structureResponse.json();
        console.log('Selections table structure:', tableStructure);

        // Test 2: Check recent selections
        const recentSelectionsQuery = `
            SELECT id, horse_name, horse_id, race_id, course_name, race_time, created_at
            FROM selections 
            ORDER BY created_at DESC 
            LIMIT 5;
        `;

        const selectionsResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: recentSelectionsQuery })
            }
        );

        if (!selectionsResponse.ok) {
            throw new Error(`Selections check failed: ${selectionsResponse.status}`);
        }

        const recentSelections = await selectionsResponse.json();
        console.log('Recent selections:', recentSelections);

        // Test 3: Check shortlist table structure for comparison
        const shortlistStructureQuery = `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'shortlist' 
            AND column_name IN ('horse_id', 'race_id', 'horse_name', 'course')
            ORDER BY column_name;
        `;

        const shortlistResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: shortlistStructureQuery })
            }
        );

        if (!shortlistResponse.ok) {
            throw new Error(`Shortlist structure check failed: ${shortlistResponse.status}`);
        }

        const shortlistStructure = await shortlistResponse.json();
        console.log('Shortlist relevant columns:', shortlistStructure);

        return new Response(JSON.stringify({
            success: true,
            data: {
                selections_table_structure: tableStructure,
                recent_selections: recentSelections,
                shortlist_relevant_columns: shortlistStructure,
                message: 'Selections table structure check completed'
            }
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Selections structure test error:', error);

        return new Response(JSON.stringify({
            success: false,
            error: {
                code: 'SELECTIONS_STRUCTURE_TEST_ERROR',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});


