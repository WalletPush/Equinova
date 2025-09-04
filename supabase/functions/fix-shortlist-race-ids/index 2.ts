import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('🔧 FIXING SHORTLIST RACE_IDS');
    
    // Get Supabase credentials
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }

    const token = authHeader.replace('Bearer ', '');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey
      }
    });

    if (!userResponse.ok) {
      throw new Error('Invalid authentication');
    }

    const userData = await userResponse.json();
    const userId = userData.id;

    // Get all shortlist entries with NULL race_id
    const shortlistResponse = await fetch(
      `${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userId}&race_id=is.null`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!shortlistResponse.ok) {
      throw new Error('Failed to fetch shortlist');
    }

    const shortlistEntries = await shortlistResponse.json();
    console.log(`Found ${shortlistEntries.length} shortlist entries with NULL race_id`);

    let updatedCount = 0;

    for (const entry of shortlistEntries) {
      console.log(`Processing: ${entry.horse_name} at ${entry.course}`);
      
      // Find race entry for this horse
      const raceEntryResponse = await fetch(
        `${supabaseUrl}/rest/v1/race_entries?horse_name=eq.${encodeURIComponent(entry.horse_name)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          }
        }
      );

      if (raceEntryResponse.ok) {
        const raceEntries = await raceEntryResponse.json();
        
        if (raceEntries.length > 0) {
          const raceEntry = raceEntries[0];
          console.log(`Found race_id: ${raceEntry.race_id}, horse_id: ${raceEntry.horse_id}`);
          
          // Update shortlist entry
          const updateResponse = await fetch(
            `${supabaseUrl}/rest/v1/shortlist?id=eq.${entry.id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'apikey': serviceRoleKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                race_id: raceEntry.race_id,
                horse_id: raceEntry.horse_id
              })
            }
          );

          if (updateResponse.ok) {
            updatedCount++;
            console.log(`✅ Updated shortlist entry ${entry.id}`);
          } else {
            console.log(`❌ Failed to update shortlist entry ${entry.id}`);
          }
        } else {
          console.log(`❌ No race entry found for ${entry.horse_name}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${updatedCount} shortlist entries`,
      updated_count: updatedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fix shortlist error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

