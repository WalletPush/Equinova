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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting Market Movement Seeder for today\'s races...');
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`Seeding market movement for date: ${today}`);
    
    // Step 1: Get all race entries for today
    const entriesResponse = await fetch(
      `${supabaseUrl}/rest/v1/race_entries?select=race_id,horse_id,horse_name,current_odds`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!entriesResponse.ok) {
      const errorText = await entriesResponse.text();
      throw new Error(`Failed to fetch race entries: ${errorText}`);
    }
    
    const allRaceEntries = await entriesResponse.json();
    console.log(`Found ${allRaceEntries.length} total race entries`);
    
    // Step 2: Get all races for today
    const racesResponse = await fetch(
      `${supabaseUrl}/rest/v1/races?select=race_id,course_name,off_time,date&date=eq.${today}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!racesResponse.ok) {
      const errorText = await racesResponse.text();
      throw new Error(`Failed to fetch races: ${errorText}`);
    }
    
    const todaysRaces = await racesResponse.json();
    console.log(`Found ${todaysRaces.length} races for ${today}`);
    
    // Create a lookup map for races
    const racesMap = new Map();
    todaysRaces.forEach(race => {
      racesMap.set(race.race_id, race);
    });
    
    // Step 3: Filter race entries to only those for today's races that aren't in horse_market_movement
    const entries = [];
    let checkedCount = 0;
    
    for (const entry of allRaceEntries) {
      const race = racesMap.get(entry.race_id);
      if (!race) {
        continue; // Skip if not a race for today
      }
      
      checkedCount++;
      
      // Check if this entry already exists in horse_market_movement
      const existingResponse = await fetch(
        `${supabaseUrl}/rest/v1/horse_market_movement?select=id&race_id=eq.${entry.race_id}&horse_id=eq.${entry.horse_id}&bookmaker=eq.Ladbrokes&limit=1`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          }
        }
      );
      
      if (existingResponse.ok) {
        const existingData = await existingResponse.json();
        if (existingData.length === 0) {
          // This entry doesn't exist in horse_market_movement, so add it
          entries.push({
            race_id: entry.race_id,
            horse_id: entry.horse_id,
            horse_name: entry.horse_name,
            current_odds: entry.current_odds,
            course_name: race.course_name,
            off_time: race.off_time,
            date: race.date
          });
        }
      }
      
      // Progress logging
      if (checkedCount % 50 === 0) {
        console.log(`Checked ${checkedCount} entries, found ${entries.length} missing so far...`);
      }
    }
    
    console.log(`Checked ${checkedCount} today's race entries, found ${entries.length} missing from horse_market_movement`);
    
    console.log(`Found ${entries.length} race entries that need seeding`);
    
    if (entries.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All race entries for today are already seeded in horse_market_movement',
        entries_processed: 0,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Step 2: Create baseline market movement records
    let successCount = 0;
    let errorCount = 0;
    const now = new Date().toISOString();
    
    // Process in batches to avoid timeout
    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)} (${batch.length} entries)`);
      
      for (const entry of batch) {
        try {
          // Convert decimal odds to fractional format for initial_odds
          const decimalOdds = entry.current_odds || 0;
          let fractionalOdds = '0/1';
          
          if (decimalOdds > 1) {
            // Convert decimal to fractional (e.g., 3.5 -> 5/2)
            const numerator = Math.round((decimalOdds - 1) * 2);
            const denominator = 2;
            fractionalOdds = `${numerator}/${denominator}`;
            
            // Simplify common fractions
            if (numerator % denominator === 0) {
              fractionalOdds = `${numerator/denominator}/1`;
            }
          }
          
          // Format current odds
          const formattedCurrentOdds = decimalOdds > 0 ? `${decimalOdds} (${fractionalOdds})` : 'N/A';
          
          // Escape values for SQL
          const escapeSql = (value) => String(value || '').replace(/'/g, "''");
          
          const insertSql = `
            INSERT INTO horse_market_movement (
              race_id, horse_id, course, off_time, bookmaker,
              initial_odds, current_odds, odds_change, odds_movement, odds_movement_pct,
              last_updated, created_at, updated_at
            ) VALUES (
              '${escapeSql(entry.race_id)}',
              '${escapeSql(entry.horse_id)}',
              '${escapeSql(entry.course_name)}',
              '${escapeSql(entry.off_time)}',
              'Ladbrokes',
              '${escapeSql(fractionalOdds)}',
              '${escapeSql(formattedCurrentOdds)}',
              '0.00',
              'stable',
              0.0,
              '${now}',
              '${now}',
              '${now}'
            );
          `;
          
          const insertResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: insertSql })
          });
          
          if (insertResponse.ok) {
            successCount++;
            if (successCount % 20 === 0) {
              console.log(`Seeded ${successCount} horses so far...`);
            }
          } else {
            errorCount++;
            const errorText = await insertResponse.text();
            console.error(`Failed to seed horse ${entry.horse_id}:`, errorText);
          }
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing horse ${entry.horse_id}:`, error.message);
        }
      }
      
      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Market movement seeding completed: ${successCount} success, ${errorCount} errors`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Market movement seeding completed successfully',
      date: today,
      entries_found: entries.length,
      entries_seeded: successCount,
      entries_failed: errorCount,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Market movement seeder error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'SEEDER_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});