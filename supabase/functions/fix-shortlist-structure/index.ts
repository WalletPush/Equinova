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
        console.log('Applying shortlist table fix...');

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Step 1: Drop existing trigger and function
        const dropTriggerQuery = `
            DROP TRIGGER IF EXISTS trigger_set_shortlist_race_ids ON shortlist;
            DROP FUNCTION IF EXISTS set_shortlist_race_ids();
        `;

        const dropResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: dropTriggerQuery })
            }
        );

        if (!dropResponse.ok) {
            console.warn('Drop trigger/function failed, continuing...');
        }

        // Step 2: Add horse_id column if it doesn't exist
        const addColumnQuery = `
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name = 'shortlist' AND column_name = 'horse_id') THEN
                    ALTER TABLE public.shortlist ADD COLUMN horse_id TEXT;
                END IF;
            END $$;
        `;

        const addColumnResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: addColumnQuery })
            }
        );

        if (!addColumnResponse.ok) {
            throw new Error(`Add column failed: ${addColumnResponse.status}`);
        }

        console.log('Added horse_id column');

        // Step 3: Add index for horse_id
        const addIndexQuery = `
            CREATE INDEX IF NOT EXISTS idx_shortlist_horse_id ON public.shortlist(horse_id);
        `;

        const addIndexResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: addIndexQuery })
            }
        );

        if (!addIndexResponse.ok) {
            console.warn('Add index failed, continuing...');
        }

        // Step 4: Recreate the trigger function
        const createFunctionQuery = `
            CREATE OR REPLACE FUNCTION set_shortlist_race_ids()
            RETURNS TRIGGER AS $$
            BEGIN
              -- Only set if race_id or horse_id is NULL
              IF NEW.race_id IS NULL OR NEW.horse_id IS NULL THEN
                -- Look up race entry by horse_name
                SELECT race_id, horse_id 
                INTO NEW.race_id, NEW.horse_id
                FROM race_entries 
                WHERE horse_name = NEW.horse_name 
                LIMIT 1;
              END IF;
              
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `;

        const createFunctionResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: createFunctionQuery })
            }
        );

        if (!createFunctionResponse.ok) {
            throw new Error(`Create function failed: ${createFunctionResponse.status}`);
        }

        console.log('Recreated trigger function');

        // Step 5: Recreate the trigger
        const createTriggerQuery = `
            CREATE TRIGGER trigger_set_shortlist_race_ids
              BEFORE INSERT OR UPDATE ON shortlist
              FOR EACH ROW
              EXECUTE FUNCTION set_shortlist_race_ids();
        `;

        const createTriggerResponse = await fetch(
            `${supabaseUrl}/rest/v1/rpc/execute_query`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: createTriggerQuery })
            }
        );

        if (!createTriggerResponse.ok) {
            throw new Error(`Create trigger failed: ${createTriggerResponse.status}`);
        }

        console.log('Recreated trigger');

        return new Response(JSON.stringify({
            success: true,
            message: 'Shortlist table structure fixed successfully. horse_id column added and trigger updated.'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Fix shortlist structure error:', error);

        return new Response(JSON.stringify({
            success: false,
            error: {
                code: 'FIX_SHORTLIST_STRUCTURE_ERROR',
                message: error.message
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
