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
    // Get today's date in UK timezone
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/London'
    });
    console.log(`Fetching ML tracker data for today: ${today}`);
    // Get today's ML model performance
    const performanceResponse = await fetch(`${supabaseUrl}/rest/v1/ml_model_race_results?created_at=gte.${today}T00:00:00.000Z&created_at=lt.${today}T23:59:59.999Z&select=*&order=created_at.desc`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!performanceResponse.ok) {
      throw new Error(`Failed to fetch ML performance data: ${performanceResponse.status}`);
    }
    const performanceData = await performanceResponse.json();
    // Get today's races with results
    const racesResponse = await fetch(`${supabaseUrl}/rest/v1/race_results?date=eq.${today}&select=race_id`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    let totalRacesToday = 0;
    if (racesResponse.ok) {
      const racesData = await racesResponse.json();
      totalRacesToday = racesData.length;
    }
    // Calculate performance for each model
    const models = [
      'mlp',
      'rf',
      'xgboost',
      'benter',
      'ensemble'
    ];
    const modelPerformance = [];
    for (const modelName of models){
      const modelData = performanceData.filter((p)=>p.model_name === modelName);
      const totalRaces = modelData.length;
      const racesWon = modelData.filter((p)=>p.is_winner).length;
      const racesLost = modelData.filter((p)=>!p.is_winner).length;
      const winRate = totalRaces > 0 ? racesWon / totalRaces * 100 : 0;
      // Check if model is due a winner (if they've had 5+ races without a win)
      const racesWithoutWin = totalRaces - racesWon;
      const isDueWinner = racesWithoutWin >= 5 && winRate < 20;
      // Get next runner for this model (highest confidence upcoming race)
      const nextRunner = await getNextRunnerForModel(modelName, supabaseUrl, supabaseKey);
      modelPerformance.push({
        model_name: modelName,
        full_name: getModelFullName(modelName),
        total_races_today: totalRaces,
        races_won: racesWon,
        races_lost: racesLost,
        win_rate: winRate,
        next_runner: nextRunner,
        is_due_winner: isDueWinner,
        performance_trend: getPerformanceTrend(winRate)
      });
    }
    return new Response(JSON.stringify({
      success: true,
      data: {
        models: modelPerformance,
        last_updated: new Date().toISOString(),
        total_races_today: totalRacesToday
      },
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error(`get-ml-tracker: Error fetching ML tracker data for date ${today}:`, error?.stack || error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error),
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
// Helper function to get model full name
function getModelFullName(modelName) {
  const names = {
    mlp: 'Multi-Layer Perceptron',
    rf: 'Random Forest',
    xgboost: 'XGBoost',
    benter: 'Light GBM',
    ensemble: 'Ensemble Model'
  };
  return names[modelName] || modelName;
}
// Helper function to get performance trend
function getPerformanceTrend(winRate) {
  if (winRate >= 40) return 'hot';
  if (winRate <= 10) return 'cold';
  return 'normal';
}
// Helper function to get next runner for a model
async function getNextRunnerForModel(modelName, supabaseUrl, supabaseKey) {
  try {
    // Get today's date in UK timezone
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/London'
    });
    // Find the next upcoming race that hasn't finished yet
    // Fetch today's races and pick the first one whose off_time is >= current London time.
    const racesResponse = await fetch(`${supabaseUrl}/rest/v1/races?date=eq.${today}&order=off_time.asc&limit=50&select=race_id,off_time,course_name`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!racesResponse.ok) return null;
    const racesData = await racesResponse.json();
    if (!racesData || racesData.length === 0) {
      console.log(`No races found for ${modelName} today`);
      return null;
    }
    // Current London time as HH:MM
    const currentLondonTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false, hour: '2-digit', minute: '2-digit' });

    function normalizeTimeStr(t) {
      if (!t) return null;
      // If contains T it's likely an ISO datetime
      if (t.includes('T')) return t;
      // Extract HH:MM from formats like '1:15', '13:15', '13:15:00'
      const m = t.match(/(\d{1,2}:\d{2})/);
      if (m && m[1]) {
        const parts = m[1].split(':');
        const hh = String(Number(parts[0])).padStart(2, '0');
        return `${hh}:${parts[1]}`;
      }
      return null;
    }

    // Find the first race that is at or after current London time
    let nextRace = null;
    for (const r of racesData) {
      const off = r.off_time;
      if (!off) continue;
      // If off_time looks like ISO datetime, compare Date objects
      if (off.includes('T')) {
        const dt = new Date(off);
        if (isNaN(dt.getTime())) continue;
        const now = new Date();
        if (dt > now) {
          nextRace = r;
          break;
        }
      } else {
        const m = off.match(/(\d{1,2}):(\d{2})/);
        if (!m) continue;
        const hh = Number(m[1]);
        const mm = m[2];
        const pad = (n) => String(n).padStart(2, '0');
        const candidate1 = `${pad(hh)}:${mm}`; // as-is (could be 12-hour)
        // If hour < 12, also consider adding 12 to interpret as PM (e.g., 01:30 -> 13:30)
        const candidate2 = hh < 12 ? `${pad((hh % 12) + 12)}:${mm}` : null;

        // Prefer the earliest candidate that is at/after currentLondonTime
        let chosen = null;
        if (candidate1 > currentLondonTime) chosen = candidate1;
        if (!chosen && candidate2 && candidate2 > currentLondonTime) chosen = candidate2;
        if (chosen) {
          nextRace = r;
          break;
        }
        // otherwise continue to next race
      }
    }

    if (!nextRace) {
      console.log(`No upcoming races found for ${modelName} today (checked ${racesData.length})`);
      return null;
    }
    // Now get this model's top pick for that specific race
    const entriesResponse = await fetch(`${supabaseUrl}/rest/v1/race_entries?race_id=eq.${nextRace.race_id}&select=horse_name,horse_id,trainer_name,jockey_name,current_odds,${modelName}_proba&${modelName}_proba=gt.0&order=${modelName}_proba.desc&limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (!entriesResponse.ok) return null;
    const entries = await entriesResponse.json();
    if (!entries || entries.length === 0) return null;
    const entry = entries[0];
    return {
      horse_name: entry.horse_name,
      odds: entry.current_odds ? `${entry.current_odds}/1` : 'N/A',
      trainer: entry.trainer_name || 'N/A',
      jockey: entry.jockey_name || 'N/A',
      confidence: entry[`${modelName}_proba`] * 100 || 0,
      race_time: nextRace.off_time || 'N/A',
      course: nextRace.course_name || 'N/A',
      race_id: nextRace.race_id,
      horse_id: entry.horse_id
    };
  } catch (error) {
    console.error(`Error getting next runner for ${modelName}:`, error);
    return null;
  }
}
