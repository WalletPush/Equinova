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

    // Collect unique race_ids from the changes to fetch only relevant entries
    const changeRaceIds = [...new Set(allChanges.map((c) => c.race_id).filter(Boolean))];

    // Get race entries keyed by race_id::horse_id to avoid collisions
    let raceEntriesMap = new Map();
    if (changeRaceIds.length > 0) {
      const inList = changeRaceIds.map((id) => encodeURIComponent(id)).join(',');
      const raceEntriesResponse = await fetch(
        `${supabaseUrl}/rest/v1/race_entries?race_id=in.(${inList})&select=horse_id,race_id,horse_name,trainer_name,jockey_name`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );
      if (raceEntriesResponse.ok) {
        const raceEntries = await raceEntriesResponse.json();
        // Key by race_id::horse_id to avoid collisions across races
        raceEntriesMap = new Map(raceEntries.map((e) => [
          `${e.race_id}::${e.horse_id}`,
          e
        ]));
      }
    }

    // Process changes to find horses with significant INWARD movement (10%+)
    // Use each change record's own odds data — no need for a separate "current" lookup
    // which was keyed by horse_id only, causing wrong odds from different races/dates
    const significantMovers = new Map();
    for (const change of allChanges) {
      // Only process INWARD movements (steaming)
      if (change.direction !== 'in') continue;

      // Look up horse info using composite key
      const entryKey = `${change.race_id}::${change.horse_id}`;
      const raceEntry = raceEntriesMap.get(entryKey);

      // Calculate movement percentage
      const movementPct = Math.abs(change.change_pct || 0);
      if (movementPct >= 10) {
        const key = `${change.horse_id}_${change.race_id}`;
        if (!significantMovers.has(key)) {
          // Use odds directly from the change record (correct per-race data)
          // Convert decimal to fractional for display (e.g. 5.5 → "9/2")
          const decInitial = Number(change.initial_price || change.initial_odds || 0);
          const decCurrent = Number(change.current_price || change.current_odds || 0);

          significantMovers.set(key, {
            horse_id: change.horse_id,
            race_id: change.race_id,
            horse_name: raceEntry?.horse_name || change.horse_name || `Horse ${change.horse_id}`,
            course: change.course,
            off_time: change.off_time,
            jockey_name: raceEntry?.jockey_name || change.jockey_name || 'Unknown',
            trainer_name: raceEntry?.trainer_name || change.trainer_name || 'Unknown',
            bookmaker: change.bookmaker,
            initial_odds: change.initial_price || change.initial_odds || 'N/A',
            current_odds: change.current_price || change.current_odds || 'N/A',
            decimal_initial: decInitial,
            decimal_current: decCurrent,
            fractional_initial: decimalToFractional(decInitial),
            fractional_current: decimalToFractional(decCurrent),
            odds_movement: 'steaming',
            odds_movement_pct: movementPct,
            last_updated: change.source_updated_at,
            first_detected_at: change.source_updated_at,
            total_movements: 1,
            latest_change: change
          });
        } else {
          const existing = significantMovers.get(key);
          existing.total_movements++;
          existing.odds_movement_pct = Math.max(existing.odds_movement_pct, movementPct);
          existing.last_updated = change.source_updated_at;
          existing.latest_change = change;
          // Update odds from this change record
          existing.current_odds = change.current_price || change.current_odds || existing.current_odds;
          const decCurr = Number(existing.current_odds || 0);
          existing.decimal_current = decCurr;
          existing.fractional_current = decimalToFractional(decCurr);
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
        fractional_initial: mover.fractional_initial,
        fractional_current: mover.fractional_current,
        decimal_initial: mover.decimal_initial,
        decimal_current: mover.decimal_current,
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
    // Convert to array and sort by race time (only 01:XX-09:XX are PM, 10-12 are morning/noon)
    const raceTimeMin = (t: string): number => {
      const [h, m] = t.substring(0, 5).split(":").map(Number);
      return (h >= 1 && h <= 9 ? h + 12 : h) * 60 + (m || 0);
    };
    const sortedRaces = Object.values(raceGroups).sort((a, b) => raceTimeMin(a.off_time) - raceTimeMin(b.off_time));
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

// Convert decimal odds to fractional display string (e.g. 5.0 → "4/1", 2.5 → "6/4")
function decimalToFractional(dec: number): string {
  if (!dec || !Number.isFinite(dec) || dec <= 1) return 'EVS';
  const profit = dec - 1;
  // Common fractions lookup for clean display
  const common: [number, string][] = [
    [0.1, '1/10'], [0.2, '1/5'], [0.25, '1/4'], [0.33, '1/3'], [0.4, '2/5'],
    [0.5, '1/2'], [0.57, '4/7'], [0.67, '2/3'], [0.8, '4/5'],
    [1.0, 'EVS'], [1.1, '11/10'], [1.2, '6/5'], [1.25, '5/4'],
    [1.33, '4/3'], [1.5, '6/4'], [2.0, '2/1'], [2.5, '5/2'],
    [3.0, '3/1'], [3.5, '7/2'], [4.0, '4/1'], [4.5, '9/2'],
    [5.0, '5/1'], [6.0, '6/1'], [7.0, '7/1'], [8.0, '8/1'],
    [9.0, '9/1'], [10.0, '10/1'], [11.0, '11/1'], [12.0, '12/1'],
    [14.0, '14/1'], [16.0, '16/1'], [20.0, '20/1'], [25.0, '25/1'],
    [33.0, '33/1'], [40.0, '40/1'], [50.0, '50/1'], [66.0, '66/1'],
    [100.0, '100/1'],
  ];
  // Find closest match
  let best = common[0];
  let bestDiff = Math.abs(profit - best[0]);
  for (const c of common) {
    const d = Math.abs(profit - c[0]);
    if (d < bestDiff) { best = c; bestDiff = d; }
  }
  if (bestDiff < 0.15) return best[1];
  // Fallback: round to nearest integer fraction
  const rounded = Math.round(profit);
  return rounded <= 0 ? 'EVS' : `${rounded}/1`;
}
