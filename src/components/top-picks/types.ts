export interface SmartMoneyAlert {
  id: string
  race_id: string
  horse_id: string
  horse_name: string
  course: string
  off_time: string
  date: string
  opening_odds: number
  current_odds: number
  pct_backed: number
  morning_ensemble: number
  live_ensemble: number
  morning_edge: number
  live_edge: number
  kelly_stake: number
  triggered_at: string
  notified: boolean
}

export interface TopPick {
  race_id: string
  horse_id: string
  horse_name: string
  course: string
  off_time: string
  race_type: string
  current_odds: number
  opening_odds: number
  silk_url: string | null
  number: number | null
  jockey: string
  trainer: string
  ensemble_proba: number
  benter_proba: number
  rf_proba: number
  xgboost_proba: number
  rpr: number
  ts: number
  ofr: number
  comment: string
  spotlight: string
  best_speed: number
  avg_fp: number
  trainer_course_wr: number
  trainer_21d_wr: number
  jockey_21d_wr: number
  jockey_dist_wr: number
  finishing_position: number | null
  outcome: string | null
  edge: number
  implied_prob: number
  odds_movement: 'steaming' | 'drifting' | 'stable' | null
  odds_movement_pct: number | null
}
