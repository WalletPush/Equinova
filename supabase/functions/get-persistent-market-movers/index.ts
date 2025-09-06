Deno.serve(async (req)=>{
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log('Fetching persistent market movers...');
    // Get today's date in UK timezone
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/London'
    });
    // Get market movements from horse_market_movement for today
    // Use the primary table rather than the changes table
    const marketMoversResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement?source_updated_at=gte.${today}T00:00:00.000Z&source_updated_at=lt.${today}T23:59:59.999Z&select=*&order=source_updated_at.desc`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!marketMoversResponse.ok) {
      throw new Error(`Failed to fetch market movement changes: ${marketMoversResponse.status}`);
    }
    const allChanges = await marketMoversResponse.json();
    console.log(`Found ${allChanges.length} market movement changes`);
    // Get current market movement data to get latest odds and horse names
    const currentMarketResponse = await fetch(`${supabaseUrl}/rest/v1/horse_market_movement?select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!currentMarketResponse.ok) {
      throw new Error(`Failed to fetch current market data: ${currentMarketResponse.status}`);
    }
    const currentMarketData = await currentMarketResponse.json();
    const currentMarketMap = new Map(currentMarketData.map((m)=>[
        m.horse_id,
        m
      ]));
    // Get race entries to get horse names, trainer, jockey
    const raceEntriesResponse = await fetch(`${supabaseUrl}/rest/v1/race_entries?select=horse_id,horse_name,trainer_name,jockey_name`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!raceEntriesResponse.ok) {
      throw new Error(`Failed to fetch race entries: ${raceEntriesResponse.status}`);
    }
    const raceEntries = await raceEntriesResponse.json();
    const raceEntriesMap = new Map(raceEntries.map((e)=>[
        e.horse_id,
        e
      ]));
    // Process changes to find horses with significant INWARD movement (20%+)
    const significantMovers = new Map();
    for (const change of allChanges){
      // Only process INWARD movements (direction = 'in' means odds shortened/steaming)
      if (change.direction !== 'in') continue;
      const currentData = currentMarketMap.get(change.horse_id);
      const raceEntry = raceEntriesMap.get(change.horse_id);
      if (!currentData || !raceEntry) continue;
      // Calculate total movement percentage for this horse
      const movementPct = Math.abs(change.change_pct || 0);
      if (movementPct >= 10) {
        // This horse has significant INWARD movement
        const key = `${change.horse_id}_${change.race_id}`;
        if (!significantMovers.has(key)) {
          significantMovers.set(key, {
            horse_id: change.horse_id,
            race_id: change.race_id,
            horse_name: raceEntry.horse_name || `Horse ${change.horse_id}`,
            course: change.course,
            off_time: change.off_time,
            jockey_name: raceEntry.jockey_name,
            trainer_name: raceEntry.trainer_name,
            bookmaker: change.bookmaker,
            initial_odds: currentData.initial_odds,
            current_odds: currentData.current_odds,
            odds_movement: 'steaming',
            odds_movement_pct: movementPct,
            last_updated: change.source_updated_at,
            first_detected_at: change.source_updated_at,
            total_movements: 1,
            latest_change: change
          });
        } else {
          // Update existing mover with latest data
          const existing = significantMovers.get(key);
          existing.total_movements++;
          existing.odds_movement_pct = Math.max(existing.odds_movement_pct, movementPct);
          existing.last_updated = change.source_updated_at;
          existing.latest_change = change;
          existing.current_odds = currentData.current_odds;
        }
      }
    }
    const marketMovers = Array.from(significantMovers.values());
    console.log(`Found ${marketMovers.length} horses with significant movement (10%+)`);
    // Group by race (course + time) to match the frontend structure
    const raceGroups = marketMovers.reduce((acc, mover)=>{
      const raceKey = `${mover.course}_${mover.off_time}`;
      if (!acc[raceKey]) {
        acc[raceKey] = {
          race_id: `mover_${raceKey}`,
          course_name: mover.course,
          off_time: mover.off_time,
          movers: []
        };
      }
      acc[raceKey].movers.push({
        id: mover.horse_id,
        horse_id: mover.horse_id,
        race_id: mover.race_id,
        horse_name: mover.horse_name,
        course: mover.course,
        off_time: mover.off_time,
        jockey_name: mover.jockey_name,
        trainer_name: mover.trainer_name,
        bookmaker: mover.bookmaker,
        initial_odds: mover.initial_odds,
        current_odds: mover.current_odds,
        odds_movement: mover.odds_movement,
        odds_movement_pct: mover.odds_movement_pct,
        last_updated: mover.last_updated,
        insight_type: 'market_movement',
        first_detected_at: mover.first_detected_at,
        total_movements: mover.total_movements,
        latest_change: mover.latest_change
      });
      return acc;
    }, {});
    // Convert to array and sort by race time
    const sortedRaces = Object.values(raceGroups).sort((a, b)=>a.off_time.localeCompare(b.off_time));
    console.log(`Grouped into ${sortedRaces.length} races`);
    return new Response(JSON.stringify({
      success: true,
      data: {
        market_movers: marketMovers,
        race_groups: sortedRaces,
        total_movers: marketMovers.length,
        total_races: sortedRaces.length
      },
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching persistent market movers:', error);
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
