// REBUILT FROM SCRATCH - Add to Shortlist Edge Function
// Fixed authentication and table name issues
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
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      throw new Error('Server configuration error');
    }
    // Get and validate authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header provided');
    }
    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      throw new Error('Invalid authorization token format');
    }
    // Verify user authentication
    console.log('Verifying user authentication...');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      }
    });
    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Auth verification failed:', errorText);
      throw new Error('Authentication failed - invalid token');
    }
    const userData = await userResponse.json();
    if (!userData?.id) {
      console.error('No user ID in auth response:', userData);
      throw new Error('Invalid user data');
    }
    console.log('User authenticated successfully:', userData.id);
    // Parse and validate request body
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      throw new Error('Invalid JSON in request body');
    }
    console.log('🔥 Raw request data:', requestData);
    const { horse_name, race_time, course, current_odds, source = 'today_races', jockey_name, trainer_name, ml_info } = requestData;
    console.log('🔥 Extracted fields:', { horse_name, race_time, course, current_odds, source, jockey_name, trainer_name, ml_info });
    // Validate required fields
    if (!horse_name?.trim()) {
      throw new Error('horse_name is required');
    }
    if (!race_time?.trim()) {
      throw new Error('race_time is required');
    }
    if (!course?.trim()) {
      throw new Error('course is required');
    }
    // Prepare data for insertion
    const insertData = {
      user_id: userData.id,
      horse_name: horse_name.trim(),
      race_time: race_time.trim(),
      course: course.trim(),
      current_odds: current_odds ? String(current_odds).trim() : null,
      source: source.trim(),
      jockey_name: jockey_name?.trim() || null,
      trainer_name: trainer_name?.trim() || null,
      ml_info: ml_info?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    console.log('Adding to shortlist:', {
      user_id: insertData.user_id,
      horse_name: insertData.horse_name,
      course: insertData.course,
      source: insertData.source
    });
    // Insert into shortlist table (FIXED: using correct table name)
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify(insertData)
    });
    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('Database insert failed:', errorText);
      // Handle duplicate entry error
      if (insertResponse.status === 409) {
        // Try to update existing entry instead
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/shortlist?user_id=eq.${userData.id}&horse_name=eq.${encodeURIComponent(horse_name.trim())}&course=eq.${encodeURIComponent(course.trim())}&source=eq.${source.trim()}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            current_odds: insertData.current_odds,
            jockey_name: insertData.jockey_name,
            trainer_name: insertData.trainer_name,
            ml_info: insertData.ml_info,
            updated_at: new Date().toISOString()
          })
        });
        if (!updateResponse.ok) {
          const updateError = await updateResponse.text();
          console.error('Update failed:', updateError);
          throw new Error(`Failed to update existing shortlist entry: ${updateError}`);
        }
        const updatedData = await updateResponse.json();
        console.log('Shortlist entry updated successfully');
        return new Response(JSON.stringify({
          success: true,
          data: updatedData[0] || updatedData,
          message: 'Horse updated in shortlist successfully'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      throw new Error(`Database operation failed: ${errorText}`);
    }
    const insertedData = await insertResponse.json();
    console.log('Horse added to shortlist successfully');
    return new Response(JSON.stringify({
      success: true,
      data: insertedData[0] || insertedData,
      message: 'Horse added to shortlist successfully'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Add to shortlist error:', error.message);
    // Determine appropriate status code
    let statusCode = 500;
    if (error.message.includes('authorization') || error.message.includes('Authentication')) {
      statusCode = 401;
    } else if (error.message.includes('required') || error.message.includes('Invalid JSON')) {
      statusCode = 400;
    }
    const errorResponse = {
      success: false,
      error: {
        code: 'ADD_TO_SHORTLIST_ERROR',
        message: error.message
      }
    };
    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
