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
    console.log('🧪 TEST LOOKUP FUNCTION CALLED');
    
    const { horse_name } = await req.json();
    console.log('🔍 Testing lookup for:', horse_name);

    // Get Supabase credentials
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase configuration missing');
    }

    // Test the exact lookup from add-to-shortlist function
    const raceEntryResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_entries?horse_name=eq.${encodeURIComponent(horse_name)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!raceEntryResponse.ok) {
      const errorText = await raceEntryResponse.text();
      console.log('❌ Failed to fetch race entries:', errorText);
      return new Response(JSON.stringify({ error: errorText }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const raceEntries = await raceEntryResponse.json();
    console.log('📊 Race entries found:', raceEntries.length);
    console.log('📋 Race entries data:', raceEntries);

    if (raceEntries.length > 0) {
      const raceEntry = raceEntries[0];
      console.log('✅ Found race_id:', raceEntry.race_id);
      console.log('✅ Found horse_id:', raceEntry.horse_id);
      
      return new Response(JSON.stringify({
        success: true,
        race_id: raceEntry.race_id,
        horse_id: raceEntry.horse_id,
        message: 'Lookup successful'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      console.log('❌ No race entries found');
      return new Response(JSON.stringify({
        success: false,
        message: 'No race entries found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Test function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

