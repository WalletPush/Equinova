import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { PlaceBetButton } from '@/components/PlaceBetButton'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import { MarketMovementBadge } from '@/components/MarketMovement'
import { useDynamicSignals, type DynamicMatch } from '@/hooks/useDynamicSignals'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import {
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Wallet,
  ChevronRight,
  Brain,
  Sparkles,
  Gauge,
  MessageSquare,
  Activity,
} from 'lucide-react'

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  proven:   { bg: 'bg-green-500/20 border-green-500/40', text: 'text-green-400' },
  strong:   { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-400' },
  emerging: { bg: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-400' },
}

const SIGNAL_LABELS: Record<string, string> = {
  top_rpr: 'Top RPR', top_ts: 'Top TS', top_ofr: 'Top OFR', top_speed_fig: 'Top Speed',
  ratings_consensus: 'Ratings Consensus', ml_top_pick: 'ML Pick', consensus_2plus: '2+ Models',
  consensus_3plus: '3+ Models', consensus_4plus: '4+ Models', value_1_05: 'Value 1.05+',
  value_1_10: 'Value 1.10+', value_1_15: 'Value 1.15+', steaming: 'Steaming',
  drifting: 'Drifting', cd_winner: 'C&D Winner', course_specialist: 'Course Specialist',
  distance_specialist: 'Distance Specialist', improving_form: 'Improving', trainer_21d_wr10: 'Trainer Hot',
  trainer_21d_wr15: 'Trainer 15%+', trainer_21d_wr20: 'Trainer 20%+', trainer_course_wr15: 'Trainer@Course',
  jockey_21d_wr10: 'Jockey Hot', jockey_21d_wr15: 'Jockey 15%+', jockey_dist_wr15: 'Jockey@Dist',
  speed_standout_5: 'Speed +5%', speed_standout_10: 'Speed +10%', low_avg_fp: 'Low Avg FP',
  odds_evs_to_3: 'Short Price', odds_3_to_6: 'Mid Price', odds_6_to_10: 'Each-Way', odds_10_plus: 'Big Price',
}

export function AutoBetsPage() {
  const { user } = useAuth()
  const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { matches: dynamicMatches, meta, isLoading: loadingSignals } = useDynamicSignals()
  const { bankroll, needsSetup, addFunds, isAddingFunds } = useBankroll()

  const { data: userBetsData } = useQuery({
    queryKey: ['user-bets-summary'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bets', { limit: 500, offset: 0 })
      return res?.data?.bets ?? []
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const userBets = useMemo(() => {
    const bets = userBetsData ?? []
    let totalPL = 0, totalStaked = 0, wins = 0, settled = 0
    for (const b of bets) {
      const amt = Number(b.bet_amount)
      totalStaked += amt
      if (b.status === 'won') { totalPL += Number(b.potential_return) - amt; wins++; settled++ }
      else if (b.status === 'lost') { totalPL -= amt; settled++ }
    }
    return {
      totalBets: bets.length, totalPL, totalStaked, wins, settled,
      roi: totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0,
      winRate: settled > 0 ? (wins / settled) * 100 : 0,
    }
  }, [userBetsData])

  // Split matches into upcoming and settled
  const { upcomingRaces, settledRaces } = useMemo(() => {
    const grouped = new Map<string, { course: string; off_time: string; race_type: string; matches: DynamicMatch[] }>()
    for (const m of dynamicMatches) {
      if (!grouped.has(m.race_id)) {
        grouped.set(m.race_id, { course: m.course, off_time: m.off_time, race_type: m.race_type, matches: [] })
      }
      grouped.get(m.race_id)!.matches.push(m)
    }

    const upcoming: [string, typeof grouped extends Map<string, infer V> ? V : never][] = []
    const settled: [string, typeof grouped extends Map<string, infer V> ? V : never][] = []

    for (const [raceId, race] of grouped) {
      const allSettled = race.matches.every(m => m.finishing_position != null && m.finishing_position > 0)
      if (allSettled) settled.push([raceId, race])
      else upcoming.push([raceId, race])
    }

    upcoming.sort(([, a], [, b]) => (a.off_time || '').localeCompare(b.off_time || ''))
    settled.sort(([, a], [, b]) => (a.off_time || '').localeCompare(b.off_time || ''))
    return { upcomingRaces: upcoming, settledRaces: settled }
  }, [dynamicMatches])

  const betsByHorse = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of userBetsData ?? []) {
      map.set(`${b.race_id}:${b.horse_id}`, b)
    }
    return map
  }, [userBetsData])

  const isLoading = loadingSignals

  return (
    <AppLayout>
      {needsSetup && <BankrollSetupModal onSetup={addFunds} isSubmitting={isAddingFunds} />}

      <div className="p-4 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Top Picks
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            AI-discovered patterns matched to today's runners
          </p>
        </div>

        {/* How it works banner */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-purple-300">How Top Picks Work</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Our system tests thousands of signal combinations against historical race data to find patterns that have been
            <span className="text-green-400 font-medium"> statistically profitable</span>. Each horse below matches at least one proven pattern.
            The <span className="text-purple-300 font-medium">confidence score</span> reflects how many patterns match and their historical strength.
            The <span className="text-yellow-400 font-medium">Kelly wager</span> is the mathematically optimal stake based on the pattern's edge.
          </p>
          {meta && (
            <p className="text-[11px] text-gray-500">
              {meta.combos_available?.toLocaleString()} patterns analysed across {meta.today_entries?.toLocaleString()} entries in {meta.today_races} races today.
            </p>
          )}
        </div>

        {/* Your bankroll summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">My Bankroll</span>
            </div>
            <div className="text-lg font-bold text-white">£{bankroll.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {(userBets?.roi ?? 0) >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-400" /> : <Target className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">My ROI</span>
            </div>
            <div className={`text-lg font-bold ${(userBets?.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(userBets?.totalStaked ?? 0) > 0 ? `${(userBets?.roi ?? 0) >= 0 ? '+' : ''}${(userBets?.roi ?? 0).toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Win Rate</span>
            </div>
            <div className="text-lg font-bold text-white">
              {(userBets?.settled ?? 0) > 0 ? `${(userBets?.winRate ?? 0).toFixed(0)}%` : '—'}
            </div>
            {(userBets?.totalBets ?? 0) > 0 && (
              <div className="text-[10px] text-gray-500">{userBets?.wins ?? 0}W / {userBets?.totalBets ?? 0} bets</div>
            )}
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {(userBets?.totalPL ?? 0) >= 0 ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">P/L</span>
            </div>
            <div className={`text-lg font-bold ${(userBets?.totalPL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(userBets?.totalStaked ?? 0) > 0
                ? `${(userBets?.totalPL ?? 0) >= 0 ? '+' : '-'}£${Math.abs(userBets?.totalPL ?? 0).toFixed(2)}`
                : '—'}
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
              <span className="text-gray-400">Scanning patterns...</span>
            </div>
          </div>
        )}

        {/* No matches */}
        {!isLoading && dynamicMatches.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No pattern matches today</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              The system will highlight picks when horses match historically profitable signal combinations
            </p>
          </div>
        )}

        {/* Upcoming / Live */}
        {!isLoading && upcomingRaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Upcoming</h2>
              <span className="text-xs text-gray-500">
                {upcomingRaces.reduce((s, [, r]) => s + r.matches.length, 0)} picks across {upcomingRaces.length} races
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcomingRaces.flatMap(([raceId, race]) =>
                race.matches.map(match => (
                  <MatchCard
                    key={`${raceId}:${match.horse_id}`}
                    match={match}
                    bet={betsByHorse.get(`${raceId}:${match.horse_id}`)}
                    userBankroll={bankroll}
                    needsSetup={needsSetup}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Settled Results */}
        {!isLoading && settledRaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Results</h2>
              <span className="text-xs text-gray-500">
                {settledRaces.reduce((s, [, r]) => s + r.matches.length, 0)} settled
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {settledRaces.flatMap(([raceId, race]) =>
                race.matches.map(match => (
                  <MatchCard
                    key={`${raceId}:${match.horse_id}`}
                    match={match}
                    bet={betsByHorse.get(`${raceId}:${match.horse_id}`)}
                    userBankroll={bankroll}
                    needsSetup={needsSetup}
                    settled
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Performance link */}
        {dynamicMatches.length > 0 && (
          <Link
            to="/performance"
            className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-xl p-4 hover:border-purple-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors" />
              <div>
                <span className="text-white font-medium text-sm">My Performance</span>
                <p className="text-gray-500 text-xs">Track your betting results</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors" />
          </Link>
        )}
      </div>
    </AppLayout>
  )
}

// ─── Race Group ──────────────────────────────────────────────────────────


// ─── Confidence Gauge (AI Insider style) ─────────────────────────────────

function ConfidenceGauge({ score }: { score: number }) {
  const radius = 40
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const color = score >= 60 ? '#22c55e' : score >= 40 ? '#eab308' : score >= 25 ? '#f97316' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center flex-shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{Math.round(score)}</span>
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Confidence</span>
      </div>
    </div>
  )
}

// ─── Signal Strength Bars ────────────────────────────────────────────────

const SIGNAL_BAR_CONFIG = [
  { key: 'ratings', label: 'Ratings', icon: Target, color: 'text-blue-400' },
  { key: 'speed', label: 'Speed', icon: Activity, color: 'text-orange-400' },
  { key: 'form', label: 'Form', icon: TrendingUp, color: 'text-green-400' },
  { key: 'connections', label: 'Connections', icon: Brain, color: 'text-purple-400' },
] as const

function SignalBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const barColor = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-gray-600'
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
      <span className="text-[11px] text-gray-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      <span className="text-[11px] text-gray-300 w-7 text-right font-mono">{value}</span>
    </div>
  )
}

// ─── Match Card (AI Insider style) ───────────────────────────────────────

function MatchCard({ match, bet, userBankroll, needsSetup, settled }: {
  match: DynamicMatch
  bet: any | null
  userBankroll: number
  needsSetup: boolean
  settled?: boolean
}) {
  const odds = match.current_odds || 0
  const fp = match.finishing_position
  const isSettled = fp != null && fp > 0
  const isWinner = fp === 1
  const hasBet = !!bet

  const confidence = useMemo(() => {
    const combos = match.matching_combos
    if (!combos.length || odds <= 1) return 0
    const sigs = new Set(match.active_signals)

    // Signal dimension score: based on the horse's actual data quality
    let dimScore = 0
    if (sigs.has('top_rpr') || sigs.has('top_ts') || sigs.has('top_ofr')) dimScore += 20
    if (sigs.has('top_speed_fig') || sigs.has('speed_standout_10')) dimScore += 15
    else if (sigs.has('speed_standout_5')) dimScore += 8
    if (sigs.has('cd_winner') || sigs.has('course_specialist')) dimScore += 15
    else if (sigs.has('distance_specialist')) dimScore += 8
    if (sigs.has('trainer_21d_wr15') || sigs.has('trainer_21d_wr20')) dimScore += 10
    else if (sigs.has('trainer_21d_wr10')) dimScore += 5
    if (sigs.has('jockey_21d_wr15')) dimScore += 8
    if (sigs.has('improving_form')) dimScore += 8
    if (sigs.has('value_1_15')) dimScore += 8
    else if (sigs.has('value_1_10')) dimScore += 5
    else if (sigs.has('value_1_05')) dimScore += 3

    // Pattern count bonus (diminishing returns)
    const patternBonus = Math.min(Math.sqrt(combos.length) * 4, 12)

    // Pattern quality: proven patterns worth more than emerging
    const provenCount = combos.filter(c => c.status === 'proven').length
    const strongCount = combos.filter(c => c.status === 'strong').length
    const qualityBonus = Math.min(provenCount * 3 + strongCount * 1.5, 10)

    // Odds penalty: longshots are inherently less likely to win
    const oddsPenalty = Math.min(Math.log2(Math.max(odds, 2)) * 6, 45)

    const raw = dimScore + patternBonus + qualityBonus - oddsPenalty
    return Math.max(5, Math.min(Math.round(raw), 90))
  }, [match.matching_combos, odds, match.active_signals])

  const kellyInfo = useMemo(() => {
    if (!match.matching_combos.length || odds <= 1 || userBankroll <= 0) return null
    const implied = 1 / odds
    // Conservative estimate: assume pattern gives 1.5x edge over market
    const estimatedWR = Math.min(implied * 1.5, 0.4)
    const edge = estimatedWR - implied
    if (edge <= 0) return null
    const kelly = edge / (odds - 1)
    // Quarter-Kelly for safety, max 3% of bankroll
    const fraction = Math.min(kelly / 4, 0.03)
    const stake = Math.max(Math.round(userBankroll * fraction * 100) / 100, 1)
    return { stake, fraction }
  }, [match.matching_combos, odds, userBankroll])

  const signalStrengths = useMemo(() => {
    const sigs = new Set(match.active_signals)
    const ratingsScore = (sigs.has('top_rpr') ? 35 : 0) + (sigs.has('top_ts') ? 35 : 0) + (sigs.has('top_ofr') ? 20 : 0) + (sigs.has('ratings_consensus') ? 10 : 0)
    const speedScore = (sigs.has('top_speed_fig') ? 40 : 0) + (sigs.has('speed_standout_10') ? 30 : sigs.has('speed_standout_5') ? 15 : 0) + (sigs.has('improving_form') ? 20 : 0) + (sigs.has('low_avg_fp') ? 10 : 0)
    const formScore = (sigs.has('cd_winner') ? 30 : 0) + (sigs.has('course_specialist') ? 25 : 0) + (sigs.has('distance_specialist') ? 20 : 0) +
      (sigs.has('value_1_15') ? 25 : sigs.has('value_1_10') ? 15 : sigs.has('value_1_05') ? 8 : 0)
    const connectionsScore = (sigs.has('trainer_21d_wr20') ? 30 : sigs.has('trainer_21d_wr15') ? 20 : sigs.has('trainer_21d_wr10') ? 10 : 0) +
      (sigs.has('trainer_course_wr15') ? 20 : 0) + (sigs.has('jockey_21d_wr15') ? 25 : sigs.has('jockey_21d_wr10') ? 12 : 0) + (sigs.has('jockey_dist_wr15') ? 25 : 0)
    return {
      ratings: Math.min(ratingsScore, 100),
      speed: Math.min(speedScore, 100),
      form: Math.min(formScore, 100),
      connections: Math.min(connectionsScore, 100),
    }
  }, [match.active_signals])

  const borderColor = isSettled && isWinner ? 'border-green-500/40' : isSettled ? 'border-gray-700/50' : 'border-purple-500/30'

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm border ${borderColor} rounded-2xl relative overflow-hidden ${isSettled && !isWinner ? 'opacity-75' : ''}`}>
      {/* Pattern signals header */}
      <div className={`px-4 py-3 border-b ${isSettled && isWinner ? 'bg-gradient-to-r from-green-500/15 via-emerald-500/10 to-transparent border-green-500/20' : 'bg-gradient-to-r from-purple-500/15 via-blue-500/10 to-transparent border-purple-500/20'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-4 h-4 ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`}>
              {match.matching_combos.length} Pattern{match.matching_combos.length !== 1 ? 's' : ''} Matched
            </span>
          </div>
          {isSettled && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
              isWinner ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
            }`}>
              {isWinner ? <><CheckCircle className="w-3 h-3" /> WON</> : fmtPos(fp)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {match.matching_combos.slice(0, 6).map((combo, i) => {
            const style = STATUS_BADGE[combo.status] || STATUS_BADGE.emerging
            return (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${style.bg} ${style.text}`}>
                <span className="truncate max-w-[180px]">{combo.combo_label}</span>
                <span className="text-[9px] opacity-60 capitalize">{combo.status}</span>
              </span>
            )
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Race context */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-300">{match.course}</span>
          <span>·</span>
          <span>{match.off_time?.substring(0, 5)}</span>
          <span>·</span>
          <span className="uppercase">{match.race_type}</span>
        </div>

        <div className="flex gap-4">
          {/* Left: Gauge */}
          <ConfidenceGauge score={confidence} />

          {/* Right: Horse info */}
          <div className="flex-1 min-w-0">
            <HorseNameWithSilk
              horseName={match.horse_name}
              silkUrl={match.silk_url || undefined}
              className="text-white font-bold text-base"
            />

            <div className="text-xs text-gray-400 mt-1 space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <span>J: {match.jockey}</span>
                {match.jockey_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({match.jockey_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span>T: {match.trainer}</span>
                {match.trainer_course_wr > 0 && (
                  <span className="text-[10px] text-purple-400">({match.trainer_course_wr.toFixed(0)}% at course)</span>
                )}
                {match.trainer_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({match.trainer_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
            </div>

            {/* Odds + Market movement */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-sm font-bold bg-gray-800 px-2 py-0.5 rounded ${
                match.odds_movement === 'steaming' ? 'text-green-400' :
                match.odds_movement === 'drifting' ? 'text-red-400' : 'text-white'
              }`}>
                {formatOdds(String(odds))}
              </span>
              <MarketMovementBadge movement={match.odds_movement} pct={match.odds_movement_pct} size="md" />
              {kellyInfo && (
                <span className="text-xs text-yellow-400 font-medium flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  Kelly: £{kellyInfo.stake.toFixed(2)}
                </span>
              )}
            </div>

            {/* Ratings badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {match.rpr > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${match.active_signals.includes('top_rpr') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  RPR {Math.round(match.rpr)}
                </span>
              )}
              {match.ts > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${match.active_signals.includes('top_ts') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  TS {Math.round(match.ts)}
                </span>
              )}
              {match.best_speed > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${match.active_signals.includes('top_speed_fig') ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  SPD {Math.round(match.best_speed)}
                </span>
              )}
              {match.avg_fp > 0 && match.avg_fp <= 4 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${match.avg_fp <= 3 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400'}`}>
                  Avg FP {Math.round(match.avg_fp)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Signal breakdown bars */}
        <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5">
          {SIGNAL_BAR_CONFIG.map(cfg => (
            <SignalBar key={cfg.key} label={cfg.label} value={signalStrengths[cfg.key]} icon={cfg.icon} color={cfg.color} />
          ))}
        </div>

        {/* Expert comment */}
        {match.comment && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-300 leading-relaxed italic">{match.comment}</p>
            </div>
          </div>
        )}

        {/* Action row: Place Bet / Bet Placed / Result */}
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {match.active_signals.slice(0, 6).map(sig => (
              <span key={sig} className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-700/60 text-gray-400 border border-gray-600/30">
                {SIGNAL_LABELS[sig] || sig}
              </span>
            ))}
            {match.active_signals.length > 6 && (
              <span className="text-[9px] text-gray-500 self-center">+{match.active_signals.length - 6}</span>
            )}
          </div>
          <div className="flex-shrink-0 ml-3">
            {isSettled && bet ? (
              <div className="text-right">
                <div className={`font-bold text-sm ${Number(bet.potential_return) - Number(bet.bet_amount) >= 0 && bet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                  {bet.status === 'won' ? '+' : '-'}£{bet.status === 'won' ? (Number(bet.potential_return) - Number(bet.bet_amount)).toFixed(2) : Number(bet.bet_amount).toFixed(2)}
                </div>
              </div>
            ) : isSettled ? (
              <span className="text-[10px] text-gray-500">SP: {formatOdds(String(odds))}</span>
            ) : hasBet ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
                <CheckCircle className="w-4 h-4" />
                Bet Placed
              </span>
            ) : !needsSetup ? (
              <PlaceBetButton
                horseName={match.horse_name}
                horseId={match.horse_id}
                raceId={match.race_id}
                raceContext={{ race_id: match.race_id, course_name: match.course, off_time: match.off_time }}
                odds={match.current_odds}
                jockeyName={match.jockey}
                trainerName={match.trainer}
                size="small"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function fmtPos(p: number | null) {
  if (!p) return ''
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}
