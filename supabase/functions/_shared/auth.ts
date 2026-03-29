export function getSupabaseConfig() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Missing Supabase config')
  return { url, key }
}

export function getRestHeaders(key: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${key}`,
    'apikey': key,
    'Content-Type': 'application/json',
  }
}

export async function requireUserAuth(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ userId: string }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) throw new Error('No authorization header provided')

  const token = authHeader.replace('Bearer ', '')
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': serviceRoleKey,
    },
  })
  if (!res.ok) throw new Error('Invalid authentication')

  const user = await res.json()
  return { userId: user.id }
}

export function requireCronSecret(req: Request): void {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return
  const provided = req.headers.get('x-cron-secret') || ''
  if (provided !== secret) throw new Error('Unauthorized')
}
