import { supabase } from './supabase'

const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables. Check your .env file.')
  }

  return { url, anonKey }
}

export const fetchFromSupabaseFunction = async (functionName: string, options: RequestInit = {}) => {
  const { url, anonKey } = getSupabaseConfig()

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? anonKey

  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`)
  }
  
  return response
}
