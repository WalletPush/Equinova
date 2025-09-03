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

  // CRITICAL FIX: Robust odds parsing function
  function parseOddsToDecimal(oddsString) {
    if (!oddsString || oddsString === '-' || oddsString === 'NaN' || oddsString === '') {
      return null;
    }
    
    // Handle decimal format with fractional in parentheses: "11 (10/1)"
    const decimalMatch = oddsString.match(/^([0-9]+\.?[0-9]*)/);
    if (decimalMatch) {
      const decimal = parseFloat(decimalMatch[1]);
      if (!isNaN(decimal) && decimal > 0) {
        return decimal;
      }
    }
    
    // Handle fractional format: "10/1", "5/2", "7/4"
    const fractionalMatch = oddsString.match(/^([0-9]+)\/([0-9]+)$/);
    if (fractionalMatch) {
      const numerator = parseInt(fractionalMatch[1]);
      const denominator = parseInt(fractionalMatch[2]);
      if (denominator > 0) {
        return (numerator / denominator) + 1; // Convert to decimal odds
      }
    }
    
    // Handle special cases
    if (oddsString.toLowerCase() === 'evn' || oddsString.toLowerCase() === 'evens') {
      return 2.0; // Evens = 1/1 = 2.0 decimal
    }
    
    // Handle other formats
    const numericValue = parseFloat(oddsString);
    if (!isNaN(numericValue) && numericValue > 0) {
      return numericValue;
    }
    
    return null;
  }
  
  // CRITICAL FIX: Proper movement calculation
  function calculateOddsMovement(initialDecimal, currentDecimal) {
    if (!initialDecimal || !currentDecimal || initialDecimal <= 0 || currentDecimal <= 0) {
      return {
        change: 0,
        movement: 'stable',
        percentage: 0
      };
    }
    
    const change = currentDecimal - initialDecimal;
    const percentage = (change / initialDecimal) * 100;
    
    let movement = 'stable';
    if (Math.abs(change) >= 0.1) { // Only consider significant changes
      if (change < 0) {
        movement = 'steaming'; // Odds shortened (more likely to win)
      } else {
        movement = 'drifting'; // Odds lengthened (less likely to win)
      }
    }
    
    return {
      change: parseFloat(change.toFixed(2)),
      movement: movement,
      percentage: parseFloat(percentage.toFixed(2))
    };
  }

  try {
    // Check if current time is within racing hours (8 AM - 9 PM UK time)
    const now = new Date();
    const londonTimeString = now.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const [currentHour, currentMinute] = londonTimeString.split(':').map(Number);
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = 8 * 60; // 8:00 AM UK time
    const endTimeInMinutes = 21 * 60; // 9:00 PM UK time
    
    console.log(`Current London time: ${londonTimeString}, Start time check: ${currentTimeInMinutes >= startTimeInMinutes}`);
    
    // Only execute if it's 8:00 AM or later, and before 9:00 PM
    if (currentTimeInMinutes < startTimeInMinutes) {
      return new Response(JSON.stringify({
        success: true,
        message: `Racing market monitoring not yet active. Current time: ${londonTimeString}, starts at 8:00 AM UK time`,
        current_london_time: londonTimeString,
        start_time: '8:00 AM',
        records_processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (currentTimeInMinutes >= endTimeInMinutes) {
      return new Response(JSON.stringify({
        success: true,
        message: `Racing market monitoring ended for the day. Current time: ${londonTimeString}, ends at 9:00 PM UK time`,
        current_london_time: londonTimeString,
        end_time: '9:00 PM',
        records_processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Racing API credentials  
    const RACING_API_USERNAME = "B06mvaMg9rdqfPBMJLe6wU0m";
    const RACING_API_PASSWORD = "WC4kl7E2GvweCA9uxFAywbOY";
    
    console.log('Starting Racing API market monitoring (8:00am-9:00pm schedule) - FIXED CALCULATIONS...');
    
    // Step 1: Call Racing API to get all current racecards
    const authString = btoa(`${RACING_API_USERNAME}:${RACING_API_PASSWORD}`);
    
    const apiResponse = await fetch('https://api.theracingapi.com/v1/racecards/pro', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Racing API response status: ${apiResponse.status}`);
    
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`Racing API failed: ${apiResponse.status} - ${errorText}`);
    }
    
    const apiData = await apiResponse.json();
    console.log(`Successfully fetched data from Racing API - ${apiData?.racecards?.length || 0} racecards`);
    
    if (!apiData.racecards || apiData.racecards.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No racecards available from Racing API',
        records_processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Step 2: Process ALL horses from Racing API with FIXED calculations
    let processedCount = 0;
    let actuallyInsertedCount = 0;
    let ladbrokesOddsFoundCount = 0;
    let newHorsesFound = 0;
    let calculationFixesApplied = 0;
    
    console.log('ENHANCED MODE WITH FIXED CALCULATIONS: Processing ALL horses from Racing API...');
    
    for (const apiRace of apiData.racecards) {
      console.log(`Processing API race: ${apiRace.race_id} at ${apiRace.course}`);
      
      // Process each runner in this race
      for (const runner of (apiRace.runners || [])) {
        // Find Ladbrokes odds for this runner
        let ladbrokesOdds = null;
        if (runner.odds && Array.isArray(runner.odds)) {
          for (const oddsEntry of runner.odds) {
            if (oddsEntry.bookmaker === 'Ladbrokes') {
              ladbrokesOdds = oddsEntry;
              ladbrokesOddsFoundCount++;
              break;
            }
          }
        }
        
        if (!ladbrokesOdds || !ladbrokesOdds.decimal) {
          continue; // Skip if no Ladbrokes odds
        }
        
        processedCount++;
        
        // Step 3: Check for existing market movement record
        const existingRecordResponse = await fetch(
          `${supabaseUrl}/rest/v1/horse_market_movement?select=*&race_id=eq.${apiRace.race_id}&horse_id=eq.${runner.horse_id}&bookmaker=eq.Ladbrokes&limit=1`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            }
          }
        );
        
        let existingRecord = null;
        if (existingRecordResponse.ok) {
          const existingData = await existingRecordResponse.json();
          if (existingData.length > 0) {
            existingRecord = existingData[0];
          }
        }
        
        // Step 4: FIXED odds parsing and movement calculation
        const currentFractionalOdds = ladbrokesOdds.fractional || '';
        const currentDecimalOdds = parseFloat(ladbrokesOdds.decimal);
        
        let initialOdds = currentFractionalOdds;
        let initialDecimalOdds = currentDecimalOdds;
        let isNewHorse = false;
        
        if (existingRecord) {
          // We have existing record - preserve initial odds
          initialOdds = existingRecord.initial_odds;
          // CRITICAL FIX: Parse initial odds to decimal properly
          initialDecimalOdds = parseOddsToDecimal(existingRecord.initial_odds);
          if (!initialDecimalOdds) {
            // Fallback to current odds if initial parsing fails
            initialDecimalOdds = currentDecimalOdds;
            initialOdds = currentFractionalOdds;
          }
        } else {
          // NEW HORSE: This is a new horse we haven't seen before
          isNewHorse = true;
          newHorsesFound++;
          console.log(`NEW HORSE DETECTED: ${runner.horse_id} (${runner.horse_name}) at ${apiRace.course}`);
        }
        
        // CRITICAL FIX: Calculate movement using proper decimal comparison
        const movementResult = calculateOddsMovement(initialDecimalOdds, currentDecimalOdds);
        calculationFixesApplied++;
        
        // Step 5: Format current_odds to include both decimal and fractional
        const formattedCurrentOdds = currentFractionalOdds 
          ? `${currentDecimalOdds} (${currentFractionalOdds})`
          : currentDecimalOdds.toString();
        
        // Step 6: Use proper SQL INSERT with ON CONFLICT - handles both new inserts and updates
        const now = new Date().toISOString();
        
        // Escape single quotes in values to prevent SQL injection
        const escapeSql = (value) => String(value || '').replace(/'/g, "''");
        
        const upsertSql = `
          INSERT INTO horse_market_movement (
            race_id, horse_id, course, off_time, bookmaker, 
            initial_odds, current_odds, odds_change, odds_movement, odds_movement_pct, 
            last_updated, created_at, updated_at
          ) VALUES (
            '${escapeSql(apiRace.race_id)}',
            '${escapeSql(runner.horse_id)}',
            '${escapeSql(apiRace.course)}',
            '${escapeSql(apiRace.off_time)}',
            'Ladbrokes',
            '${escapeSql(initialOdds)}',
            '${escapeSql(formattedCurrentOdds)}',
            '${movementResult.change}',
            '${escapeSql(movementResult.movement)}',
            ${movementResult.percentage},
            '${escapeSql(ladbrokesOdds.updated || now)}',
            '${now}',
            '${now}'
          )
          ON CONFLICT (race_id, horse_id, bookmaker) 
          DO UPDATE SET 
            current_odds = EXCLUDED.current_odds,
            odds_change = EXCLUDED.odds_change,
            odds_movement = EXCLUDED.odds_movement,
            odds_movement_pct = EXCLUDED.odds_movement_pct,
            last_updated = EXCLUDED.last_updated,
            updated_at = EXCLUDED.updated_at;
        `;
        
        try {
          const insertResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: upsertSql
            })
          });
          
          if (insertResponse.ok) {
            actuallyInsertedCount++;
            const actionType = isNewHorse ? 'NEW HORSE ADDED' : 'UPDATED';
            console.log(`${actionType}: Horse ${runner.horse_id} at ${apiRace.course} - ${movementResult.movement} (${movementResult.percentage}%)`);
          } else {
            const errorText = await insertResponse.text();
            console.error(`UPSERT FAILED for horse ${runner.horse_id}:`, errorText);
          }
        } catch (dbError) {
          console.error(`DATABASE ERROR for horse ${runner.horse_id}:`, dbError.message);
        }
      }
    }
    
    console.log(`Processing complete: ${processedCount} horses processed, ${actuallyInsertedCount} records inserted/updated, ${newHorsesFound} new horses found, ${calculationFixesApplied} calculations fixed`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Racing API market monitoring completed successfully (8:00am-9:00pm schedule) - FIXED CALCULATIONS VERSION',
      api_source: 'theracingapi.com/v1/racecards/pro',
      bookmaker: 'Ladbrokes', 
      api_racecards: apiData.racecards.length,
      horses_processed: processedCount,
      ladbrokes_odds_found: ladbrokesOddsFoundCount,
      records_actually_inserted: actuallyInsertedCount,
      new_horses_found: newHorsesFound,
      calculation_fixes_applied: calculationFixesApplied,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Racing market monitor CRITICAL ERROR:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'RACING_MARKET_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});