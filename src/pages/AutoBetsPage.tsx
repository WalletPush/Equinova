import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { BetSlip } from '@/components/BetSlip'
import { PickCard, SmartMoneyCard } from '@/components/top-picks'
import type { SmartMoneyAlert, TopPick } from '@/components/top-picks/types'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { useBankroll } from '@/hooks/useBankroll'
import { useMastermind, useAutoBetSettings } from '@/hooks/useMastermind'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { getUKTime, getUKDate, raceTimeToMinutes } from '@/lib/dateUtils'
import { computeKelly } from '@/lib/kelly'
import { parseOutcome } from '@/lib/raceOutcome'
import type { Selection } from '@/lib/exoticKelly'
import {
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Brain,
  Sparkles,
  Calendar,
  Zap,
  Bell,
  Flame,
  AlertTriangle,
} from 'lucide-react'

const MIN_EDGE = 0.05
const MAX_ODDS = 13.0
const MIN_ENSEMBLE_PROBA = 0.40
const LONGSHOT_MIN_ACTIVE_PATTERNS = 2

export function AutoBetsPage() {
  const { user } = useAuth()
  const ukToday = getUKDate()
  const [selectedDate, setSelectedDate] = useState(ukToday)
  const isToday = selectedDate === ukToday
  const { bankroll, needsSetup, addFunds, isAddingFunds } = useBankroll()
  const { isSupported: pushSupported, permission: pushPermission, isSubscribed: pushSubscribed, requestPermission, subscribe } = useNotifications()
  const [slipHorseIds, setSlipHorseIds] = useState<Set<string>>(new Set())
  const [pushDismissed, setPushDismissed] = useState(() => sessionStorage.getItem('push-dismissed') === '1')

  const { matchesByHorse, isLoading: mastermindLoading } = useMastermind(selectedDate)
  const { autoBetEnabled, toggleAutoBet, isToggling } = useAutoBetSettings()
  const [autoBetToast, setAutoBetToast] = useState<{ count: number; total: number; error?: string } | null>(null)
  const [isPlacingAutoBets, setIsPlacingAutoBets] = useState(false)
  const queryClient = useQueryClient()

  const toggleSlip = useCallback((horseId: string) => {
    setSlipHorseIds(prev => {
      const next = new Set(prev)
      if (next.has(horseId)) next.delete(horseId)
      else if (next.size < 4) next.add(horseId)
      return next
    })
  }, [])

  const removeFromSlip = useCallback((horseId: string) => {
    setSlipHorseIds(prev => {
      const next = new Set(prev)
      next.delete(horseId)
      return next
    })
  }, [])

  const clearSlip = useCallback(() => setSlipHorseIds(new Set()), [])

  const goToPreviousDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toLocaleDateString('en-CA'))
  }
  const goToNextDay = () => {
    if (selectedDate < ukToday) {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      setSelectedDate(d.toLocaleDateString('en-CA'))
    }
  }
  const canGoNext = selectedDate < ukToday
  const formatDate = (ds: string) =>
    new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

  const { data: entriesData, isLoading: loadingEntries } = useQuery({
    queryKey: ['benter-top-picks', selectedDate],
    queryFn: async () => {
      const { data: races, error: racesErr } = await supabase
        .from('races')
        .select('race_id, off_time, course_name, type, surface')
        .eq('date', selectedDate)
      if (racesErr) throw racesErr
      if (!races?.length) return { entries: [], raceMap: {} as Record<string, any> }

      const raceMap: Record<string, any> = {}
      for (const r of races) raceMap[r.race_id] = r

      const raceIds = races.map(r => r.race_id)
      let allEntries: any[] = []
      let allRunners: any[] = []
      let allResults: any[] = []
      const batchSize = 50
      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries } = await supabase
          .from('race_entries')
          .select([
            'race_id', 'horse_id', 'horse_name', 'current_odds', 'opening_odds',
            'silk_url', 'number', 'jockey_name', 'trainer_name',
            'ensemble_proba', 'benter_proba', 'rf_proba', 'xgboost_proba',
            'rpr', 'ts', 'ofr', 'comment', 'spotlight',
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
          .select('race_id, horse, horse_id, position, comment')
          .in('race_id', batch)
        if (runners) allRunners = allRunners.concat(runners)

        const { data: results } = await supabase
          .from('race_results')
          .select('race_id, non_runners')
          .in('race_id', batch)
        if (results) allResults = allResults.concat(results)
      }

      const resultsByRace: Record<string, Record<string, number>> = {}
      const resultsByHorseId: Record<string, number> = {}
      const outcomeByHorseId: Record<string, string> = {}
      const racesWithResults = new Set<string>()
      for (const r of allRunners) {
        const pos = r.position != null ? Number(r.position) : 0
        if (pos > 0) {
          if (!resultsByRace[r.race_id]) resultsByRace[r.race_id] = {}
          const bare = (r.horse || '').replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
          resultsByRace[r.race_id][bare] = pos
        }
        if (r.horse_id) {
          resultsByHorseId[`${r.race_id}:${r.horse_id}`] = pos
          if (pos === 0 && r.comment) {
            outcomeByHorseId[`${r.race_id}:${r.horse_id}`] = parseOutcome(r.comment)
          }
        }
        racesWithResults.add(r.race_id)
      }

      const nonRunnersByRace: Record<string, Set<string>> = {}
      for (const res of allResults) {
        const nrText = res.non_runners || ''
        if (!nrText.trim()) continue
        racesWithResults.add(res.race_id)
        const names = new Set<string>()
        for (const chunk of nrText.split(',')) {
          const name = chunk.replace(/\s*\(.*$/, '').trim().toLowerCase()
          if (name) names.add(name)
        }
        nonRunnersByRace[res.race_id] = names
      }

      return { entries: allEntries, raceMap, resultsByRace, resultsByHorseId, outcomeByHorseId, racesWithResults, nonRunnersByRace }
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

  const qc = useQueryClient()
  const [smartMoneyToast, setSmartMoneyToast] = useState<SmartMoneyAlert | null>(null)

  const { data: smartAlerts = [] } = useQuery<SmartMoneyAlert[]>({
    queryKey: ['smart-money-alerts', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('smart_money_alerts')
        .select('*')
        .eq('date', selectedDate)
        .order('triggered_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SmartMoneyAlert[]
    },
    staleTime: 15_000,
    refetchInterval: isToday ? 60_000 : false,
  })

  useEffect(() => {
    if (!isToday) return
    const channel = supabase
      .channel('smart-money-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'smart_money_alerts',
      }, (payload) => {
        const alert = payload.new as SmartMoneyAlert
        if (alert.date === ukToday) {
          qc.invalidateQueries({ queryKey: ['smart-money-alerts', ukToday] })
          setSmartMoneyToast(alert)
          setTimeout(() => setSmartMoneyToast(null), 12_000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isToday, ukToday, qc])

  const userBets = useMemo(() => {
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
      totalBets: bets.length, totalPL, totalStaked, wins, settled,
      roi: startingBankroll > 0 ? (totalPL / startingBankroll) * 100 : 0,
      winRate: settled > 0 ? (wins / settled) * 100 : 0,
    }
  }, [userBetsData, bankroll])

  const userBetLookup = useMemo(() => {
    const set = new Set<string>()
    for (const b of userBetsData ?? []) {
      if (b.race_id && b.horse_id) set.add(`${b.race_id}:${b.horse_id}`)
    }
    return set
  }, [userBetsData])

  const { picks, settledPicks } = useMemo(() => {
    if (!entriesData?.entries?.length) return { picks: [] as TopPick[], settledPicks: [] as TopPick[] }
    const { entries, raceMap, resultsByRace, resultsByHorseId, outcomeByHorseId, racesWithResults, nonRunnersByRace } = entriesData

    const isPastDate = selectedDate < ukToday
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
    const addedRaceIds = new Set<string>()

    const MAX_DAILY_EXPOSURE = 0.15
    const MAX_ODDS_BAND_EXPOSURE = 0.25
    const getOddsBand = (o: number) => o < 3 ? 'short' : o < 5 ? 'mid' : o < 9 ? 'midlong' : 'long'
    let dailyExposure = 0
    const bandExposure: Record<string, number> = { short: 0, mid: 0, midlong: 0, long: 0 }
    if (bankroll > 0) {
      for (const b of (userBetsData ?? [])) {
        if (b.race_date === selectedDate && (b.status === 'pending' || b.status === 'won' || b.status === 'lost')) {
          const amt = Number(b.bet_amount) || 0
          const bOdds = Number(b.current_odds) || 3
          dailyExposure += amt / bankroll
          bandExposure[getOddsBand(bOdds)] += amt / bankroll
        }
      }
    }

    for (const [raceId, raceEntries] of byRace) {
      const race = raceMap[raceId]
      if (!race) continue

      let bestPick: TopPick | null = null

      for (const e of raceEntries) {
        const liveOdds = Number(e.current_odds) || 0
        const openOddsRaw = Number(e.opening_odds) || 0
        const odds = openOddsRaw > 1 ? openOddsRaw : liveOdds
        const ensProba = Number(e.ensemble_proba) || 0
        if (odds <= 1 || ensProba <= 0) continue
        if (ensProba < MIN_ENSEMBLE_PROBA) continue

        const impliedProb = 1 / odds
        const edge = ensProba - impliedProb
        if (edge < MIN_EDGE) continue

        const mmKey = `${raceId}:${e.horse_id}`
        const mm = matchesByHorse.get(mmKey)
        const pCount = mm?.pattern_count ?? 0

        if (pCount === 0) continue

        if (odds > MAX_ODDS) {
          if (pCount < LONGSHOT_MIN_ACTIVE_PATTERNS) continue
        }

        const bestSpeed = Math.max(
          Number(e.best_speed_figure_on_course_going_distance) || 0,
          Number(e.best_speed_figure_at_distance) || 0,
          Number(e.best_speed_figure_at_track) || 0,
        )

        let oddsMovement: 'steaming' | 'drifting' | 'stable' | null = null
        let oddsMovementPct: number | null = null
        if (openOddsRaw > 0 && liveOdds > 0) {
          const pctChange = ((liveOdds - openOddsRaw) / openOddsRaw) * 100
          oddsMovementPct = Math.abs(pctChange)
          if (liveOdds < openOddsRaw * 0.85) oddsMovement = 'steaming'
          else if (liveOdds > openOddsRaw * 1.15) oddsMovement = 'drifting'
          else oddsMovement = 'stable'
        }

        const pick: TopPick = {
          race_id: raceId,
          horse_id: e.horse_id,
          horse_name: e.horse_name || '',
          course: race.course_name || '',
          off_time: race.off_time || '',
          race_type: race.type || '',
          current_odds: liveOdds > 0 ? liveOdds : odds,
          opening_odds: openOddsRaw,
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
          spotlight: e.spotlight || '',
          best_speed: bestSpeed,
          avg_fp: Number(e.avg_finishing_position) || 0,
          trainer_course_wr: Number(e.trainer_win_percentage_at_course) || 0,
          trainer_21d_wr: Number(e.trainer_21_days_win_percentage) || 0,
          jockey_21d_wr: Number(e.jockey_21_days_win_percentage) || 0,
          jockey_dist_wr: Number(e.jockey_win_percentage_at_distance) || 0,
          finishing_position: null,
          outcome: null,
          edge,
          implied_prob: impliedProb,
          odds_movement: oddsMovement,
          odds_movement_pct: oddsMovementPct,
        }

        if (!bestPick || edge > bestPick.edge) {
          bestPick = pick
        }
      }

      const finalPick = bestPick

      if (finalPick) {
        const mmKey = `${finalPick.race_id}:${finalPick.horse_id}`
        const hasBet = userBetLookup.has(mmKey)
        const mmMatch = matchesByHorse.get(mmKey)
        const kelly = computeKelly(finalPick, bankroll, mmMatch?.trust_score ?? 0)
        if (!kelly) continue

        const raceMinutes = raceTimeToMinutes(finalPick.off_time || '')
        const hasResults = racesWithResults?.has(finalPick.race_id)
        const raceFinished = isPastDate || (raceMinutes > 0 && (curMinutes - raceMinutes) > 10)

        const nrSet = nonRunnersByRace?.[finalPick.race_id]
        if (nrSet) {
          const bareName = finalPick.horse_name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
          if (nrSet.has(bareName)) continue
        }

        addedRaceIds.add(finalPick.race_id)

        if (hasResults && raceFinished) {
          const idKey = `${finalPick.race_id}:${finalPick.horse_id}`
          let pos: number | undefined = resultsByHorseId?.[idKey]

          if (pos === undefined) {
            const racePositions = resultsByRace[finalPick.race_id]
            if (racePositions) {
              const bareName = finalPick.horse_name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
              pos = racePositions[bareName]
              if (pos === undefined) {
                for (const [name, p] of Object.entries(racePositions)) {
                  if (name.startsWith(bareName) || bareName.startsWith(name)) { pos = p; break }
                }
              }
            }
          }

          finalPick.finishing_position = pos ?? 0
          if (pos === undefined || pos === 0) {
            const outcomeKey = `${finalPick.race_id}:${finalPick.horse_id}`
            finalPick.outcome = outcomeByHorseId?.[outcomeKey] || 'LOST'
          }
          settled.push(finalPick)
        } else if (raceFinished && !hasResults) {
          settled.push(finalPick)
        } else if (!raceFinished) {
          if (kelly && bankroll > 0 && !hasBet) {
            const proposedFrac = kelly.stake / bankroll
            const band = getOddsBand(finalPick.opening_odds > 1 ? finalPick.opening_odds : finalPick.current_odds)
            if (dailyExposure + proposedFrac > MAX_DAILY_EXPOSURE) continue
            if (bandExposure[band] + proposedFrac > MAX_ODDS_BAND_EXPOSURE) continue
            dailyExposure += proposedFrac
            bandExposure[band] += proposedFrac
          }
          upcoming.push(finalPick)
        }
      }
    }

    upcoming.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))
    settled.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))
    return { picks: upcoming, settledPicks: settled }
  }, [entriesData, bankroll, selectedDate, ukToday, matchesByHorse, userBetLookup, userBetsData])

  const handleAutoBetToggle = useCallback(async (turnOn: boolean) => {
    toggleAutoBet(turnOn)
    if (!turnOn) return

    if (!isToday) return

    setIsPlacingAutoBets(true)
    setAutoBetToast(null)

    try {
      const strongMatches: any[] = []
      for (const pick of picks) {
        const mmKey = `${pick.race_id}:${pick.horse_id}`
        const mm = matchesByHorse.get(mmKey)
        if (!mm) continue
        if ((mm.trust_score ?? 0) < 70) continue
        if ((mm.pattern_count ?? 0) === 0) continue

        strongMatches.push({
          horse_name: pick.horse_name,
          horse_id: pick.horse_id,
          race_id: pick.race_id,
          course: pick.course,
          off_time: pick.off_time,
          trainer: pick.trainer,
          jockey: pick.jockey,
          ensemble_proba: pick.ensemble_proba,
          opening_odds: pick.opening_odds,
          current_odds: pick.current_odds,
          trust_score: mm.trust_score,
          trust_tier: mm.trust_tier,
          pattern_count: mm.pattern_count,
        })
      }

      if (strongMatches.length === 0) {
        setAutoBetToast({ count: 0, total: 0, error: 'No Strong picks today' })
        setTimeout(() => setAutoBetToast(null), 5000)
        return
      }

      const res = await callSupabaseFunction('mastermind-auto-bet', { matches: strongMatches })
      const result = res?.data

      if (result) {
        setAutoBetToast({ count: result.bets_placed ?? 0, total: result.total_staked ?? 0 })
        queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
        queryClient.invalidateQueries({ queryKey: ['user-bets-summary'] })
        queryClient.invalidateQueries({ queryKey: ['benter-top-picks', selectedDate] })
      } else {
        setAutoBetToast({ count: 0, total: 0, error: 'No response from auto-bet' })
      }

      setTimeout(() => setAutoBetToast(null), 8000)
    } catch (err) {
      setAutoBetToast({ count: 0, total: 0, error: String(err) })
      setTimeout(() => setAutoBetToast(null), 8000)
    } finally {
      setIsPlacingAutoBets(false)
    }
  }, [toggleAutoBet, isToday, picks, matchesByHorse, selectedDate, queryClient])

  const betsByHorse = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of userBetsData ?? []) {
      map.set(`${b.race_id}:${b.horse_id}`, b)
    }
    return map
  }, [userBetsData])

  const mySettledPicks = useMemo(() => {
    return settledPicks.filter(p => betsByHorse.has(`${p.race_id}:${p.horse_id}`))
  }, [settledPicks, betsByHorse])

  const settledSummary = useMemo(() => {
    if (!mySettledPicks.length) return null
    let wins = 0, losses = 0, dayPL = 0
    for (const p of mySettledPicks) {
      const bet = betsByHorse.get(`${p.race_id}:${p.horse_id}`)
      if (!bet) continue
      const stake = Number(bet.bet_amount) || 0
      if (bet.status === 'won') {
        wins++
        dayPL += Number(bet.potential_return) - stake
      } else if (bet.status === 'lost') {
        losses++
        dayPL -= stake
      }
    }
    return { wins, losses, dayPL }
  }, [mySettledPicks, betsByHorse])

  const slipSelections = useMemo<Selection[]>(() => {
    if (slipHorseIds.size === 0) return []
    return picks
      .filter(p => slipHorseIds.has(p.horse_id))
      .map(p => ({
        horse_id: p.horse_id,
        race_id: p.race_id,
        horse_name: p.horse_name,
        course: p.course,
        off_time: p.off_time,
        jockey: p.jockey,
        trainer: p.trainer,
        odds: p.opening_odds > 1 ? p.opening_odds : p.current_odds,
        ensemble_proba: p.ensemble_proba,
      }))
  }, [picks, slipHorseIds])

  const isLoading = loadingEntries || mastermindLoading

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

        {/* Date selector */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <button onClick={goToPreviousDay} className="p-2 text-gray-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-sm font-semibold text-white flex items-center gap-2 justify-center">
                <Calendar className="w-4 h-4 text-purple-400" />
                {formatDate(selectedDate)}
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={ukToday}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-white text-xs mt-1 focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
            </div>
            <button
              onClick={goToNextDay}
              disabled={!canGoNext}
              className={`p-2 transition-colors ${canGoNext ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* How it works banner */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-purple-300">How to Use Top Picks</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Our AI scans every race and looks for horses the{' '}
            <span className="text-white font-medium">bookmakers have underestimated</span>.
            When our models believe a horse has a genuinely better chance of winning than the odds suggest,
            that's an "edge." Most races won't have one — picks{' '}
            <span className="text-white font-medium">only appear when a real edge exists</span>.
            When they do, we suggest how much to stake based on the size of that edge.
          </p>
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Signal Strength Guide</p>
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 text-xs font-bold w-20 flex-shrink-0 pt-0.5">Weak</span>
              <p className="text-xs text-gray-400">
                The horse shows a small edge over the market. Worth noting and keeping an eye on,
                but not a strong enough signal to bet confidently on its own. Watch how the odds move closer to race time.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-400 text-xs font-bold w-20 flex-shrink-0 pt-0.5">Moderate</span>
              <p className="text-xs text-gray-400">
                A solid edge backed by at least 2 of our 4 models agreeing this horse is the one to beat.
                These are reasonable plays, especially when odds are shortening (money coming in from other punters too).
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-400 text-xs font-bold w-20 flex-shrink-0 pt-0.5">Strong</span>
              <p className="text-xs text-gray-400">
                A large edge with multiple models and historical patterns all pointing to the same horse.
                These are our highest conviction picks. The suggested Kelly stake reflects the confidence level.
              </p>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed border-t border-gray-700/50 pt-2">
            <span className="text-purple-300 font-medium">Tip:</span>{' '}
            The edge gauge on each card shows exactly how much our AI thinks the horse is underpriced.
            The bigger the edge, the stronger the opportunity. Green model dots show how many of our models agree.
          </p>
        </div>

        {/* Mastermind Auto-Bet Toggle */}
        {user && (
          <div className={`border rounded-xl p-4 transition-all ${
            autoBetEnabled
              ? 'bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/40'
              : 'bg-gray-800/60 border-gray-700'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${autoBetEnabled ? 'bg-purple-500/20' : 'bg-gray-700'}`}>
                  <Brain className={`w-5 h-5 ${autoBetEnabled ? 'text-purple-400' : 'text-gray-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">Mastermind Auto-Bet</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      autoBetEnabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'
                    }`}>
                      {autoBetEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isPlacingAutoBets
                      ? 'Placing bets on Strong picks...'
                      : autoBetEnabled
                      ? 'Auto-betting active — bets placed on Strong picks (trust 70+)'
                      : 'Manual mode — view AI intelligence on each pick'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleAutoBetToggle(!autoBetEnabled)}
                disabled={isToggling || isPlacingAutoBets}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  autoBetEnabled ? 'bg-purple-500' : 'bg-gray-600'
                } ${(isToggling || isPlacingAutoBets) ? 'opacity-50' : ''}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  autoBetEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        )}

        {/* Auto-bet result toast */}
        {autoBetToast && (
          <div className={`border rounded-xl p-4 flex items-center justify-between ${
            autoBetToast.error
              ? 'bg-red-500/10 border-red-500/30'
              : autoBetToast.count > 0
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-yellow-500/10 border-yellow-500/30'
          }`}>
            <div className="flex items-center gap-3">
              {autoBetToast.error ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : autoBetToast.count > 0 ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">
                  {autoBetToast.error
                    ? 'Auto-bet failed'
                    : autoBetToast.count > 0
                    ? `Auto-bet: ${autoBetToast.count} bet${autoBetToast.count !== 1 ? 's' : ''} placed`
                    : 'No qualifying bets today'
                  }
                </p>
                <p className="text-xs text-gray-400">
                  {autoBetToast.error
                    ? autoBetToast.error
                    : autoBetToast.count > 0
                    ? `Total staked: £${autoBetToast.total.toFixed(2)} — Kelly-sized by trust score`
                    : 'No Strong picks (trust 70+) available for today'
                  }
                </p>
              </div>
            </div>
            <button onClick={() => setAutoBetToast(null)} className="text-gray-400 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Push notification prompt */}
        {pushSupported && !pushSubscribed && !pushDismissed && (
          <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Bell className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-300">Enable Push Notifications</p>
                <p className="text-xs text-gray-400">Get instant alerts for Smart Money moves and new picks</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={async () => {
                  const ok = await requestPermission()
                  if (ok) await subscribe()
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg text-xs font-bold transition-colors"
              >
                Enable
              </button>
              <button
                onClick={() => { setPushDismissed(true); sessionStorage.setItem('push-dismissed', '1') }}
                className="text-gray-500 hover:text-gray-300 text-xs"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Smart Money Toast */}
        {smartMoneyToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] animate-bounce">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 border-2 border-yellow-400 rounded-xl px-5 py-3 shadow-2xl shadow-amber-500/30 flex items-center gap-3 max-w-sm">
              <Flame className="w-5 h-5 text-yellow-200 animate-pulse flex-shrink-0" />
              <div>
                <div className="text-xs font-bold text-yellow-100 uppercase tracking-wider">Smart Money Alert</div>
                <div className="text-sm font-semibold text-white">
                  {smartMoneyToast.horse_name} — {smartMoneyToast.course} {smartMoneyToast.off_time?.substring(0, 5)}
                </div>
                <div className="text-[10px] text-yellow-200">
                  Edge +{(smartMoneyToast.live_edge * 100).toFixed(1)}% · Backed {smartMoneyToast.pct_backed.toFixed(0)}% · Kelly £{smartMoneyToast.kelly_stake.toFixed(2)}
                </div>
              </div>
              <button onClick={() => setSmartMoneyToast(null)} className="text-yellow-200 hover:text-white ml-1">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Smart Money Confirmed Section */}
        {smartAlerts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Smart Money Confirmed</h2>
              <span className="text-xs text-gray-500">{smartAlerts.length} alert{smartAlerts.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {smartAlerts.map(alert => (
                <SmartMoneyCard
                  key={alert.id}
                  alert={alert}
                  bet={betsByHorse.get(`${alert.race_id}:${alert.horse_id}`)}
                  needsSetup={needsSetup}
                />
              ))}
            </div>
          </div>
        )}

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
        {!isLoading && picks.length === 0 && mySettledPicks.length === 0 && (
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
            {isToday && picks.length >= 2 && (
              <p className="text-[10px] text-gray-500 -mt-1 mb-1">
                Tap + to add picks to the bet slip for Doubles, Patents, or Lucky 15s (max 4)
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {picks.map(pick => (
                <PickCard
                  key={`${pick.race_id}:${pick.horse_id}`}
                  pick={pick}
                  bet={betsByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                  userBankroll={bankroll}
                  needsSetup={needsSetup}
                  inSlip={slipHorseIds.has(pick.horse_id)}
                  onToggleSlip={isToday ? () => toggleSlip(pick.horse_id) : undefined}
                  slipFull={slipHorseIds.size >= 4}
                  mastermindMatch={matchesByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Settled Results */}
        {!isLoading && mySettledPicks.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">My Results</h2>
                <span className="text-xs text-gray-500">{mySettledPicks.length} settled</span>
              </div>
              {settledSummary && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium">
                    <span className="text-green-400">{settledSummary.wins}W</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="text-red-400">{settledSummary.losses}L</span>
                  </span>
                  <span className={`text-sm font-bold ${settledSummary.dayPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {settledSummary.dayPL >= 0 ? '+' : '-'}£{Math.abs(settledSummary.dayPL).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {mySettledPicks.map(pick => (
                <PickCard
                  key={`${pick.race_id}:${pick.horse_id}`}
                  pick={pick}
                  bet={betsByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                  userBankroll={bankroll}
                  needsSetup={needsSetup}
                  settled
                  mastermindMatch={matchesByHorse.get(`${pick.race_id}:${pick.horse_id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Performance link */}
        {(picks.length > 0 || mySettledPicks.length > 0) && (
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

      {isToday && slipSelections.length >= 2 && (
        <BetSlip
          selections={slipSelections}
          bankroll={bankroll}
          onRemove={removeFromSlip}
          onClear={clearSlip}
        />
      )}
    </AppLayout>
  )
}
