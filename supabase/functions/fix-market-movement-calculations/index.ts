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

  // CRITICAL FIX: Robust odds parsing function (same as in main monitor)
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
  
  // CRITICAL FIX: Proper movement calculation (same as in main monitor)
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting market movement calculation fixes for existing database records...');
    
    // Step 1: Get all existing market movement records
    const recordsResponse = await fetch(
      `${supabaseUrl}/rest/v1/horse_market_movement?select=race_id,horse_id,bookmaker,initial_odds,current_odds,odds_change,odds_movement,odds_movement_pct&order=race_id,horse_id,bookmaker`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!recordsResponse.ok) {
      const errorText = await recordsResponse.text();
      throw new Error(`Failed to fetch market movement records: ${errorText}`);
    }
    
    const records = await recordsResponse.json();
    console.log(`Found ${records.length} market movement records to potentially fix`);
    
    if (records.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No market movement records found to fix',
        records_processed: 0,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Step 2: Process each record and fix calculations
    let recordsProcessed = 0;
    let recordsFixed = 0;
    let recordsSkipped = 0;
    let recordsErrored = 0;
    
    // Process in batches to avoid timeout
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(records.length/batchSize)} (${batch.length} records)`);
      
      for (const record of batch) {
        try {
          recordsProcessed++;
          
          // Parse initial and current odds to decimal
          const initialDecimal = parseOddsToDecimal(record.initial_odds);
          const currentDecimal = parseOddsToDecimal(record.current_odds);
          
          if (!initialDecimal || !currentDecimal) {
            recordsSkipped++;
            console.log(`SKIPPED: Record ${record.race_id}/${record.horse_id} - Unable to parse odds: initial='${record.initial_odds}', current='${record.current_odds}'`);
            continue;
          }
          
          // Calculate correct movement
          const movementResult = calculateOddsMovement(initialDecimal, currentDecimal);
          
          // Check if this record needs fixing
          const currentChange = parseFloat(record.odds_change) || 0;
          const currentPercentage = parseFloat(record.odds_movement_pct) || 0;
          const currentMovement = record.odds_movement || 'stable';
          
          const needsFix = (
            Math.abs(currentChange - movementResult.change) > 0.01 || 
            Math.abs(currentPercentage - movementResult.percentage) > 0.01 ||
            currentMovement !== movementResult.movement ||
            record.odds_change === 'NaN' ||
            record.odds_movement_pct === null
          );
          
          if (!needsFix) {
            console.log(`CORRECT: Record ${record.race_id}/${record.horse_id} already has correct calculations`);
            continue;
          }
          
          // Escape values for SQL
          const escapeSql = (value) => String(value || '').replace(/'/g, "''");
          
          // Update the record with correct calculations
          const updateSql = `
            UPDATE horse_market_movement 
            SET 
              odds_change = '${movementResult.change}',
              odds_movement = '${escapeSql(movementResult.movement)}',
              odds_movement_pct = ${movementResult.percentage},
              updated_at = NOW()
            WHERE race_id = '${escapeSql(record.race_id)}' 
            AND horse_id = '${escapeSql(record.horse_id)}' 
            AND bookmaker = '${escapeSql(record.bookmaker)}';
          `;
          
          const updateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: updateSql
            })
          });
          
          if (updateResponse.ok) {
            recordsFixed++;
            console.log(`FIXED: Record ${record.race_id}/${record.horse_id} - OLD: ${currentChange}/${currentMovement}/${currentPercentage}% -> NEW: ${movementResult.change}/${movementResult.movement}/${movementResult.percentage}%`);
          } else {
            recordsErrored++;
            const errorText = await updateResponse.text();
            console.error(`UPDATE FAILED for record ${record.race_id}/${record.horse_id}:`, errorText);
          }
          
        } catch (error) {
          recordsErrored++;
          console.error(`Error processing record ${record.race_id}/${record.horse_id}:`, error.message);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < records.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Calculation fixes completed: ${recordsProcessed} processed, ${recordsFixed} fixed, ${recordsSkipped} skipped, ${recordsErrored} errored`);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Market movement calculation fixes completed successfully',
      records_found: records.length,
      records_processed: recordsProcessed,
      records_fixed: recordsFixed,
      records_skipped: recordsSkipped,
      records_errored: recordsErrored,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Market movement calculation fixer error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'CALCULATION_FIXER_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});