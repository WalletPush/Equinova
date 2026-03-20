// Push notification sender using the Web Push protocol.
// Called by DB triggers or cron when smart_money_alerts / top picks are created.
//
// Expects Supabase secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

Deno.serve(async (req) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
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
    const VAPID_PUBLIC = mustEnv('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE = mustEnv('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = mustEnv('VAPID_SUBJECT');

    const body = await req.json().catch(() => ({}));
    const notificationType: string = body.type ?? 'smart_money';

    // Payload to send — caller provides title, body, data
    const title: string = body.title ?? 'EquiNova Alert';
    const message: string = body.message ?? '';
    const data: Record<string, unknown> = body.data ?? {};
    const tag: string = body.tag ?? `equinova-${Date.now()}`;
    const requireInteraction: boolean = body.requireInteraction ?? false;

    // Fetch all subscriptions that have this type enabled
    const subsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?enabled_types=cs.{${notificationType}}&select=id,endpoint,p256dh,auth,user_id`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
      }
    );
    if (!subsRes.ok) throw new Error(`Failed to fetch subscriptions: ${await subsRes.text()}`);

    const subscriptions: Array<{
      id: number;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_id: string;
    }> = await subsRes.json();

    console.log(`Sending "${notificationType}" push to ${subscriptions.length} subscriber(s)`);

    if (subscriptions.length === 0)
      return json({ sent: 0, message: 'No subscribers for this type' });

    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { ...data, type: notificationType, url: data.url ?? '/top-picks' },
      tag,
      requireInteraction,
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });

    let sent = 0;
    let failed = 0;
    const staleIds: number[] = [];

    for (const sub of subscriptions) {
      try {
        const result = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          VAPID_PUBLIC,
          VAPID_PRIVATE,
          VAPID_SUBJECT
        );
        if (result.ok) {
          sent++;
        } else if (result.status === 404 || result.status === 410) {
          staleIds.push(sub.id);
          failed++;
        } else {
          console.error(`Push failed for sub ${sub.id}: ${result.status} ${await result.text()}`);
          failed++;
        }
      } catch (err: unknown) {
        console.error(`Push error for sub ${sub.id}:`, err);
        failed++;
      }
    }

    // Clean up stale subscriptions
    if (staleIds.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${staleIds.join(',')})`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${SUPABASE_KEY}`,
            apikey: SUPABASE_KEY,
          },
        }
      );
      console.log(`Cleaned up ${staleIds.length} stale subscription(s)`);
    }

    return json({ sent, failed, stale_removed: staleIds.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('push-notifications error:', msg);
    return json({ error: msg }, 500);
  }
});

// ── Web Push implementation using the Crypto API ─────────────────────

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  // Create JWT for VAPID
  const jwtHeader = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const jwtPayload = base64url(
    JSON.stringify({ aud: audience, exp: expiry, sub: vapidSubject })
  );
  const unsignedToken = `${jwtHeader}.${jwtPayload}`;

  const privateKeyData = base64urlDecode(vapidPrivateKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapidPrivateKey,
      x: base64urlFromRaw(base64urlDecode(vapidPublicKey).slice(1, 33)),
      y: base64urlFromRaw(base64urlDecode(vapidPublicKey).slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  );
  const signature = base64url(new Uint8Array(signatureBuffer));
  const jwt = `${unsignedToken}.${signature}`;

  // Encrypt payload using RFC 8291 (aes128gcm)
  const encrypted = await encryptPayload(
    payload,
    subscription.p256dh,
    subscription.auth
  );

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'high',
    },
    body: encrypted,
  });
}

async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<Uint8Array> {
  const clientPublicKeyBytes = base64urlDecode(p256dhKey);
  const authBytes = base64urlDecode(authSecret);

  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );

  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey)
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      serverKeys.privateKey,
      256
    )
  );

  // HKDF for auth_info
  const authInfo = concatBuffers(
    new TextEncoder().encode('WebPush: info\0'),
    clientPublicKeyBytes,
    serverPublicKeyRaw
  );

  const prkKey = await crypto.subtle.importKey(
    'raw',
    authBytes,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // IKM = HKDF(auth_secret, shared_secret, auth_info, 32)
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: sharedSecret, info: authInfo },
      prkKey,
      256
    )
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const saltKey = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // CEK
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: ikm, info: cekInfo },
      saltKey,
      128
    )
  );

  // Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: ikm, info: nonceInfo },
      saltKey,
      96
    )
  );

  // Encrypt
  const encKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const paddedPayload = concatBuffers(
    new TextEncoder().encode(payload),
    new Uint8Array([2]) // delimiter
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      encKey,
      paddedPayload
    )
  );

  // aes128gcm header: salt(16) + rs(4) + keyid_len(1) + keyid(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const keyIdLen = new Uint8Array([65]);

  return concatBuffers(salt, rs, keyIdLen, serverPublicKeyRaw, ciphertext);
}

// ── Encoding utilities ──────────────────────────────────────────────

function base64url(input: string | Uint8Array): string {
  let b64: string;
  if (typeof input === 'string') {
    b64 = btoa(input);
  } else {
    let binary = '';
    for (const byte of input) binary += String.fromCharCode(byte);
    b64 = btoa(binary);
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function base64urlFromRaw(bytes: Uint8Array): string {
  return base64url(bytes);
}

function concatBuffers(...buffers: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const arrays = buffers.map((b) => new Uint8Array(b));
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function mustEnv(k: string): string {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}
