import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'
Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreFlight(req)
  if (preflight) return preflight
  try {
    // Get request data
    const { status, sortBy = 'race_time', sortOrder = 'asc' } = await req.json();
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
    // Verify token and get user
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
    // Get current UK time and date
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/London',
      hour12: false // Use 24-hour format
    });
    const currentDate = now.toLocaleDateString('en-CA', {
      timeZone: 'Europe/London'
    }); // YYYY-MM-DD format
    // Get all user selections
    const selectionsResponse = await fetch(`${supabaseUrl}/rest/v1/selections?user_id=eq.${userId}&order=${sortBy}.${sortOrder}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      }
    });
    if (!selectionsResponse.ok) {
      const errorText = await selectionsResponse.text();
      throw new Error(`Failed to fetch selections: ${errorText}`);
    }
    const allSelections = await selectionsResponse.json();
    // Filter selections based on race time
    const upcomingSelections = [];
    const pastSelections = [];
    allSelections.forEach((selection)=>{
      try {
        // Check if we have a created_at date to determine if it's from today or yesterday
        const selectionDate = new Date(selection.created_at).toLocaleDateString('en-CA', {
          timeZone: 'Europe/London'
        });
        const isFromToday = selectionDate === currentDate;
        const isFromYesterday = selectionDate === new Date(now.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
          timeZone: 'Europe/London'
        });
        const raceTimeFormatted = selection.race_time.substring(0, 5); // Get HH:MM format
        const [hours, minutes] = raceTimeFormatted.split(':').map(Number);
        // If hours are 01-11, they are PM times (add 12 hours)
        // If hours are 12, it's 12 PM (keep as 12)
        // If hours are 00, it's 12 AM (keep as 00)
        let adjustedHours = hours;
        if (hours >= 1 && hours <= 11) {
          adjustedHours = hours + 12; // Convert to PM
        }
        const adjustedRaceTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        // If it's from yesterday, it's definitely past
        if (isFromYesterday) {
          pastSelections.push(selection);
        } else if (isFromToday) {
          if (adjustedRaceTime > currentTime) {
            upcomingSelections.push(selection);
          } else {
            pastSelections.push(selection);
          }
        } else {
          if (adjustedRaceTime > currentTime) {
            upcomingSelections.push(selection);
          } else {
            pastSelections.push(selection);
          }
        }
      } catch {
        // Default to upcoming if we can't parse the time
        upcomingSelections.push(selection);
      }
    });
    // Return data based on requested status
    let filteredSelections = [];
    if (status === 'upcoming') {
      filteredSelections = upcomingSelections;
    } else if (status === 'past') {
      filteredSelections = pastSelections;
    } else {
      // Return all if no specific status requested
      filteredSelections = allSelections;
    }
    const counts = {
      upcoming: upcomingSelections.length,
      past: pastSelections.length,
      total: allSelections.length
    };
    return new Response(JSON.stringify({
      success: true,
      data: filteredSelections,
      counts: counts
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Get user selections failed');
    const errorResponse = {
      success: false,
      error: {
        code: 'GET_USER_SELECTIONS_ERROR',
        message: error.message
      }
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
