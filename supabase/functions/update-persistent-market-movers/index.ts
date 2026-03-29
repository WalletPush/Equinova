import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // Get all current market movement data from horse_market_movement
    const marketMovementResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement?select=*&order=last_updated.desc`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!marketMovementResponse.ok) {
      throw new Error(`Failed to fetch market movement data: ${marketMovementResponse.status}`);
    }
    const marketMovements = await marketMovementResponse.json();
    // Get race details for each market movement
    const raceIds = [
      ...new Set(marketMovements.map((m)=>m.race_id))
    ];
    const raceDetailsResponse = await fetch(`${supabaseUrl}/rest/v1/races?race_id=in.(${raceIds.map((id)=>`"${id}"`).join(',')})&select=race_id,course_name,off_time,date`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!raceDetailsResponse.ok) {
      throw new Error(`Failed to fetch race details: ${raceDetailsResponse.status}`);
    }
    const raceDetails = await raceDetailsResponse.json();
    const raceMap = new Map(raceDetails.map((r)=>[
        r.race_id,
        r
      ]));
    // Get today's date in UK timezone
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/London'
    });
    // Process each market movement
    let addedCount = 0;
    let updatedCount = 0;
    let deactivatedCount = 0;
    for (const movement of marketMovements){
      const raceDetail = raceMap.get(movement.race_id);
      if (!raceDetail || raceDetail.date !== today) {
        continue; // Skip if not today's race
      }
      // Check if movement meets 20%+ criteria
      const movementPct = Math.abs(movement.odds_movement_pct || 0);
      const meetsCriteria = movementPct >= 20;
      // Check if this horse is already tracked
      const existingResponse = await fetch(`${supabaseUrl}/rest/v1/persistent_market_movers?horse_id=eq.${movement.horse_id}&race_id=eq.${movement.race_id}&select=id,is_active,odds_movement_pct`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      });
      if (!existingResponse.ok) {
        continue;
      }
      const existing = await existingResponse.json();
      const now = new Date().toISOString();
      if (existing.length === 0) {
        // New horse - add if meets criteria
        if (meetsCriteria) {
          const addResponse = await fetch(`${supabaseUrl}/rest/v1/persistent_market_movers`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              horse_id: movement.horse_id,
              race_id: movement.race_id,
              horse_name: movement.horse_name || `Horse ${movement.horse_id}`,
              course_name: raceDetail.course_name,
              off_time: raceDetail.off_time,
              jockey_name: movement.jockey_name,
              trainer_name: movement.trainer_name,
              bookmaker: movement.bookmaker || 'Ladbrokes',
              initial_odds: movement.initial_odds,
              current_odds: movement.current_odds,
              odds_movement: movement.odds_movement,
              odds_movement_pct: movement.odds_movement_pct,
              first_detected_at: now,
              last_updated_at: now,
              is_active: true
            })
          });
          if (addResponse.ok) {
            addedCount++;
          }
        }
      } else {
        // Existing horse - update or deactivate
        const existingRecord = existing[0];
        if (meetsCriteria) {
          // Update if still meets criteria
          const updateResponse = await fetch(`${supabaseUrl}/rest/v1/persistent_market_movers?id=eq.${existingRecord.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              current_odds: movement.current_odds,
              odds_movement: movement.odds_movement,
              odds_movement_pct: movement.odds_movement_pct,
              last_updated_at: now,
              is_active: true
            })
          });
          if (updateResponse.ok) {
            updatedCount++;
          }
        } else {
          // Deactivate if no longer meets criteria
          const deactivateResponse = await fetch(`${supabaseUrl}/rest/v1/persistent_market_movers?id=eq.${existingRecord.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              is_active: false,
              last_updated_at: now
            })
          });
          if (deactivateResponse.ok) {
            deactivatedCount++;
          }
        }
      }
    }
    // Clean up finished races (remove horses from races that have finished)
    const cleanupResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
            UPDATE persistent_market_movers 
            SET is_active = false, last_updated_at = NOW()
            WHERE race_id IN (
              SELECT r.race_id 
              FROM races r 
              LEFT JOIN race_results rr ON r.race_id = rr.race_id 
              WHERE rr.race_id IS NOT NULL 
              AND r.date = CURRENT_DATE
            )
            AND is_active = true;
          `
      })
    });
    let cleanupCount = 0;
    if (cleanupResponse.ok) {
      const cleanupResult = await cleanupResponse.json();
      cleanupCount = cleanupResult.rowCount || 0;
    }
    return new Response(JSON.stringify({
      success: true,
      summary: {
        added: addedCount,
        updated: updatedCount,
        deactivated: deactivatedCount,
        cleaned_up: cleanupCount,
        total_processed: marketMovements.length
      },
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('update-persistent-market-movers: request failed');
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
