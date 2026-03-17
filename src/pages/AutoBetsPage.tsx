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
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { getUKTime } from '@/lib/dateUtils'
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

interface TopPick {
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
  best_speed: number
  avg_fp: number
  trainer_course_wr: number
  trainer_21d_wr: number
  jockey_21d_wr: number
  jockey_dist_wr: number
  finishing_position: number | null
  edge: number
  implied_prob: number
  odds_movement: 'steaming' | 'drifting' | 'stable' | null
  odds_movement_pct: number | null
  model_agreement: number
}

const MIN_EDGE = 0.05
const MAX_ODDS = 12.0
const MIN_ENSEMBLE_PROBA = 0.15
const MIN_MODEL_AGREEMENT = 2

export function AutoBetsPage() {
  const { user } = useAuth()
  const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { bankroll, needsSetup, addFunds, isAddingFunds } = useBankroll()

  const { data: entriesData, isLoading: loadingEntries } = useQuery({
    queryKey: ['benter-top-picks', todayUK],
    queryFn: async () => {
      const { data: races, error: racesErr } = await supabase
        .from('races')
        .select('race_id, off_time, course_name, type, surface')
        .eq('date', todayUK)
      if (racesErr) throw racesErr
      if (!races?.length) return { entries: [], raceMap: {} as Record<string, any> }

      const raceMap: Record<string, any> = {}
      for (const r of races) raceMap[r.race_id] = r

      const raceIds = races.map(r => r.race_id)
      let allEntries: any[] = []
      let allRunners: any[] = []
      const batchSize = 50
      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries } = await supabase
          .from('race_entries')
          .select([
            'race_id', 'horse_id', 'horse_name', 'current_odds', 'opening_odds',
            'silk_url', 'number', 'jockey_name', 'trainer_name',
            'ensemble_proba', 'benter_proba', 'rf_proba', 'xgboost_proba',
            'rpr', 'ts', 'ofr', 'comment',
            'best_speed_figure_at_distance', 'best_speed_figure_at_track',
            'best_speed_figure_on_course_going_distance',
            'avg_finishing_position',
            'trainer_win_percentage_at_course', 'trainer_21_days_win_percentage',
            'jockey_21_days_win_percentage', 'jockey_win_percentage_at_distance',
          ].join(','))
          .in('race_id', batch)
        if (entries) allEntries = allEntries.concat(entries)

        const { data: runners } = await supabase
          .from('race_runners')
          .select('race_id, horse, position')
          .in('race_id', batch)
          .not('position', 'is', null)
          .gt('position', 0)
        if (runners) allRunners = allRunners.concat(runners)
      }

      const resultsByRace: Record<string, Record<string, number>> = {}
      for (const r of allRunners) {
        if (!resultsByRace[r.race_id]) resultsByRace[r.race_id] = {}
        const bare = (r.horse || '').replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
        resultsByRace[r.race_id][bare] = Number(r.position)
      }

      return { entries: allEntries, raceMap, resultsByRace }
    },
    staleTime: 30_000,
  })

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

  const { picks, settledPicks } = useMemo(() => {
    if (!entriesData?.entries?.length) return { picks: [] as TopPick[], settledPicks: [] as TopPick[] }
    const { entries, raceMap, resultsByRace } = entriesData

    const ukTime = getUKTime()
    const [curH, curM] = ukTime.split(':').map(Number)
    const curMinutes = curH * 60 + curM

    const byRace = new Map<string, any[]>()
    for (const e of entries) {
      if (!byRace.has(e.race_id)) byRace.set(e.race_id, [])
      byRace.get(e.race_id)!.push(e)
    }

    const upcoming: TopPick[] = []
    const settled: TopPick[] = []

    for (const [raceId, raceEntries] of byRace) {
      const race = raceMap[raceId]
      if (!race) continue

      let bestPick: TopPick | null = null

      for (const e of raceEntries) {
        const odds = Number(e.current_odds) || 0
        const ensProba = Number(e.ensemble_proba) || 0
        if (odds <= 1 || ensProba <= 0) continue
        if (odds > MAX_ODDS) continue
        if (ensProba < MIN_ENSEMBLE_PROBA) continue

        const impliedProb = 1 / odds
        const edge = ensProba - impliedProb

        const bestSpeed = Math.max(
          Number(e.best_speed_figure_on_course_going_distance) || 0,
          Number(e.best_speed_figure_at_distance) || 0,
          Number(e.best_speed_figure_at_track) || 0,
        )

        const openOdds = Number(e.opening_odds) || 0
        let oddsMovement: 'steaming' | 'drifting' | 'stable' | null = null
        let oddsMovementPct: number | null = null
        if (openOdds > 0 && odds > 0) {
          const pctChange = ((odds - openOdds) / openOdds) * 100
          oddsMovementPct = Math.abs(pctChange)
          if (odds < openOdds * 0.85) oddsMovement = 'steaming'
          else if (odds > openOdds * 1.15) oddsMovement = 'drifting'
          else oddsMovement = 'stable'
        }

        let modelAgreement = 0
        const probaFields = ['ensemble_proba', 'benter_proba', 'rf_proba', 'xgboost_proba'] as const
        for (const field of probaFields) {
          const myVal = Number(e[field]) || 0
          if (myVal <= 0) continue
          const isTop = raceEntries.every((other: any) => (Number(other[field]) || 0) <= myVal)
          if (isTop) modelAgreement++
        }

        const pick: TopPick = {
          race_id: raceId,
          horse_id: e.horse_id,
          horse_name: e.horse_name || '',
          course: race.course_name || '',
          off_time: race.off_time || '',
          race_type: race.type || '',
          current_odds: odds,
          opening_odds: openOdds,
          silk_url: e.silk_url,
          number: e.number,
          jockey: e.jockey_name || '',
          trainer: e.trainer_name || '',
          ensemble_proba: ensProba,
          benter_proba: Number(e.benter_proba) || 0,
          rf_proba: Number(e.rf_proba) || 0,
          xgboost_proba: Number(e.xgboost_proba) || 0,
          rpr: Number(e.rpr) || 0,
          ts: Number(e.ts) || 0,
          ofr: Number(e.ofr) || 0,
          comment: e.comment || '',
          best_speed: bestSpeed,
          avg_fp: Number(e.avg_finishing_position) || 0,
          trainer_course_wr: Number(e.trainer_win_percentage_at_course) || 0,
          trainer_21d_wr: Number(e.trainer_21_days_win_percentage) || 0,
          jockey_21d_wr: Number(e.jockey_21_days_win_percentage) || 0,
          jockey_dist_wr: Number(e.jockey_win_percentage_at_distance) || 0,
          finishing_position: null,
          edge,
          implied_prob: impliedProb,
          odds_movement: oddsMovement,
          odds_movement_pct: oddsMovementPct,
          model_agreement: modelAgreement,
        }

        if (edge >= MIN_EDGE && modelAgreement >= MIN_MODEL_AGREEMENT) {
          if (!bestPick || edge > bestPick.edge) {
            bestPick = pick
          }
        }
      }

      if (bestPick) {
        const kelly = computeKelly(bestPick, bankroll)
        if (!kelly) continue

        const offTime = bestPick.off_time || ''
        const [rH, rM] = (offTime.substring(0, 5)).split(':').map(Number)
        const raceMinutes = (rH || 0) * 60 + (rM || 0)
        const hasResults = !!resultsByRace[bestPick.race_id]
        const raceFinished = raceMinutes > 0 && (curMinutes - raceMinutes) > 10

        if (hasResults && raceFinished) {
          const racePositions = resultsByRace[bestPick.race_id]
          const bareName = bestPick.horse_name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
          let pos = racePositions[bareName]
          if (pos === undefined) {
            for (const [name, p] of Object.entries(racePositions)) {
              if (name.startsWith(bareName) || bareName.startsWith(name)) { pos = p; break }
            }
          }
          bestPick.finishing_position = pos ?? null
          settled.push(bestPick)
        } else if (!raceFinished) {
          upcoming.push(bestPick)
        }
      }
    }

    upcoming.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))
    settled.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))
    return { picks: upcoming, settledPicks: settled }
  }, [entriesData, bankroll])

  const betsByHorse = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of userBetsData ?? []) {
      map.set(`${b.race_id}:${b.horse_id}`, b)
    }
    return map
  }, [userBetsData])

  const isLoading = loadingEntries

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
            Benter model edge picks — one per race, only genuine value
          </p>
        </div>

        {/* How it works banner */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-purple-300">How Top Picks Work</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            The <span className="text-purple-300 font-medium">Benter model</span> calculates each horse's true win probability
            and compares it to the market odds. Only horses where{' '}
            <span className="text-green-400 font-medium">at least 2 models agree</span>, the edge exceeds 5%,
            odds are under 12/1, and Benter probability is at least 15% are shown.
            One pick per race. Kelly Criterion sizes the optimal stake.
          </p>
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
              <span className="text-gray-400">Analysing Benter model edges...</span>
            </div>
          </div>
        )}

        {/* No picks */}
        {!isLoading && picks.length === 0 && settledPicks.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No edge picks today</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              The Benter model hasn't found any horses with a genuine edge over the market. Check back closer to race time.
            </p>
          </div>
        )}

        {/* Upcoming */}
        {!isLoading && picks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Upcoming</h2>
              <span className="text-xs text-gray-500">
                {picks.length} {picks.length === 1 ? 'pick' : 'picks'} — one per race
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {picks.map(pick => (
                <PickCard
                  key={`${pick.race_id}:${pick.horse_id}`}
                  pick={pick}
                  bet={betsByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                  userBankroll={bankroll}
                  needsSetup={needsSetup}
                />
              ))}
            </div>
          </div>
        )}

        {/* Settled Results */}
        {!isLoading && settledPicks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Results</h2>
              <span className="text-xs text-gray-500">{settledPicks.length} settled</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {settledPicks.map(pick => (
                <PickCard
                  key={`${pick.race_id}:${pick.horse_id}`}
                  pick={pick}
                  bet={betsByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                  userBankroll={bankroll}
                  needsSetup={needsSetup}
                  settled
                />
              ))}
            </div>
          </div>
        )}

        {/* Performance link */}
        {(picks.length > 0 || settledPicks.length > 0) && (
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

// ─── Kelly Criterion — uses Benter ensemble_proba ────────────────────────

function computeKelly(pick: TopPick, userBankroll: number) {
  const { ensemble_proba, current_odds: odds } = pick
  if (odds <= 1 || userBankroll <= 0 || ensemble_proba <= 0) return null
  const implied = 1 / odds
  const edge = ensemble_proba - implied
  if (edge <= 0.01) return null
  const kelly = edge / (odds - 1)
  const fraction = Math.min(kelly / 4, 0.03)
  const stake = Math.round(userBankroll * fraction * 100) / 100
  if (stake < 1) return null
  return { stake, fraction, edge }
}

// ─── Edge Gauge ─────────────────────────────────────────────────────────

function EdgeGauge({ edge, impliedProb, benterProba }: { edge: number; impliedProb: number; benterProba: number }) {
  const edgePct = (edge * 100).toFixed(1)
  const radius = 40
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const normScore = Math.min(edge / 0.30, 1) * 100
  const progress = (normScore / 100) * circumference
  const color = edge >= 0.15 ? '#22c55e' : edge >= 0.08 ? '#eab308' : '#f97316'

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
        <span className="text-xl font-bold text-white">+{edgePct}%</span>
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Edge</span>
      </div>
    </div>
  )
}

// ─── Model Agreement Indicator ──────────────────────────────────────────

function ModelAgreement({ count }: { count: number }) {
  const dots = [
    { label: 'Benter', active: count >= 1 },
    { label: 'LGBM', active: count >= 2 },
    { label: 'RF', active: count >= 3 },
    { label: 'XGB', active: count >= 4 },
  ]
  return (
    <div className="flex items-center gap-1">
      {dots.map((d, i) => (
        <div key={i} className={`w-2 h-2 rounded-full ${d.active ? 'bg-green-400' : 'bg-gray-700'}`}
          title={`${d.label}: ${d.active ? 'Top pick' : 'Not top pick'}`} />
      ))}
      <span className="text-[10px] text-gray-500 ml-1">{count}/4 models agree</span>
    </div>
  )
}

// ─── Pick Card ──────────────────────────────────────────────────────────

function PickCard({ pick, bet, userBankroll, needsSetup, settled }: {
  pick: TopPick
  bet: any | null
  userBankroll: number
  needsSetup: boolean
  settled?: boolean
}) {
  const fp = pick.finishing_position
  const isSettled = fp != null && fp > 0
  const isWinner = fp === 1
  const hasBet = !!bet

  const kellyInfo = useMemo(() => computeKelly(pick, userBankroll), [pick, userBankroll])

  const borderColor = isSettled && isWinner ? 'border-green-500/40' : isSettled ? 'border-gray-700/50' : 'border-purple-500/30'

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm border ${borderColor} rounded-2xl relative overflow-hidden ${isSettled && !isWinner ? 'opacity-75' : ''}`}>
      {/* Edge header */}
      <div className={`px-4 py-3 border-b ${isSettled && isWinner ? 'bg-gradient-to-r from-green-500/15 via-emerald-500/10 to-transparent border-green-500/20' : 'bg-gradient-to-r from-purple-500/15 via-blue-500/10 to-transparent border-purple-500/20'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Target className={`w-4 h-4 ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`}>
              Benter Edge: +{(pick.edge * 100).toFixed(1)}%
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
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span>Benter: {(pick.ensemble_proba * 100).toFixed(1)}%</span>
          <span>Market: {(pick.implied_prob * 100).toFixed(1)}%</span>
          <ModelAgreement count={pick.model_agreement} />
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Race context */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-300">{pick.course}</span>
          <span>·</span>
          <span>{pick.off_time?.substring(0, 5)}</span>
          <span>·</span>
          <span className="uppercase">{pick.race_type}</span>
        </div>

        <div className="flex gap-4">
          {/* Left: Edge Gauge */}
          <EdgeGauge edge={pick.edge} impliedProb={pick.implied_prob} benterProba={pick.ensemble_proba} />

          {/* Right: Horse info */}
          <div className="flex-1 min-w-0">
            <HorseNameWithSilk
              horseName={pick.horse_name}
              silkUrl={pick.silk_url || undefined}
              className="text-white font-bold text-base"
            />

            <div className="text-xs text-gray-400 mt-1 space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <span>J: {pick.jockey}</span>
                {pick.jockey_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({pick.jockey_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span>T: {pick.trainer}</span>
                {pick.trainer_course_wr > 0 && (
                  <span className="text-[10px] text-purple-400">({pick.trainer_course_wr.toFixed(0)}% at course)</span>
                )}
                {pick.trainer_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({pick.trainer_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
            </div>

            {/* Odds + Market movement */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-sm font-bold bg-gray-800 px-2 py-0.5 rounded ${
                pick.odds_movement === 'steaming' ? 'text-green-400' :
                pick.odds_movement === 'drifting' ? 'text-red-400' : 'text-white'
              }`}>
                {formatOdds(String(pick.current_odds))}
              </span>
              <MarketMovementBadge movement={pick.odds_movement} pct={pick.odds_movement_pct} size="md" />
              {kellyInfo && (
                <span className="text-xs text-yellow-400 font-medium flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  Kelly: £{kellyInfo.stake.toFixed(2)}
                </span>
              )}
            </div>

            {/* Ratings badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {pick.rpr > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  RPR {Math.round(pick.rpr)}
                </span>
              )}
              {pick.ts > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  TS {Math.round(pick.ts)}
                </span>
              )}
              {pick.best_speed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  SPD {Math.round(pick.best_speed)}
                </span>
              )}
              {pick.avg_fp > 0 && pick.avg_fp <= 4 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  Avg FP {Math.round(pick.avg_fp)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Model probabilities breakdown */}
        <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5">
          <ProbBar label="Benter (main)" value={pick.ensemble_proba} color="text-purple-400" icon={Brain} />
          <ProbBar label="LightGBM" value={pick.benter_proba} color="text-orange-400" icon={Activity} />
          <ProbBar label="Random Forest" value={pick.rf_proba} color="text-green-400" icon={TrendingUp} />
          <ProbBar label="XGBoost" value={pick.xgboost_proba} color="text-blue-400" icon={Target} />
        </div>

        {/* Expert comment */}
        {pick.comment && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-300 leading-relaxed italic">{pick.comment}</p>
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-end">
          {isSettled && bet ? (
            <div className="text-right">
              <div className={`font-bold text-sm ${Number(bet.potential_return) - Number(bet.bet_amount) >= 0 && bet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                {bet.status === 'won' ? '+' : '-'}£{bet.status === 'won' ? (Number(bet.potential_return) - Number(bet.bet_amount)).toFixed(2) : Number(bet.bet_amount).toFixed(2)}
              </div>
            </div>
          ) : isSettled ? (
            <span className="text-[10px] text-gray-500">SP: {formatOdds(String(pick.current_odds))}</span>
          ) : hasBet ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
              <CheckCircle className="w-4 h-4" />
              Bet Placed
            </span>
          ) : !needsSetup ? (
            <PlaceBetButton
              horseName={pick.horse_name}
              horseId={pick.horse_id}
              raceId={pick.race_id}
              raceContext={{ race_id: pick.race_id, course_name: pick.course, off_time: pick.off_time }}
              odds={pick.current_odds}
              jockeyName={pick.jockey}
              trainerName={pick.trainer}
              size="small"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Probability Bar ────────────────────────────────────────────────────

function ProbBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const pct = Math.round(value * 100)
  const barColor = value >= 0.3 ? 'bg-green-500' : value >= 0.15 ? 'bg-amber-500' : value > 0 ? 'bg-gray-500' : 'bg-gray-800'
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
      <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }} />
      </div>
      <span className="text-[11px] text-gray-300 w-8 text-right font-mono">{pct > 0 ? `${pct}%` : '—'}</span>
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
