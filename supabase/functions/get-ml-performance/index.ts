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
    // Get request parameters
    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get('days') || '30');
    const modelName = url.searchParams.get('model');
    console.log(`Fetching ML performance data for last ${daysBack} days${modelName ? `, model: ${modelName}` : ''}`);
    // Build query based on parameters
    let query = `?select=*&order=created_at.desc`;
    if (modelName) {
      query += `&model_name=eq.${modelName}`;
    }
    if (daysBack > 0) {
      const dateFilter = new Date();
      dateFilter.setDate(dateFilter.getDate() - daysBack);
      query += `&created_at=gte.${dateFilter.toISOString()}`;
    }
    // Get ML performance data
    const performanceResponse = await fetch(`${supabaseUrl}/rest/v1/ml_model_race_results${query}`, {
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
    // Get summary statistics
    const summaryResponse = await fetch(`${supabaseUrl}/rest/v1/ml_model_race_summary`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    let summaryData = [];
    if (summaryResponse.ok) {
      summaryData = await summaryResponse.json();
    }
    // Get recent performance (last 30 days)
    const recentResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_recent_ml_race_performance`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        days_back: 30
      })
    });
    let recentData = [];
    if (recentResponse.ok) {
      recentData = await recentResponse.json();
    }
    // Calculate additional metrics
    const modelStats = {};
    const models = [
      'mlp',
      'rf',
      'xgboost',
      'benter',
      'ensemble'
    ];
    for (const model of models){
      const modelData = performanceData.filter((p)=>p.model_name === model);
      const totalPredictions = modelData.length;
      const correctWinners = modelData.filter((p)=>p.is_winner).length;
      const correctTop3 = modelData.filter((p)=>p.is_top3).length;
      modelStats[model] = {
        total_predictions: totalPredictions,
        correct_winner_predictions: correctWinners,
        correct_top3_predictions: correctTop3,
        winner_accuracy: totalPredictions > 0 ? correctWinners / totalPredictions * 100 : 0,
        top3_accuracy: totalPredictions > 0 ? correctTop3 / totalPredictions * 100 : 0,
        average_confidence: modelData.length > 0 ? modelData.reduce((sum, p)=>sum + p.predicted_probability, 0) / modelData.length * 100 : 0
      };
    }
    return new Response(JSON.stringify({
      success: true,
      data: {
        performance_records: performanceData,
        summary: summaryData,
        recent_performance: recentData,
        model_statistics: modelStats,
        total_records: performanceData.length,
        days_back: daysBack,
        model_filter: modelName || 'all'
      },
      timestamp: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching ML performance data:', error);
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
