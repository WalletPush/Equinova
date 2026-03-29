import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)
    const preflight = handleCorsPreFlight(req)
    if (preflight) return preflight

    try {
        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Call the AI Insider analysis function to get fresh data
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

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('AI Insider data failed');

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
