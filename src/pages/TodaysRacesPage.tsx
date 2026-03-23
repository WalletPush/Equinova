import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ProfitableSignalBadges } from '@/components/ProfitableSignalBadges'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { supabase, callSupabaseFunction, Race } from '@/lib/supabase'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { detectProfitableSignals } from '@/lib/confluenceScore'
import { useLifetimeSignalStats } from '@/hooks/useLifetimeSignalStats'
import { useDynamicSignals } from '@/hooks/useDynamicSignals'
import { normalizeField, getNormalizedColor, getNormalizedStars, formatNormalized } from '@/lib/normalize'
import { formatOdds } from '@/lib/odds'
import { fetchFromSupabaseFunction } from '@/lib/api'
import { compareRaceTimes, raceTimeToMinutes, formatTime, isRaceCompleted } from '@/lib/dateUtils'
import { 
  Clock, 
  MapPin, 
  Trophy, 
  Users, 
  TrendingUp, 
  Star,
  Calendar,
  ChevronDown,
  Bot,
  RefreshCw,
  X,
  Zap,
  Search,
  Wallet,
  CheckCircle,
  XCircle,
  Target,
} from 'lucide-react'
import type { SmartSignal, PatternAlert } from '@/types/signals'
import { ModelBadge, MODEL_DEFS } from '@/components/ModelBadge'
import { MarketMovementBadge, buildMarketComment, getRaceMarketSummary } from '@/components/MarketMovement'
import type { RaceEntry } from '@/lib/supabase'

/**
 * For each model, find its top-picked horse from the entries.
 * Returns a map: horse_id → list of model badges that picked it.
 */
function getModelPicksByHorseId(
  entries: RaceEntry[] | undefined
): Map<string, { label: string; color: string }[]> {
  const map = new Map<string, { label: string; color: string }[]>()
  if (!entries || entries.length === 0) return map

  for (const model of MODEL_DEFS) {
    const f = model.field as keyof RaceEntry
    let bestEntry: RaceEntry | null = null
    let bestProba = 0
    for (const entry of entries) {
      const p = entry[f] as number
      if (p > bestProba) { bestProba = p; bestEntry = entry }
    }
    if (bestEntry) {
      const id = bestEntry.horse_id
      const existing = map.get(id) || []
      existing.push({ label: model.label, color: model.color })
      map.set(id, existing)
    }
  }

  return map
}

export function TodaysRacesPage() {
  // Use UK timezone for proper date detection
  const [selectedDate, setSelectedDate] = useState(() => {
    const ukDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    return ukDate // Already in YYYY-MM-DD format
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedRace, setExpandedRace] = useState<string | null>(null)
  const { openHorseDetail } = useHorseDetail()
  const lifetimeSignalStats = useLifetimeSignalStats()
  const { matchesByHorse } = useDynamicSignals()

  const { data: racesData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['races', selectedDate, 'today-races'],
    queryFn: async () => {
      console.log(`Fetching races for ${selectedDate}...`)
      const { data, error } = await supabase.functions.invoke('race-data', {
        body: { date: selectedDate }
      })
      
      if (error) {
        console.error('Error invoking race-data API:', error)
        throw error
      }
      
      if (!data.data) {
        console.error('Race data API returned no data:', data)
        throw new Error(data.error?.message || 'Race data API failed')
      }
      
      console.log(`Races for ${selectedDate} fetched successfully: ${data.data.races?.length || 0} races`)
      return data.data
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 3,
    retryDelay: 1000,
    placeholderData: keepPreviousData // Keep previous data while fetching new data
  })

  // Fetch today's race statistics for dynamic counts
  const { data: raceStatsData } = useQuery({
    queryKey: ['today-race-stats', selectedDate],
    queryFn: async () => {
      console.log('Fetching today race statistics...')
      const { data, error } = await supabase.functions.invoke('today-race-stats', {
        body: {}
      })
      
      if (error) {
        console.error('Error fetching race statistics:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('Race statistics API returned error:', data.error)
        throw new Error(data.error?.message || 'Race statistics API failed')
      }
      
      console.log('Race statistics fetched successfully:', data.data.summary_message)
      return data.data
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3,
    retryDelay: 1000,
    enabled: selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) // Only fetch for today
  })

  // Smart signals query - polls every 30 seconds
  const isToday = selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  const { data: smartSignalsData } = useQuery({
    queryKey: ['smart-signals'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('smart-signals')
      if (error) {
        console.error('Smart signals error:', error)
        return { signals: [] }
      }
      return data
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: isToday,
    retry: 1,
  })

  // Pattern alerts query - checks for profitable historical patterns
  const { data: patternAlertsData } = useQuery({
    queryKey: ['pattern-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pattern-alerts')
      if (error) {
        console.error('Pattern alerts error:', error)
        return { alerts: [] }
      }
      return data
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: isToday,
    retry: 1,
  })

  const allPatternAlerts = useMemo<PatternAlert[]>(() => {
    return patternAlertsData?.alerts ?? []
  }, [patternAlertsData])

  // Filter signals: remove past races only
  const allSmartSignals = useMemo<SmartSignal[]>(() => {
    const signals: SmartSignal[] = smartSignalsData?.signals ?? []
    if (!signals.length) return []

    // Get current UK time as minutes since midnight for proper comparison
    const ukNowStr = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/London',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    })
    const [nowH, nowM] = ukNowStr.split(':').map(Number)
    const nowMinutes = nowH * 60 + nowM

    return signals.filter((s) => {
      // Remove past races (convert stored AM times to real PM)
      if (s.off_time) {
        const raceMinutes = raceTimeToMinutes(s.off_time)
        if (raceMinutes <= nowMinutes) return false
      }
      return true
    })
  }, [smartSignalsData, selectedDate])

  // Build a set of horse_ids that have active smart signals or pattern alerts (for pulsing dot)
  const signalHorseIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of allSmartSignals) set.add(s.horse_id)
    for (const a of allPatternAlerts) set.add(a.horse_id)
    return set
  }, [allSmartSignals, allPatternAlerts])

  const races = useMemo(() => {
    const raw: Race[] = (racesData as any)?.races || []
    const sorted = [...raw].sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

    // When viewing today, filter out races that have likely finished
    // isRaceCompleted uses a 120min buffer by default, but we'll use a shorter
    // buffer (15 min) so races disappear shortly after the off time
    if (isToday) {
      return sorted.filter((race) => !isRaceCompleted(race.off_time, 15))
    }
    return sorted
  }, [racesData, isToday])

  // ── User bankroll + bets ───────────────────────────────────────
  const { user } = useAuth()
  const { bankroll } = useBankroll()

  // ── Value Bet Scanner ──────────────────────────────────────────────
  const [showValueScan, setShowValueScan] = useState(false)

  interface ValueBetResult {
    horse_name: string
    horse_id: string
    race_id: string
    course_name: string
    off_time: string
    jockey_name: string
    trainer_name: string
    silk_url: string
    number: number
    current_odds: number
    ensembleProba: number
    impliedProb: number
    edge: number
    modelAgreement: number
    kellyStake: number
    entry: any
  }

  const valueBets = useMemo<ValueBetResult[]>(() => {
    if (!races.length) return []

    const MIN_EDGE = 0.05
    const MAX_ODDS = 12.0
    const MIN_ENSEMBLE_PROBA = 0.15
    const MIN_MODEL_AGREEMENT = 2

    const results: ValueBetResult[] = []

    for (const race of races) {
      if (!race.topEntries?.length) continue

      let bestPick: ValueBetResult | null = null

      for (const entry of race.topEntries) {
        const liveOdds = Number(entry.current_odds) || 0
        const openOdds = Number(entry.opening_odds) || 0
        const odds = openOdds > 1 ? openOdds : liveOdds
        const ens = Number(entry.ensemble_proba) || 0
        if (odds <= 1 || ens <= 0 || odds > MAX_ODDS || ens < MIN_ENSEMBLE_PROBA) continue

        const impliedProb = 1 / odds
        const edge = ens - impliedProb
        if (edge < MIN_EDGE) continue

        let modelAgreement = 0
        for (const field of ['ensemble_proba', 'benter_proba', 'rf_proba', 'xgboost_proba'] as const) {
          const myVal = Number(entry[field]) || 0
          if (myVal <= 0) continue
          const isTop = race.topEntries.every((other: any) => (Number(other[field]) || 0) <= myVal)
          if (isTop) modelAgreement++
        }
        if (modelAgreement < MIN_MODEL_AGREEMENT) continue

        const kelly = edge / (odds - 1)
        const fraction = Math.min(kelly / 4, 0.03)
        const rawStake = bankroll * fraction
        const stake = Math.round(rawStake * 2) / 2
        if (stake < 1 || bankroll <= 0) continue

        const pick: ValueBetResult = {
          horse_name: entry.horse_name,
          horse_id: entry.horse_id,
          race_id: race.race_id,
          course_name: race.course_name,
          off_time: race.off_time,
          jockey_name: entry.jockey_name,
          trainer_name: entry.trainer_name,
          silk_url: entry.silk_url,
          number: entry.number,
          current_odds: odds,
          ensembleProba: ens,
          impliedProb,
          edge,
          modelAgreement,
          kellyStake: stake,
          entry,
        }

        if (!bestPick || edge > bestPick.edge) {
          bestPick = pick
        }
      }

      if (bestPick) results.push(bestPick)
    }

    results.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))

    return results
  }, [races, bankroll])

  const { data: userBetsData } = useQuery({
    queryKey: ['user-bets-today-page'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bets', { limit: 500, offset: 0 })
      return res?.data?.bets ?? []
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const userBetsSummary = useMemo(() => {
    const bets = userBetsData ?? []
    let totalPL = 0, totalStaked = 0, wins = 0, settled = 0
    for (const b of bets) {
      const amt = Number(b.bet_amount)
      totalStaked += amt
      if (b.status === 'won') { totalPL += Number(b.potential_return) - amt; wins++; settled++ }
      else if (b.status === 'lost') { totalPL -= amt; settled++ }
      else if (b.status === 'pending') { totalPL -= amt }
    }
    const startingBankroll = bankroll - totalPL
    return {
      totalPL, totalStaked, wins, settled,
      totalBets: bets.length,
      roi: startingBankroll > 0 ? (totalPL / startingBankroll) * 100 : 0,
      winRate: settled > 0 ? (wins / settled) * 100 : 0,
    }
  }, [userBetsData, bankroll])

  const todayBets = useMemo(() => {
    return (userBetsData ?? []).filter((b: any) => b.created_at?.startsWith(selectedDate))
  }, [userBetsData, selectedDate])

  const todayPL = useMemo(() => {
    let pl = 0
    for (const b of todayBets) {
      if (b.status === 'won') pl += Number(b.potential_return) - Number(b.bet_amount)
      else if (b.status === 'lost') pl -= Number(b.bet_amount)
    }
    return pl
  }, [todayBets])

  const todayWins = todayBets.filter((b: any) => b.status === 'won').length
  const todayPending = todayBets.filter((b: any) => b.status === 'pending').length

  // Background enrichment: trigger per-horse odds refresh for value bets
  const enrichmentRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (valueBets.length === 0) return
    const horsesToEnrich: { race_id: string; horse_id: string }[] = []
    for (const vb of valueBets) {
      const key = `${vb.race_id}::${vb.horse_id}`
      if (!enrichmentRef.current.has(key)) {
        horsesToEnrich.push({ race_id: vb.race_id, horse_id: vb.horse_id })
        enrichmentRef.current.add(key)
      }
    }
    if (horsesToEnrich.length > 0) {
      fetchFromSupabaseFunction('enrich-horse-odds', {
        method: 'POST',
        body: JSON.stringify({ horses: horsesToEnrich.slice(0, 20) })
      }).catch(err => console.warn('[enrichment] background call failed:', err))
    }
  }, [valueBets])

  // Force refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Only refetch current query, don't invalidate
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Handle date change without immediate invalidation
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate)
    // Query will automatically refetch due to key change
  }

  // formatTime imported from @/lib/dateUtils — converts stored times properly

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }


  if (error) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load races. Please try again.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Bankroll + Today's Plays Header */}
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
              {(userBetsSummary.roi) >= 0
                ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                : <Target className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">My ROI</span>
            </div>
            <div className={`text-lg font-bold ${userBetsSummary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {userBetsSummary.totalStaked > 0 ? `${userBetsSummary.roi >= 0 ? '+' : ''}${userBetsSummary.roi.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today</span>
            </div>
            <div className="text-lg font-bold text-white">
              {todayBets.length > 0
                ? <>{todayWins}W / {todayBets.length - todayWins - todayPending}L{todayPending > 0 && <span className="text-yellow-400 text-xs ml-1">({todayPending} pending)</span>}</>
                : <span className="text-gray-500">—</span>
              }
            </div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {todayPL >= 0
                ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today P/L</span>
            </div>
            <div className={`text-lg font-bold ${todayPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {todayBets.length > 0 ? `${todayPL >= 0 ? '+' : '-'}£${Math.abs(todayPL).toFixed(2)}` : '—'}
            </div>
          </div>
        </div>

        {/* Today's Bets */}
        {todayBets.length > 0 && (
          <div className="bg-gray-800/60 border border-yellow-500/20 rounded-xl">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-700/50">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-400">My Bets Today</span>
                <span className="text-[10px] text-gray-500">{todayBets.length} {todayBets.length === 1 ? 'bet' : 'bets'}</span>
              </div>
              <Link to="/performance" className="text-[10px] text-gray-500 hover:text-yellow-400 transition-colors">
                Full History →
              </Link>
            </div>
            <div className="divide-y divide-gray-700/30">
              {todayBets.map((bet: any) => {
                const won = bet.status === 'won'
                const lost = bet.status === 'lost'
                const pending = bet.status === 'pending'
                const pl = won ? Number(bet.potential_return) : lost ? -Number(bet.bet_amount) : 0
                return (
                  <div key={bet.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                    <div className="flex-shrink-0">
                      {pending
                        ? <Clock className="w-3.5 h-3.5 text-yellow-400" />
                        : won
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        : <XCircle className="w-3.5 h-3.5 text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium truncate block ${won ? 'text-green-300' : pending ? 'text-white' : 'text-gray-400'}`}>
                        {bet.horse_name}
                      </span>
                    </div>
                    <span className="text-gray-400 font-mono">{formatOdds(String(bet.odds))}</span>
                    <span className="text-gray-400">£{Number(bet.bet_amount).toFixed(2)}</span>
                    <span className={`font-bold w-14 text-right ${
                      pending ? 'text-yellow-400' : pl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {pending ? 'pending' : `${pl >= 0 ? '+' : '-'}£${Math.abs(pl).toFixed(2)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Header - Mobile Optimized */}
        <div className="space-y-3">
          {/* Line 1: Title only */}
          <div>
            <h1 className="text-2xl font-bold text-white">Today's Races</h1>
            <p className="text-gray-400 text-sm">AI-powered race predictions</p>
          </div>
          
          {/* Line 2: Refresh + Scan buttons and date controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 disabled:opacity-50 flex items-center space-x-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              {/* Scan For Value Bets button */}
              {races.length > 0 && (
                <button
                  onClick={() => setShowValueScan(!showValueScan)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center space-x-1.5 transition-all ${
                    showValueScan
                      ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                      : 'bg-green-500 hover:bg-green-400 text-gray-900'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Value Bets</span>
                  {valueBets.length > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      showValueScan
                        ? 'bg-green-500/30 text-green-300'
                        : 'bg-gray-900/30 text-white'
                    }`}>
                      {valueBets.length}
                    </span>
                  )}
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              />
            </div>
          </div>

          {/* Value Bets Scanner Results */}
          {showValueScan && (
            <div className="bg-gray-800/90 border border-green-500/30 rounded-xl">
              {/* Scanner header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-green-400" />
                  <h3 className="text-white font-bold text-sm">Top Picks</h3>
                  <span className="text-gray-400 text-xs">
                    {valueBets.length} {valueBets.length === 1 ? 'pick' : 'picks'} — Benter edge, one per race
                  </span>
                </div>
                <button
                  onClick={() => setShowValueScan(false)}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Results */}
              {valueBets.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">No top picks today</p>
                  <p className="text-gray-500 text-sm mt-1">No horses meet the Benter edge criteria (5%+ edge, 2+ models agree, Kelly-qualified)</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-700/50 max-h-[60vh] overflow-y-auto">
                  {valueBets.map((vb, idx) => (
                    <div
                      key={`${vb.race_id}::${vb.horse_id}`}
                      className="px-4 py-3 hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Left: rank + horse info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Rank badge */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-500 text-gray-900' :
                            idx === 1 ? 'bg-gray-400 text-gray-900' :
                            idx === 2 ? 'bg-amber-600 text-white' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {idx + 1}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <HorseNameWithSilk
                                horseName={vb.horse_name}
                                silkUrl={vb.silk_url}
                                className="text-white font-semibold text-sm"
                                clickable={true}
                                onHorseClick={() => openHorseDetail(vb.entry, {
                                  course_name: vb.course_name,
                                  off_time: vb.off_time,
                                  race_id: vb.race_id,
                                }, {
                                  patternAlerts: allPatternAlerts,
                                  smartSignals: allSmartSignals,
                                })}
                                horseEntry={vb.entry}
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Link
                                to={`/race/${vb.race_id}`}
                                className="text-[11px] text-gray-400 hover:text-yellow-400 transition-colors"
                              >
                                {formatTime(vb.off_time)} {vb.course_name}
                              </Link>
                              <span className="text-[11px] text-gray-500">
                                {vb.jockey_name}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: edge + Kelly + odds + action */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Edge + Kelly */}
                          <div className="text-right">
                            <div className={`font-bold text-sm ${
                              vb.edge >= 0.15 ? 'text-green-400' :
                              vb.edge >= 0.08 ? 'text-emerald-400' :
                              'text-yellow-400'
                            }`}>
                              +{(vb.edge * 100).toFixed(1)}% edge
                            </div>
                            <div className="text-[10px] text-gray-500">
                              Benter {(vb.ensembleProba * 100).toFixed(1)}% · Kelly £{vb.kellyStake.toFixed(2)}
                            </div>
                          </div>

                          {/* Odds */}
                          <div className="text-right">
                            <div className="text-white font-mono font-bold text-sm">
                              {formatOdds(vb.current_odds)}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-col gap-1">
                            <Link
                              to={`/race/${vb.race_id}`}
                              className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors text-center"
                            >
                              Race
                            </Link>
                            <button
                              onClick={() => openHorseDetail(vb.entry, {
                                course_name: vb.course_name,
                                off_time: vb.off_time,
                                race_id: vb.race_id,
                              }, {
                                patternAlerts: allPatternAlerts,
                                smartSignals: allSmartSignals,
                              })}
                              className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                            >
                              Form
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Line 3: Dynamic race summary (only for today) */}
          {selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) && raceStatsData && (
            <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
              <p className="text-gray-300 text-sm">
                <span className="text-yellow-400 font-medium">{raceStatsData.summary_message}</span>
              </p>
            </div>
          )}

          {/* Abandoned Meeting Banner */}
          {(racesData as any)?.abandoned_count > 0 && (
            <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/30 flex items-center space-x-3">
              <span className="text-red-400 text-lg flex-shrink-0">&#x26A0;</span>
              <p className="text-sm">
                <span className="text-red-400 font-semibold">Meeting Abandoned</span>
                <span className="text-gray-400"> — {(racesData as any).abandoned_courses?.join(', ')} ({(racesData as any).abandoned_count} race{(racesData as any).abandoned_count > 1 ? 's' : ''} removed)</span>
              </p>
            </div>
          )}
        </div>

        {/* Loading */}
        {(isLoading || isRefreshing || isFetching) && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
              <span className="text-gray-400">
                {isRefreshing ? 'Refreshing races...' : 
                 isFetching ? 'Loading new date...' : 'Loading races...'}
              </span>
            </div>
          </div>
        )}

        {/* No races */}
        {!isLoading && !isFetching && races.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No races found</h3>
            <p className="text-gray-500">Try selecting a different date</p>
          </div>
        )}

        {/* Race Cards */}
        <div className="space-y-2">
          {races.map((race: Race) => {
            const isExpanded = expandedRace === race.race_id
            // Normalize probabilities across all runners in this race
            const normMap = race.topEntries?.length
              ? normalizeField(race.topEntries, 'ensemble_proba', 'horse_id')
              : new Map<string, number>()
            // Get the best AI prediction (highest ensemble_proba > 0)
            const aiPredictions = race.topEntries?.filter(entry => entry.ensemble_proba > 0) || []
            const topPrediction = aiPredictions.length > 0 ? aiPredictions[0] : null
            const hasAI = topPrediction && topPrediction.ensemble_proba > 0
            
            // Build map of which models picked each horse
            const modelPicksMap = getModelPicksByHorseId(race.topEntries)
            
            // Create race context for buttons
            const raceContext = {
              race_id: race.race_id,
              course_name: race.course_name,
              off_time: race.off_time,
              race_time: race.off_time
            }
            
            return (
              <div
                key={race.race_id}
                id={`race-${race.race_id}`}
                className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 hover:border-yellow-400/30 rounded-lg transition-all duration-200 scroll-mt-[200px]"
              >
                {/* Compact Race Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Line 1: Race name + class + off time */}
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">
                          {race.course_name}
                        </h3>
                        <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-medium">
                          {race.race_class}
                        </span>
                        <div className="flex items-center space-x-1 text-yellow-400">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">{formatTime(race.off_time)}</span>
                        </div>
                      </div>
                      
                      {/* Line 2: Distance, runners, prize */}
                      <div className="flex items-center flex-wrap gap-3 text-sm text-gray-400">
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-4 h-4" />
                          <span>{race.distance}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Users className="w-4 h-4" />
                          <span>{race.field_size}</span>
                        </div>
                        {race.prize && (
                          <div className="flex items-center space-x-1">
                            <Trophy className="w-4 h-4" />
                            <span className="text-green-400 font-medium">£{formatPrize(race.prize)}</span>
                          </div>
                        )}
                        {race.topEntries && (() => {
                          const mkt = getRaceMarketSummary(race.topEntries)
                          if (mkt.steamCount === 0 && mkt.driftCount === 0) return null
                          return (
                            <div className="flex items-center gap-1.5">
                              {mkt.topSteamer && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
                                  <TrendingUp className="w-3 h-3" />
                                  {mkt.steamCount} backed
                                </span>
                              )}
                              {mkt.topDrifter && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                                  <ChevronDown className="w-3 h-3" />
                                  {mkt.driftCount} drifting
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    
                    {/* Stacked action buttons */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Link
                        to={`/race/${race.race_id}`}
                        className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-4 py-1.5 rounded-md text-sm font-bold transition-colors text-center"
                      >
                        Analyse
                      </Link>
                      <button
                        onClick={() => setExpandedRace(isExpanded ? null : race.race_id)}
                        className={`border px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-center ${
                          isExpanded
                            ? 'bg-gray-700 border-yellow-500/50 text-yellow-400'
                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        Runners
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-700 p-4 space-y-4">
                    {/* AI Prediction */}
                    {hasAI && topPrediction && (
                      <div className="bg-gray-700/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Bot className="w-4 h-4 text-yellow-400" />
                            <span className="text-sm font-medium text-yellow-400">AI Top Pick</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star 
                                key={i}
                                className={`w-3 h-3 ${
                                  i < getNormalizedStars(normMap.get(String(topPrediction.horse_id)) ?? 0) 
                                    ? 'text-yellow-400 fill-current' 
                                    : 'text-gray-600'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <HorseNameWithSilk 
                              horseName={topPrediction.horse_name}
                              silkUrl={topPrediction.silk_url}
                              className="text-white font-medium"
                              showNumber={true}
                              number={topPrediction.number}
                              clickable={true}
                              onHorseClick={() => openHorseDetail(topPrediction, {
                                course_name: race.course_name,
                                off_time: race.off_time,
                                race_id: race.race_id
                              }, {
                                patternAlerts: allPatternAlerts,
                                smartSignals: allSmartSignals,
                              })}
                              horseEntry={topPrediction}
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {topPrediction.jockey_name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold ${getNormalizedColor(normMap.get(String(topPrediction.horse_id)) ?? 0)}`}>
                              {formatNormalized(normMap.get(String(topPrediction.horse_id)) ?? 0)}
                            </div>
                            <div className="text-sm text-gray-400">
                              Win Prob
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Market Movement Commentary */}
                    {race.topEntries && race.topEntries.length > 0 && (() => {
                      const marketComment = buildMarketComment({
                        entries: race.topEntries,
                        modelPicksMap,
                      })
                      if (!marketComment) return null
                      return (
                        <div className="flex items-start gap-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2.5">
                          <TrendingUp className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-cyan-300 leading-relaxed">{marketComment}</p>
                        </div>
                      )
                    })()}

                    {/* Complete Runners List */}
                    {race.topEntries && race.topEntries.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-300">All Runners</h4>
                          <span className="text-[10px] text-gray-500 italic">Tap horse name to explore form</span>
                        </div>
                        <div className="space-y-1.5">
                          {race.topEntries.map((entry) => {
                            const hasSignal = signalHorseIds.has(entry.horse_id)
                            const entryModelPicks = modelPicksMap.get(entry.horse_id) || []

                            // Detect profitable signals for this runner
                            const profSignals = lifetimeSignalStats
                              ? detectProfitableSignals(entry, race.topEntries!, entryModelPicks, undefined, lifetimeSignalStats, 'lifetime')
                              : []
                            const dynMatch = matchesByHorse.get(`${race.race_id}:${entry.horse_id}`)
                            const dynCombos = dynMatch?.matching_combos ?? []
                            const hasProfSignal = profSignals.length > 0 || dynCombos.length > 0

                            return (
                            <div key={entry.id} className={`py-2.5 px-3 rounded-lg ${
                              hasProfSignal ? 'bg-green-500/5 border border-green-500/20' :
                              hasSignal ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-700/30'
                            }`}>
                              <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <div className="relative flex-shrink-0">
                                  <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                    {entry.number}
                                  </div>
                                  {(hasSignal || hasProfSignal) && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasProfSignal ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasProfSignal ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <HorseNameWithSilk 
                                      horseName={entry.horse_name}
                                      silkUrl={entry.silk_url}
                                      className="text-white text-sm font-medium"
                                      clickable={true}
                                      onHorseClick={() => openHorseDetail(entry, {
                                        course_name: race.course_name,
                                        off_time: race.off_time,
                                        race_id: race.race_id
                                      }, {
                                        patternAlerts: allPatternAlerts,
                                        smartSignals: allSmartSignals,
                                      })}
                                      horseEntry={entry}
                                    />
                                    {entryModelPicks.length > 0 && (
                                      <span className="flex items-center gap-1 flex-shrink-0">
                                        {entryModelPicks.map(mp => (
                                          <ModelBadge
                                            key={mp.label}
                                            label={mp.label}
                                            color={mp.color}
                                          />
                                        ))}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {entry.jockey_name}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2.5 flex-shrink-0">
                                {entry.ensemble_proba > 0 && (() => {
                                  const np = normMap.get(String(entry.horse_id)) ?? 0
                                  const odds = Number(entry.current_odds)
                                  const vs = odds > 1 ? np * odds : 0
                                  return (
                                    <div className="text-right">
                                      <div className={`text-sm font-medium ${getNormalizedColor(np)}`}>
                                        {formatNormalized(np)}
                                      </div>
                                      {vs > 1.05 && (
                                        <div className={`text-[10px] font-bold ${
                                          vs >= 1.3 ? 'text-green-400' : vs >= 1.15 ? 'text-emerald-400' : 'text-yellow-400'
                                        }`}>
                                          {vs.toFixed(2)}x value
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
                                {entry.current_odds && (
                                  <div className="flex items-center gap-1.5">
                                    <MarketMovementBadge
                                      movement={entry.odds_movement}
                                      pct={entry.odds_movement_pct}
                                    />
                                    <div className={`text-sm font-mono font-medium ${
                                      entry.odds_movement === 'steaming' ? 'text-green-400' :
                                      entry.odds_movement === 'drifting' ? 'text-red-400' :
                                      'text-gray-300'
                                    }`}>
                                      {formatOdds(entry.current_odds)}
                                    </div>
                                  </div>
                                )}
                                <button
                                  onClick={() => openHorseDetail(entry, {
                                    course_name: race.course_name,
                                    off_time: race.off_time,
                                    race_id: race.race_id
                                  }, {
                                    patternAlerts: allPatternAlerts,
                                    smartSignals: allSmartSignals,
                                  })}
                                  className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                                >
                                  Form
                                </button>
                              </div>
                              </div>
                              {hasProfSignal && (
                                <div className="mt-1.5 ml-9">
                                  <ProfitableSignalBadges signals={profSignals} dynamicCombos={dynCombos} compact />
                                </div>
                              )}
                            </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Going & Additional Info */}
                    <div className="flex items-center space-x-4 pt-3 border-t border-gray-700 text-sm">
                      <div className="text-gray-400">
                        <span className="text-gray-300">Going:</span> {race.going}
                      </div>
                      <div className="text-gray-400">
                        <span className="text-gray-300">Age:</span> {race.age_band}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}