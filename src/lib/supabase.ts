import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  },
  global: {
    headers: {
      'X-Client-Info': 'equinova-app'
    }
  }
})

// Helper function to call edge functions with proper auth
export async function callSupabaseFunction(functionName: string, payload: any) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError) {
    throw new Error('Authentication error: ' + sessionError.message)
  }
  
  if (!session?.access_token) {
    throw new Error('Please log in to perform this action')
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload,
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  })
  
  if (error) {
    console.error(`Supabase function ${functionName} error:`, error)
    throw new Error(error.message || `Failed to call ${functionName}`)
  }
  
  // Some edge functions return a wrapper: { success: true, data: {...} }
  // while others return the payload directly. Only throw if the function
  // explicitly returned success === false (either at top-level or in the inner data).
  const topLevelFailed = data && data.success === false
  const innerFailed = data && data.data && data.data.success === false
  if (topLevelFailed || innerFailed) {
    const errInfo = data?.error || data?.data?.error || data
    console.error(`API response error for ${functionName}:`, errInfo)
    throw new Error(typeof errInfo === 'string' ? errInfo : JSON.stringify(errInfo))
  }

  return data
}

// Types for our racing data
export interface RaceEntry {
  id: number
  race_id: string
  horse_id: string
  horse_name: string
  trainer_id: string
  trainer_name: string
  jockey_id: string
  jockey_name: string
  owner_id: string
  owner_name: string
  age: number
  sex: string
  lbs: number
  ofr: number
  rpr: number
  ts: number
  current_odds: number
  comment: string
  spotlight: string
  quotes: string
  number: number
  draw: number
  silk_url: string
  form: string
  last_run: number
  past_results_flags: string
  dist_y: number
  mean_speed_figure: number
  last_speed_figure: number
  best_speed_figure_at_distance: number
  best_speed_figure_at_track: number
  avg_finishing_position: number
  avg_ovr_btn: number
  avg_finishing_position_going: number
  avg_ovr_button_on_going: number
  best_speed_figure_on_course_going_distance: number
  last_speed_figure_on_going_distance: number
  jockey_win_percentage_at_distance: number
  trainer_win_percentage_at_distance: number
  horse_ae_at_distance: number
  horse_win_percentage_at_distance: number
  trainer_21_days_win_percentage: number
  jockey_21_days_win_percentage: number
  trainer_win_percentage_at_course: number
  trainer_avg_ovr_btn_at_course: number
  trainer_avg_finishing_position_at_course: number
  benter_proba: number
  ensemble_proba: number
  predicted_winner: number
  mlp_proba: number
  rf_proba: number
  xgboost_proba: number
  finishing_position?: number
  result_updated_at?: string
  created_at: string
  // Live market data (overlaid by race-data from horse_market_movement)
  opening_odds?: number
  odds_movement?: 'steaming' | 'drifting' | 'stable' | null
  odds_movement_pct?: number | null
  market_last_updated?: string | null
}

export interface Race {
  id: number
  race_id: string
  course_id: string
  course_name: string
  date: string
  off_time: string
  distance: string
  race_class: string
  type: string
  age_band: string
  prize: string
  field_size: number
  going: string
  surface: string
  created_at: string
  entries?: RaceEntry[]
  topEntries?: RaceEntry[]
  totalEntries?: number
  hasResults?: boolean
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'user' | 'admin'
  openai_api_key: string
  created_at: string
  updated_at: string
}