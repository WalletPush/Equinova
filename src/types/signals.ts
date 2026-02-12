/* ─── Shared signal types used across TodaysRacesPage, HorseDetailModal, etc. ── */

export interface SmartSignal {
  horse_name: string
  horse_id: string
  race_id: string
  course_name: string
  off_time: string
  current_odds: string
  initial_odds: string
  movement_pct: number
  is_ml_top_pick: boolean
  ml_models_agreeing: string[]
  ml_top_probability: number
  is_single_trainer_entry: boolean
  trainer_name: string
  jockey_name: string
  signal_strength: 'strong' | 'medium'
  signal_types?: string[]
  is_top_rpr?: boolean
  is_trainer_in_form?: boolean
  silk_url: string
  number: number | null
  change_count: number
  last_updated: string
  historical_pattern?: {
    signal_type: string
    historical_win_rate: number
    historical_top3_rate: number
    occurrences: number
    label: string
  } | null
}

export interface PatternAlert {
  horse_name: string
  horse_id: string
  race_id: string
  course_name: string
  off_time: string
  race_class: string
  distance: string
  field_size: number
  current_odds: string
  rpr: number
  ts: number
  ensemble_proba: number
  trainer_name: string
  jockey_name: string
  silk_url: string
  number: number | null
  form: string
  matched_patterns: {
    signal_type: string
    label: string
    roi_pct: number
    win_rate: number
    occurrences: number
  }[]
  best_pattern: {
    signal_type: string
    label: string
    roi_pct: number
    win_rate: number
    occurrences: number
  }
  signals: string[]
  reasons: string[]
  insight: string
}
