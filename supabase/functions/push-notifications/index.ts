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
        console.log('Push notifications processing started at:', new Date().toISOString());

        // Get Supabase credentials
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');

        if (!serviceRoleKey || !supabaseUrl) {
            throw new Error('Supabase configuration missing');
        }

        // Get unsent alerts
        const alertsResponse = await fetch(
            `${supabaseUrl}/rest/v1/ai_insider_alerts?is_sent=eq.false&confidence_score=gte.75&order=created_at.desc&limit=50`,
            {
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                }
            }
        );

        if (!alertsResponse.ok) {
            throw new Error('Failed to fetch unsent alerts');
        }

        const alerts = await alertsResponse.json();
        console.log(`Found ${alerts.length} unsent alerts`);

        if (alerts.length === 0) {
            return new Response(JSON.stringify({
                data: { message: 'No alerts to send', processed: 0 }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        let processedCount = 0;
        const alertIds = [];

        // Process each alert
        for (const alert of alerts) {
            try {
                // Create notification payload
                const notificationPayload = {
                    title: getNotificationTitle(alert.alert_type),
                    body: alert.message,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    data: {
                        alert_id: alert.id,
                        race_id: alert.race_id,
                        horse_id: alert.horse_id,
                        alert_type: alert.alert_type,
                        confidence_score: alert.confidence_score,
                        course: alert.course,
                        timestamp: alert.created_at
                    },
                    actions: [
                        {
                            action: 'view_race',
                            title: 'View Race',
                            icon: '/favicon.ico'
                        },
                        {
                            action: 'dismiss',
                            title: 'Dismiss'
                        }
                    ],
                    requireInteraction: alert.confidence_score >= 90,
                    tag: `${alert.alert_type}_${alert.race_id}_${alert.horse_id}`,
                    timestamp: new Date(alert.created_at).getTime()
                };

                // Here you would typically send to actual push notification service
                // For now, we'll simulate sending and mark as sent
                
                console.log('Notification prepared:', {
                    alert_id: alert.id,
                    type: alert.alert_type,
                    confidence: alert.confidence_score,
                    title: notificationPayload.title
                });

                // Mark alert as sent
                alertIds.push(alert.id);
                processedCount++;
                
            } catch (error) {
                console.error(`Error processing alert ${alert.id}:`, error.message);
            }
        }

        // Batch update alerts as sent
        if (alertIds.length > 0) {
            const updateResponse = await fetch(
                `${supabaseUrl}/rest/v1/ai_insider_alerts?id=in.(${alertIds.join(',')})`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ is_sent: true })
                }
            );

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text();
                console.error('Failed to mark alerts as sent:', errorText);
            } else {
                console.log(`Marked ${alertIds.length} alerts as sent`);
            }
        }

        const result = {
            data: {
                message: 'Push notifications processing completed',
                processed: processedCount,
                total_alerts: alerts.length,
                timestamp: new Date().toISOString()
            }
        };

        console.log('Notification processing completed:', result.data);

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Push notifications error:', error);

        const errorResponse = {
            error: {
                code: 'PUSH_NOTIFICATIONS_FAILED',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// Helper function to get notification title based on alert type
function getNotificationTitle(alertType: string): string {
    switch (alertType) {
        case 'course_distance_specialist':
            return 'Course & Distance Specialist Alert';
        case 'trainer_intent':
            return 'Trainer Intent Signal';
        case 'market_movement':
            return 'Significant Market Movement';
        default:
            return 'Racing Insider Alert';
    }
}