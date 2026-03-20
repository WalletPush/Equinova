// API client utilities
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables. Check your .env file.')
  }

  return { url, anonKey }
}

export const createSupabaseClient = () => {
  const { url, anonKey } = getSupabaseConfig()
  return {
    url,
    headers: {
      'Authorization': `Bearer ${anonKey}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
    }
  }
}

export const fetchFromSupabaseFunction = async (functionName: string, options: RequestInit = {}) => {
  const { url, headers } = createSupabaseClient()
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  })
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`)
  }
  
  return response
}
