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
    // Get request data - now including horse_id and race_id
    const { 
      horse_name, 
      race_time, 
      course, 
      odds, 
      source, 
      jockey_name, 
      trainer_name, 
      ml_info,
      horse_id,
      race_id
    } = await req.json();

    // Validate required parameters
    if (!horse_name || !race_time || !course || !source) {
      throw new Error('Missing required parameters: horse_name, race_time, course, and source are required');
    }

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

    // STEP 1: Use provided horse_id and race_id if available, otherwise fall back to lookup
    let finalHorseId = horse_id;
    let finalRaceId = race_id;

    // If we don't have horse_id or race_id, try to resolve them
    if (!finalHorseId || !finalRaceId) {
      console.log('Horse ID or Race ID not provided, attempting to resolve...');
      
      // Try to resolve race_id from the races table using course + off_time (race_time)
      if (!finalRaceId) {
        const raceLookup = await fetch(
          `${supabaseUrl}/rest/v1/races?course_name=eq.${encodeURIComponent(course)}&off_time=eq.${encodeURIComponent(race_time)}&select=race_id&limit=1`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
              'Content-Type': 'application/json'
            }
          }
        );
        if (raceLookup.ok) {
          const raceRows = await raceLookup.json();
          finalRaceId = raceRows?.[0]?.race_id ?? null;
        }
      }

      // Try to resolve horse_id from race_entries using race_id + horse_name if we have race_id
      if (!finalHorseId && finalRaceId) {
        const reByRace = await fetch(
          `${supabaseUrl}/rest/v1/race_entries?race_id=eq.${finalRaceId}&horse_name=ilike.${encodeURIComponent(horse_name)}&select=horse_id,race_id,horse_name&limit=1`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
              'Content-Type': 'application/json'
            }
          }
        );
        if (reByRace.ok) {
          const reRows = await reByRace.json();
          const raceEntry = reRows?.[0] ?? null;
          if (raceEntry) {
            finalHorseId = raceEntry.horse_id;
            finalRaceId = raceEntry.race_id; // Use the exact race_id from race_entries
          }
        }
      }

      // Fallback: try to find horse by name only if we still don't have horse_id
      if (!finalHorseId) {
        const reFallback = await fetch(
          `${supabaseUrl}/rest/v1/race_entries?horse_name=ilike.${encodeURIComponent(horse_name)}&select=horse_id,race_id,horse_name&limit=1`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey,
              'Content-Type': 'application/json'
            }
          }
        );
        if (reFallback.ok) {
          const reRows = await reFallback.json();
          const raceEntry = reRows?.[0] ?? null;
          if (raceEntry) {
            finalHorseId = raceEntry.horse_id;
            finalRaceId = raceEntry.race_id;
          }
        }
      }
    }

    // Log what we found
    console.log(`Resolved IDs - Horse ID: ${finalHorseId}, Race ID: ${finalRaceId}`);

    // STEP 2: Check if horse already exists in shortlist
    // Use horse_id and race_id for more precise matching if available
    let checkQuery = `user_id=eq.${userId}&horse_name=eq.${encodeURIComponent(horse_name)}&course=eq.${encodeURIComponent(course)}`;
    
    if (finalHorseId && finalRaceId) {
      // More precise check using horse_id and race_id
      checkQuery = `user_id=eq.${userId}&horse_id=eq.${finalHorseId}&race_id=eq.${finalRaceId}`;
    }

    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/shortlist?${checkQuery}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!checkResponse.ok) {
      throw new Error('Failed to check existing shortlist entries');
    }

    const existingEntries = await checkResponse.json();
    
    if (existingEntries && existingEntries.length > 0) {
      // Update existing entry
      const updateData = {
        current_odds: odds || null,
        source: source,
        race_time: race_time,
        race_id: finalRaceId,
        horse_id: finalHorseId,
        jockey_name: jockey_name || null,
        trainer_name: trainer_name || null,
        ml_info: ml_info || null,
        updated_at: new Date().toISOString()
      };

      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/shortlist?id=eq.${existingEntries[0].id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(updateData)
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to update shortlist entry');
      }

      const updatedEntry = await updateResponse.json();

      return new Response(JSON.stringify({
        success: true,
        message: 'Horse updated in shortlist',
        data: updatedEntry[0]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 3: Create new shortlist entry
    const shortlistData = {
      user_id: userId,
      horse_name: horse_name,
      race_time: race_time,
      course: course,
      race_id: finalRaceId,
      horse_id: finalHorseId,
      current_odds: odds || null,
      source: source,
      jockey_name: jockey_name || null,
      trainer_name: trainer_name || null,
      ml_info: ml_info || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(shortlistData)
    });

    if (!insertResponse.ok) {
      throw new Error('Failed to add horse to shortlist');
    }

    const insertedEntry = await insertResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Horse added to shortlist successfully',
      data: insertedEntry[0]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Add to shortlist error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'ADD_TO_SHORTLIST_ERROR',
        message: error.message
      }
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
