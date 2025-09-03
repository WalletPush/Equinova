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
        console.log('AI Insider data request at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Call the AI Insider analysis function to get fresh data
        console.log('Calling AI analysis function...');
        const analysisResponse = await fetch(
            `${supabaseUrl}/functions/v1/ai-insider-analysis`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!analysisResponse.ok) {
            throw new Error(`AI analysis failed: ${analysisResponse.status}`);
        }

        const analysisData = await analysisResponse.json();
        console.log('AI analysis completed successfully:', JSON.stringify(analysisData));

        // Safely extract data with null checks
        const responseData = analysisData?.data || analysisData || {};

        // Return the analysis data in the expected format
        const result = {
            data: {
                courseSpecialists: responseData.courseSpecialists || [],
                trainerIntents: responseData.trainerIntents || [], 
                marketAlerts: responseData.marketAlerts || [],
                summary: {
                    totalSpecialists: (responseData.courseSpecialists || []).length,
                    totalTrainerIntents: (responseData.trainerIntents || []).length,
                    totalAlerts: (responseData.marketAlerts || []).length,
                    lastUpdated: new Date().toISOString()
                }
            }
        };

        console.log('AI Insider data compiled successfully:', {
            specialists: result.data.courseSpecialists.length,
            intents: result.data.trainerIntents.length,
            alerts: result.data.marketAlerts.length
        });

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Insider data error:', error);

        return new Response(JSON.stringify({
            error: {
                code: 'AI_INSIDER_DATA_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
