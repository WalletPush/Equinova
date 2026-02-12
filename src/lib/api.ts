// API client utilities
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://nzabewdpotnlttftimej.supabase.co'
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56YWJld2Rwb3RubHR0ZnRpbWVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Nzk2NzYsImV4cCI6MjA4NjA1NTY3Nn0.tdmtly1nth6-9JQZv31gmJgFS_bpuhy97IOpWY228CE'
  
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
