// API client utilities
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://zjqojacejstbqmxzstyk.supabase.co'
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqcW9qYWNlanN0YnFteHpzdHlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNjM2OTYsImV4cCI6MjA3MTkzOTY5Nn0.G8JPyYNQkH1IKiRAyluZ4fOAZjGoRZ7judlKphdkYks'
  
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
