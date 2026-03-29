const ALLOWED_ORIGINS = [
  'https://equinova.vercel.app',
  'https://equinova-git-main-walletpush.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') ?? ''
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.vercel.app')

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleCorsPreFlight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: getCorsHeaders(req) })
  }
  return null
}
