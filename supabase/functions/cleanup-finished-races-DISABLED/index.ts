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
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get current UK time
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Europe/London',
            hour12: false // Use 24-hour format
        });

        console.log('Current UK time:', currentTime);

        // Get all shortlist entries
        const shortlistResponse = await fetch(
            `${supabaseUrl}/rest/v1/shortlist?select=*`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!shortlistResponse.ok) {
            const errorText = await shortlistResponse.text();
            console.error('Failed to fetch shortlist:', errorText);
            throw new Error(`Failed to fetch shortlist: ${errorText}`);
        }

        const allShortlist = await shortlistResponse.json();
        console.log(`Found ${allShortlist.length} total shortlist entries`);

        // Find finished races
        const finishedRaces = allShortlist.filter((item: any) => {
            try {
                const raceTimeFormatted = item.race_time.substring(0, 5); // Get HH:MM format
                const [hours, minutes] = raceTimeFormatted.split(':').map(Number);
                
                // If hours are 01-11, they are PM times (add 12 hours)
                // If hours are 12, it's 12 PM (keep as 12)
                // If hours are 00, it's 12 AM (keep as 00)
                let adjustedHours = hours;
                if (hours >= 1 && hours <= 11) {
                    adjustedHours = hours + 12; // Convert to PM
                }
                
                const adjustedRaceTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                
                console.log(`Race time: ${item.race_time} -> ${adjustedRaceTime}, Current time: ${currentTime}`);
                
                return adjustedRaceTime < currentTime;
            } catch (error) {
                console.error('Error checking race time:', error);
                return false;
            }
        });

        console.log(`Found ${finishedRaces.length} finished races to remove`);

        if (finishedRaces.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                message: 'No finished races to clean up',
                removedCount: 0
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Remove finished races
        const idsToRemove = finishedRaces.map((item: any) => item.id);
        console.log('Removing finished races with IDs:', idsToRemove);

        const deleteResponse = await fetch(
            `${supabaseUrl}/rest/v1/shortlist?id=in.(${idsToRemove.join(',')})`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            }
        );

        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('Failed to remove finished races:', errorText);
            throw new Error(`Failed to remove finished races: ${errorText}`);
        }

        const deletedEntries = await deleteResponse.json();
        console.log(`Successfully removed ${deletedEntries.length} finished races`);

        return new Response(JSON.stringify({
            success: true,
            message: 'Finished races cleaned up successfully',
            removedCount: deletedEntries.length,
            removedRaces: finishedRaces.map((item: any) => ({
                id: item.id,
                horse_name: item.horse_name,
                course: item.course,
                race_time: item.race_time
            }))
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Cleanup finished races error:', error);

        const errorResponse = {
            success: false,
            error: {
                code: 'CLEANUP_FINISHED_RACES_ERROR',
                message: error.message
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
