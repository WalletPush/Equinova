export interface UserBet {
  id: number
  user_id: string
  race_id: string
  race_date: string
  course: string
  off_time: string
  horse_name: string
  horse_id: string
  trainer_name: string
  jockey_name: string
  current_odds: string
  bet_amount: number
  bet_type: string
  status: 'pending' | 'won' | 'lost'
  potential_return: number
  created_at: string
  updated_at: string
  trust_tier?: string | null
  trust_score?: number | null
  edge_pct?: number | null
  ensemble_proba?: number | null
  signal_combo_key?: string | null
}

export interface DaySummary {
  date: string
  bets: UserBet[]
  wins: number
  losses: number
  pending: number
  dayPL: number
  daySettledStaked: number
  runningPL: number
  runningSettledStaked: number
  runningBettingROI: number
}

export type PeriodFilter = '7d' | '14d' | '30d' | '90d' | 'lifetime'
export type ActiveTab = 'overview' | 'monthly' | 'trust'

export interface TotalStats {
  totalBets: number
  settledCount: number
  totalWins: number
  totalLosses: number
  totalPending: number
  settledPL: number
  pendingExposure: number
  totalSettledStaked: number
  bankrollReturn: number
  bettingROI: number
  startingBankroll: number
  winRate: number
  winningDays: number
  losingDays: number
  totalDays: number
  maxDrawdown: number
  maxDrawdownPct: number
  profitFactor: number
  expectancy: number
  longestWinStreak: number
  longestLoseStreak: number
  bestDay: DaySummary | null
  worstDay: DaySummary | null
  avgStakePct: number
}

export interface SystemBenchmark {
  cumulativeByDate: Record<string, number>
  totalPicks: number
  wins: number
  winRate: number
  roi: number
  profit: number
}

export interface Insight {
  text: string
  color: string
}

export interface MonthSummary {
  month: string
  label: string
  totalBets: number
  settled: number
  pending: number
  wins: number
  losses: number
  settledStaked: number
  pl: number
  roi: number
  winRate: number
}

export interface TrustTierSummary {
  key: string
  bgClass: string
  textClass: string
  barColor: string
  totalBets: number
  wins: number
  losses: number
  settledStaked: number
  pl: number
  roi: number
  winRate: number
  avgStake: number
  avgEdge: number
}

export interface ChartDataPoint {
  label: string
  pl: number
  bankroll: number
  systemPL: number | null
}

export interface MaxDrawdownPoint {
  idx: number
  label: string
  pl: number
  dd: number
}
