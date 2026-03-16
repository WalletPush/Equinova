import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { PlaceBetButton } from '@/components/PlaceBetButton'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import { MarketMovementBadge } from '@/components/MarketMovement'
import { useDynamicSignals, type DynamicMatch, type DynamicCombo } from '@/hooks/useDynamicSignals'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import {
  Zap,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Wallet,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Brain,
  Sparkles,
  ShieldCheck,
  Info,
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
            <div className="space-y-4">
              {upcomingRaces.map(([raceId, race]) => (
                <RaceGroup key={raceId} raceId={raceId} race={race} betsByHorse={betsByHorse} userBankroll={bankroll} needsSetup={needsSetup} />
              ))}
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
            <div className="space-y-4">
              {settledRaces.map(([raceId, race]) => (
                <RaceGroup key={raceId} raceId={raceId} race={race} betsByHorse={betsByHorse} userBankroll={bankroll} needsSetup={needsSetup} settled />
              ))}
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

function RaceGroup({ raceId, race, betsByHorse, userBankroll, needsSetup, settled }: {
  raceId: string
  race: { course: string; off_time: string; race_type: string; matches: DynamicMatch[] }
  betsByHorse: Map<string, any>
  userBankroll: number
  needsSetup: boolean
  settled?: boolean
}) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/30 bg-gray-800/60">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs text-white font-semibold">{race.off_time?.substring(0, 5)}</span>
          <span className="text-xs text-gray-500">·</span>
          <span className="text-xs text-gray-300">{race.course}</span>
        </div>
        <span className="text-[10px] text-gray-500 uppercase">{race.race_type}</span>
      </div>
      <div className="divide-y divide-gray-700/20">
        {race.matches.map(match => (
          <MatchCard
            key={match.horse_id}
            match={match}
            bet={betsByHorse.get(`${raceId}:${match.horse_id}`)}
            userBankroll={userBankroll}
            needsSetup={needsSetup}
            settled={settled}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Confidence Donut ────────────────────────────────────────────────────

function ConfidenceDonut({ score }: { score: number }) {
  const pct = Math.min(score, 100)
  const r = 16
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : pct >= 40 ? '#f97316' : '#ef4444'

  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg width="48" height="48" className="-rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#374151" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

// ─── Match Card ──────────────────────────────────────────────────────────

function MatchCard({ match, bet, userBankroll, needsSetup, settled }: {
  match: DynamicMatch
  bet: any | null
  userBankroll: number
  needsSetup: boolean
  settled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isAutoBet = !!bet
  const odds = match.current_odds || 0
  const fp = match.finishing_position
  const isSettled = fp != null && fp > 0
  const isWinner = fp === 1

  // Confidence score: weighted average of pattern strength
  const confidence = useMemo(() => {
    const combos = match.matching_combos
    if (!combos.length) return 0
    const statusW: Record<string, number> = { proven: 1.0, strong: 0.7, emerging: 0.4 }
    let total = 0
    let weights = 0
    for (const c of combos) {
      const w = statusW[c.status] ?? 0.3
      const wrScore = Math.min(c.win_rate / 40, 1) * 40
      const roiScore = Math.min(c.roi_pct / 200, 1) * 30
      const countBonus = Math.min(combos.length / 5, 1) * 30
      total += (wrScore + roiScore + countBonus) * w
      weights += w
    }
    return weights > 0 ? Math.min(total / weights, 100) : 0
  }, [match.matching_combos])

  // Kelly wager calculation
  const kellyInfo = useMemo(() => {
    if (!match.matching_combos.length || odds <= 1 || userBankroll <= 0) return null
    const best = match.matching_combos[0]
    const patternWR = best.win_rate / 100
    const implied = 1 / odds
    const edge = patternWR - implied
    if (edge <= 0) return null
    const kelly = edge / (odds - 1)
    const fraction = Math.min(kelly / 4, 0.05)
    const stake = Math.round(userBankroll * fraction * 100) / 100
    if (stake < 1) return null
    return { stake, fraction, edge, patternWR: best.win_rate }
  }, [match.matching_combos, odds, userBankroll])

  return (
    <div className={`p-4 ${isAutoBet ? 'bg-purple-500/5' : ''} ${isSettled && isWinner ? 'bg-green-500/5' : ''} ${isSettled && !isWinner ? 'opacity-70' : ''}`}>
      {/* Top row: horse + confidence + result */}
      <div className="flex items-start gap-3">
        <ConfidenceDonut score={confidence} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <HorseNameWithSilk
              horseName={match.horse_name}
              silkUrl={match.silk_url || undefined}
              className="text-white text-sm font-semibold"
            />
            {isAutoBet && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <ShieldCheck className="w-2.5 h-2.5" />
                AUTO
              </span>
            )}
            {isSettled && (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isWinner ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
              }`}>
                {isWinner ? <CheckCircle className="w-2.5 h-2.5" /> : <span>{fmtPos(fp)}</span>}
                {isWinner ? 'WON' : fmtPos(fp)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
            {match.jockey && <span>{match.jockey}</span>}
            {match.trainer && <><span>·</span><span>{match.trainer}</span></>}
            {odds > 0 && (
              <>
                <span>·</span>
                <span className={`font-mono ${
                  match.odds_movement === 'steaming' ? 'text-green-400' :
                  match.odds_movement === 'drifting' ? 'text-red-400' :
                  'text-white'
                }`}>{formatOdds(String(odds))}</span>
              </>
            )}
            <MarketMovementBadge movement={match.odds_movement} pct={match.odds_movement_pct} />
          </div>
        </div>

        {/* Settled P/L or Place Bet */}
        <div className="flex-shrink-0 text-right">
          {isSettled && bet ? (
            <div>
              <div className={`font-bold text-sm ${Number(bet.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {Number(bet.profit) >= 0 ? '+' : '-'}£{Math.abs(Number(bet.profit)).toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-500">SP: {formatOdds(String(odds))}</div>
            </div>
          ) : isSettled ? (
            <div className="text-[10px] text-gray-500">SP: {formatOdds(String(odds))}</div>
          ) : null}
        </div>
      </div>

      {/* Kelly + Place Bet row */}
      {!isSettled && (
        <div className="flex items-center gap-3 mt-3">
          {kellyInfo && (
            <div className="flex-1 bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] text-gray-500 uppercase">Kelly Wager</span>
              </div>
              <div className="text-sm font-bold text-yellow-400 mt-0.5">
                £{kellyInfo.stake.toFixed(2)}
                <span className="text-[10px] text-gray-500 font-normal ml-1">
                  ({(kellyInfo.fraction * 100).toFixed(1)}% of bank)
                </span>
              </div>
            </div>
          )}
          {!needsSetup && (
            <div className="flex-shrink-0">
              {bet ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
                  <CheckCircle className="w-4 h-4" />
                  Bet Placed
                </span>
              ) : (
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
              )}
            </div>
          )}
        </div>
      )}

      {/* Pattern badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {match.matching_combos.slice(0, 4).map((combo, i) => {
          const style = STATUS_BADGE[combo.status] || STATUS_BADGE.emerging
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${style.bg} ${style.text}`}
              title={`${combo.total_bets} bets, ${combo.win_rate}% WR, p=${combo.p_value?.toFixed(4) ?? '—'}`}
            >
              <span className="truncate max-w-[140px]">{combo.combo_label}</span>
              <span className="opacity-60">·</span>
              <span>{combo.win_rate}%</span>
              <span className="opacity-60">·</span>
              <span>{combo.roi_pct > 0 ? '+' : ''}{combo.roi_pct}%</span>
            </span>
          )
        })}
        {match.matching_combos.length > 4 && (
          <span className="text-[10px] text-gray-500 self-center">+{match.matching_combos.length - 4} more</span>
        )}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 mt-2 text-[11px] text-gray-500 hover:text-purple-400 transition-colors"
      >
        <Info className="w-3 h-3" />
        {expanded ? 'Hide details' : 'Show details'}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Expanded metrics */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-700/30 space-y-3">
          {/* Comment */}
          {match.comment && (
            <div className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-400 italic leading-relaxed">{match.comment}</p>
            </div>
          )}

          {/* Ratings & Speed */}
          <div className="grid grid-cols-3 gap-2">
            {match.rpr > 0 && (
              <MetricBox label="RPR" value={match.rpr.toString()} highlight={match.active_signals.includes('top_rpr')} />
            )}
            {match.ts > 0 && (
              <MetricBox label="TS" value={match.ts.toString()} highlight={match.active_signals.includes('top_ts')} />
            )}
            {match.ofr > 0 && (
              <MetricBox label="OFR" value={match.ofr.toString()} highlight={match.active_signals.includes('top_ofr')} />
            )}
            {match.best_speed > 0 && (
              <MetricBox label="Best Speed" value={match.best_speed.toString()} highlight={match.active_signals.includes('top_speed_fig')} />
            )}
            {match.last_speed > 0 && (
              <MetricBox label="Last Speed" value={match.last_speed.toString()} highlight={match.last_speed > match.mean_speed} />
            )}
            {match.avg_fp > 0 && (
              <MetricBox label="Avg FP" value={match.avg_fp.toFixed(1)} highlight={match.avg_fp <= 3} />
            )}
          </div>

          {/* Connections */}
          <div className="grid grid-cols-2 gap-2">
            {match.trainer_21d_wr > 0 && (
              <MetricBox label="Trainer 21d WR" value={`${match.trainer_21d_wr.toFixed(0)}%`} highlight={match.trainer_21d_wr >= 15} />
            )}
            {match.trainer_course_wr > 0 && (
              <MetricBox label="Trainer@Course" value={`${match.trainer_course_wr.toFixed(0)}%`} highlight={match.trainer_course_wr >= 15} />
            )}
            {match.jockey_21d_wr > 0 && (
              <MetricBox label="Jockey 21d WR" value={`${match.jockey_21d_wr.toFixed(0)}%`} highlight={match.jockey_21d_wr >= 15} />
            )}
            {match.jockey_dist_wr > 0 && (
              <MetricBox label="Jockey@Distance" value={`${match.jockey_dist_wr.toFixed(0)}%`} highlight={match.jockey_dist_wr >= 15} />
            )}
          </div>

          {/* Active signals */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Activity className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase">Active Signals</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {match.active_signals.map(sig => (
                <span key={sig} className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-700/60 text-gray-400 border border-gray-600/30">
                  {SIGNAL_LABELS[sig] || sig}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`px-2.5 py-1.5 rounded-lg border ${highlight ? 'bg-purple-500/10 border-purple-500/20' : 'bg-gray-800/50 border-gray-700/30'}`}>
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-purple-300' : 'text-white'}`}>{value}</div>
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
