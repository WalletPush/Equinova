// Lightweight dispatcher that fires push notifications for specific events.
// Can be called from DB webhooks, cron jobs, or other edge functions.
//
// POST body: { event: "smart_money" | "top_picks", payload: {...} }

Deno.serve(async (req) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 200, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const SUPABASE_URL = mustEnv('SUPABASE_URL');
    const SUPABASE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');

    const cronSecret = Deno.env.get('CRON_SECRET');
    if (cronSecret) {
      const provided = req.headers.get('x-cron-secret') || '';
      if (provided !== cronSecret) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const event: string = body.event ?? 'smart_money';
    const payload = body.payload ?? {};

    let title = 'EquiNova Alert';
    let message = '';
    let notifType = 'smart_money';
    let tag = `equinova-${Date.now()}`;
    let data: Record<string, unknown> = {};
    let requireInteraction = false;

    if (event === 'smart_money') {
      notifType = 'smart_money';
      title = `Smart Money: ${payload.horse_name ?? 'Unknown'}`;
      const edge = payload.live_edge ? `+${(payload.live_edge * 100).toFixed(1)}%` : '';
      const odds = payload.current_odds ?? '';
      message = `${payload.course ?? ''} ${payload.off_time ?? ''} — Edge ${edge}, Odds ${odds}`;
      tag = `smart-money-${payload.race_id}-${payload.horse_id}`;
      data = {
        url: '/top-picks',
        race_id: payload.race_id,
        horse_id: payload.horse_id,
      };
      requireInteraction = (payload.live_edge ?? 0) >= 0.15;
    } else if (event === 'top_picks') {
      notifType = 'top_picks';
      const count = payload.count ?? 0;
      title = `${count} Top Pick${count !== 1 ? 's' : ''} Today`;
      message = payload.summary ?? 'New Benter model edge picks are available';
      tag = `top-picks-${payload.date ?? 'today'}`;
      data = { url: '/top-picks' };
    } else if (event === 'market_movement') {
      notifType = 'market_movement';
      title = `Market Move: ${payload.horse_name ?? 'Unknown'}`;
      message = `${payload.course ?? ''} — Odds ${payload.initial_odds ?? '?'} → ${payload.current_odds ?? '?'} (${payload.movement_pct ?? 0}%)`;
      tag = `market-${payload.race_id}-${payload.horse_id}`;
      data = {
        url: '/top-picks',
        race_id: payload.race_id,
        horse_id: payload.horse_id,
      };
    }

    // Call the push-notifications function
    const pushRes = await fetch(
      `${SUPABASE_URL}/functions/v1/push-notifications`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: notifType,
          title,
          message,
          data,
          tag,
          requireInteraction,
        }),
      }
    );

    const result = await pushRes.json();
    console.log(`send-push-alert [${event}]:`, result);

    return json({ success: true, event, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('send-push-alert error:', msg);
    return json({ error: msg }, 500);
  }
});

function mustEnv(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}
