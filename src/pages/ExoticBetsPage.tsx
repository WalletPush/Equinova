import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { getUKDate, getUKTime, raceTimeToMinutes } from '@/lib/dateUtils'
import {
  computeRaceExotics,
  type Runner, type RaceExotics,
  type ForecastPick, type TricastPick,
} from '@/lib/harville'
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  Target,
  Gauge,
  Info,
  ChevronDown,
  ChevronUp,
  PoundSterling,
  CheckCircle,
  Loader2,
  X,
  XCircle,
} from 'lucide-react'

type SettledResult = 'won' | 'lost' | null

interface RaceDividends {
  csf: number | null        // Computer Straight Forecast dividend (per £1)
  tricast: number | null    // Tricast dividend (per £1)
  tote_ex: number | null    // Tote exacta dividend (per £1)
  tote_trifecta: number | null
}

interface ExoticRaceWithResults extends RaceExotics {
  forecastResults: SettledResult[]
  tricastResults: SettledResult[]
  dividends: RaceDividends
}

export function ExoticBetsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const ukToday = getUKDate()
  const [selectedDate, setSelectedDate] = useState(ukToday)
  const { bankroll, needsSetup, addFunds, isAddingFunds } = useBankroll()
  const [expandedRace, setExpandedRace] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)

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
  const formatDateStr = (ds: string) =>
    new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

  const { data: raceData, isLoading } = useQuery({
    queryKey: ['exotic-bets-data', selectedDate],
    queryFn: async () => {
      const { data: races, error: racesErr } = await supabase
        .from('races')
        .select('race_id, off_time, course_name, type, surface, field_size')
        .eq('date', selectedDate)
      if (racesErr) throw racesErr
      if (!races?.length) return { races: [], entries: [], resultsByRace: {} }

      const raceIds = races.map(r => r.race_id)
      let allEntries: any[] = []
      let allRunners: any[] = []
      let allRaceResults: any[] = []
      const batchSize = 50
      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries } = await supabase
          .from('race_entries')
          .select([
            'race_id', 'horse_id', 'horse_name', 'current_odds', 'opening_odds',
            'silk_url', 'number', 'jockey_name', 'trainer_name',
            'ensemble_proba',
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

        const { data: raceResults } = await supabase
          .from('race_results')
          .select('race_id, tote_ex, tote_csf, tote_tricast, tote_trifecta')
          .in('race_id', batch)
        if (raceResults) allRaceResults = allRaceResults.concat(raceResults)
      }

      const resultsByRace: Record<string, Record<string, number>> = {}
      for (const r of allRunners) {
        if (!resultsByRace[r.race_id]) resultsByRace[r.race_id] = {}
        const bare = (r.horse || '').replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
        resultsByRace[r.race_id][bare] = Number(r.position)
      }

      const parseDividend = (v: string | null | undefined): number | null => {
        if (!v || typeof v !== 'string') return null
        const cleaned = v.replace(/[£,]/g, '').trim()
        const n = parseFloat(cleaned)
        return Number.isFinite(n) && n > 0 ? n : null
      }

      const dividendsByRace: Record<string, RaceDividends> = {}
      for (const rr of allRaceResults) {
        dividendsByRace[rr.race_id] = {
          csf: parseDividend(rr.tote_csf),
          tricast: parseDividend(rr.tote_tricast),
          tote_ex: parseDividend(rr.tote_ex),
          tote_trifecta: parseDividend(rr.tote_trifecta),
        }
      }

      return { races, entries: allEntries, resultsByRace, dividendsByRace }
    },
    staleTime: 60_000,
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

  const placedBetKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const b of userBetsData ?? []) {
      if (b.horse_name?.includes(' / ')) {
        keys.add(`${b.race_id}:${b.horse_name}`)
      }
    }
    return keys
  }, [userBetsData])

  const betsByKey = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of userBetsData ?? []) {
      if (b.horse_name?.includes(' / ')) {
        map.set(`${b.race_id}:${b.horse_name}`, b)
      }
    }
    return map
  }, [userBetsData])

  const exoticRaces = useMemo((): ExoticRaceWithResults[] => {
    if (!raceData?.races?.length || !raceData?.entries?.length) return []

    const raceMap = new Map<string, any>()
    for (const r of raceData.races) raceMap.set(r.race_id, r)

    const byRace = new Map<string, any[]>()
    for (const e of raceData.entries) {
      if (!byRace.has(e.race_id)) byRace.set(e.race_id, [])
      byRace.get(e.race_id)!.push(e)
    }

    const isPastDate = selectedDate < ukToday
    const ukTime = getUKTime()
    const [curH, curM] = ukTime.split(':').map(Number)
    const curMinutes = curH * 60 + (curM || 0)

    const results: ExoticRaceWithResults[] = []

    for (const [raceId, entries] of byRace) {
      const race = raceMap.get(raceId)
      if (!race) continue

      const runners: Runner[] = entries
        .filter((e: any) => {
          const odds = Number(e.opening_odds) || Number(e.current_odds) || 0
          const prob = Number(e.ensemble_proba) || 0
          return odds > 1 && prob > 0
        })
        .map((e: any) => {
          const odds = Number(e.opening_odds) > 1 ? Number(e.opening_odds) : Number(e.current_odds)
          return {
            horse_id: e.horse_id,
            horse_name: e.horse_name || '',
            win_prob: Number(e.ensemble_proba) || 0,
            market_prob: 1 / odds,
            odds,
            silk_url: e.silk_url,
            number: e.number,
            jockey: e.jockey_name || '',
            trainer: e.trainer_name || '',
          }
        })

      if (runners.length < 3) continue

      const exotics = computeRaceExotics(
        raceId,
        race.course_name || '',
        race.off_time || '',
        race.type || '',
        runners,
        bankroll,
      )
      if (!exotics) continue

      const racePositions = raceData.resultsByRace?.[raceId]
      const raceMinutes = raceTimeToMinutes(race.off_time || '')
      const raceFinished = isPastDate || (raceMinutes > 0 && (curMinutes - raceMinutes) > 10)
      const hasResults = !!racePositions && Object.keys(racePositions).length > 0

      const lookupPos = (horseName: string): number | null => {
        if (!racePositions) return null
        const bare = horseName.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
        let pos = racePositions[bare]
        if (pos !== undefined) return pos
        for (const [name, p] of Object.entries(racePositions)) {
          if (name.startsWith(bare) || bare.startsWith(name)) return p as number
        }
        return null
      }

      const forecastResults: SettledResult[] = exotics.forecasts.map(fc => {
        if (!hasResults || !raceFinished) return null
        const pos1 = lookupPos(fc.first.horse_name)
        const pos2 = lookupPos(fc.second.horse_name)
        if (pos1 === null || pos2 === null) return null
        return (pos1 === 1 && pos2 === 2) ? 'won' : 'lost'
      })

      const tricastResults: SettledResult[] = exotics.tricasts.map(tc => {
        if (!hasResults || !raceFinished) return null
        const pos1 = lookupPos(tc.first.horse_name)
        const pos2 = lookupPos(tc.second.horse_name)
        const pos3 = lookupPos(tc.third.horse_name)
        if (pos1 === null || pos2 === null || pos3 === null) return null
        return (pos1 === 1 && pos2 === 2 && pos3 === 3) ? 'won' : 'lost'
      })

      const dividends = raceData.dividendsByRace?.[raceId] ?? {
        csf: null, tricast: null, tote_ex: null, tote_trifecta: null,
      }

      results.push({ ...exotics, forecastResults, tricastResults, dividends })
    }

    results.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))
    return results
  }, [raceData, bankroll, selectedDate, ukToday])

  const totalForecasts = exoticRaces.reduce((s, r) => s + r.forecasts.length, 0)
  const totalTricasts = exoticRaces.reduce((s, r) => s + r.tricasts.length, 0)

  const { upcomingRaces, settledRaces } = useMemo(() => {
    const upcoming: ExoticRaceWithResults[] = []
    const settled: ExoticRaceWithResults[] = []
    for (const race of exoticRaces) {
      const allResults = [...race.forecastResults, ...race.tricastResults]
      const isSettled = allResults.some(r => r !== null)
      if (isSettled) settled.push(race)
      else upcoming.push(race)
    }
    return { upcomingRaces: upcoming, settledRaces: settled }
  }, [exoticRaces])

  const settledSummary = useMemo(() => {
    if (!settledRaces.length) return null
    let wins = 0, losses = 0, dayPL = 0
    for (const race of settledRaces) {
      race.forecastResults.forEach((result, i) => {
        if (result === null) return
        const fc = race.forecasts[i]
        const bet = betsByKey.get(`${race.race_id}:${fc.first.horse_name} / ${fc.second.horse_name}`)
        const stake = bet ? Number(bet.bet_amount) : fc.kelly_stake
        if (result === 'won') {
          wins++
          const csfDiv = race.dividends.csf
          const totalReturn = bet ? Number(bet.potential_return)
            : csfDiv ? stake * csfDiv
            : stake * fc.estimated_market_odds
          dayPL += totalReturn
        } else {
          losses++
          dayPL -= stake
        }
      })
      race.tricastResults.forEach((result, i) => {
        if (result === null) return
        const tc = race.tricasts[i]
        const bet = betsByKey.get(`${race.race_id}:${tc.first.horse_name} / ${tc.second.horse_name} / ${tc.third.horse_name}`)
        const stake = bet ? Number(bet.bet_amount) : tc.kelly_stake
        if (result === 'won') {
          wins++
          const triDiv = race.dividends.tricast
          const totalReturn = bet ? Number(bet.potential_return)
            : triDiv ? stake * triDiv
            : stake * tc.estimated_market_odds
          dayPL += totalReturn
        } else {
          losses++
          dayPL -= stake
        }
      })
    }
    return { wins, losses, dayPL }
  }, [settledRaces, betsByKey])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {needsSetup && <BankrollSetupModal onSetup={addFunds} isSubmitting={isAddingFunds} />}

      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-400" />
              Exotic Bets
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Benter-style forecasts & tricasts</p>
          </div>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 text-gray-400 hover:text-amber-400 transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>

        {showInfo && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-300">How Exotic Bets Work</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed mb-2">
              William Benter made his fortune on <span className="text-amber-300 font-medium">exotic bets</span> — predicting
              not just the winner, but the exact finishing order. The market prices these bets inefficiently because
              there are hundreds of possible combinations.
            </p>
            <p className="text-xs text-gray-400 leading-relaxed mb-2">
              <span className="text-amber-300 font-medium">Forecast</span> = predict 1st and 2nd in exact order.{' '}
              <span className="text-amber-300 font-medium">Tricast</span> = predict 1st, 2nd, and 3rd in exact order.
            </p>
            <p className="text-xs text-gray-400 leading-relaxed mb-2">
              The <span className="text-amber-300 font-medium">Harville formula</span> derives these probabilities from
              our Benter win probabilities. We compare against the market's implied probabilities to find combos where
              our edge is largest. Kelly Criterion sizes each stake (more conservatively than win bets due to higher variance).
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Settled returns use <span className="text-amber-300 font-medium">actual CSF &amp; tricast dividends</span> from
              the Racing API — not model estimates. Future integration with the{' '}
              <span className="text-amber-300 font-medium">Betfair Exchange API</span> will provide live exchange
              prices for fully automated exotic bet placement.
            </p>
          </div>
        )}

        {/* Date selector */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={goToPreviousDay} className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-white font-medium">{formatDateStr(selectedDate)}</span>
          </div>
          <button
            onClick={goToNextDay}
            disabled={!canGoNext}
            className={`p-2 bg-gray-800 rounded-lg transition-colors ${canGoNext ? 'text-gray-400 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Races</div>
            <div className="text-lg font-bold text-white">{exoticRaces.length}</div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Forecasts</div>
            <div className="text-lg font-bold text-amber-400">{totalForecasts}</div>
          </div>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Tricasts</div>
            <div className="text-lg font-bold text-purple-400">{totalTricasts}</div>
          </div>
        </div>

        {exoticRaces.length === 0 && (
          <div className="text-center py-12">
            <Layers className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No qualifying exotic bets found for this date</p>
          </div>
        )}

        {/* Upcoming picks */}
        {upcomingRaces.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Upcoming</h2>
              <span className="text-xs text-gray-500">
                {upcomingRaces.reduce((s, r) => s + r.forecasts.length + r.tricasts.length, 0)} picks
              </span>
            </div>
            <div className="space-y-4">
              {upcomingRaces.map(race => (
                <RaceCard
                  key={race.race_id}
                  race={race}
                  isExpanded={expandedRace === race.race_id}
                  onToggle={() => setExpandedRace(expandedRace === race.race_id ? null : race.race_id)}
                  placedBetKeys={placedBetKeys}
                  betsByKey={betsByKey}
                  needsSetup={needsSetup}
                />
              ))}
            </div>
          </div>
        )}

        {/* Settled results */}
        {settledRaces.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Results</h2>
                <span className="text-xs text-gray-500">
                  {settledRaces.reduce((s, r) => s + r.forecasts.length + r.tricasts.length, 0)} settled
                </span>
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
            <div className="space-y-4">
              {settledRaces.map(race => (
                <RaceCard
                  key={race.race_id}
                  race={race}
                  isExpanded={expandedRace === race.race_id}
                  onToggle={() => setExpandedRace(expandedRace === race.race_id ? null : race.race_id)}
                  placedBetKeys={placedBetKeys}
                  betsByKey={betsByKey}
                  needsSetup={needsSetup}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// ─── Race Card ──────────────────────────────────────────────────────────

function RaceCard({ race, isExpanded, onToggle, placedBetKeys, betsByKey, needsSetup }: {
  race: ExoticRaceWithResults
  isExpanded: boolean
  onToggle: () => void
  placedBetKeys: Set<string>
  betsByKey: Map<string, any>
  needsSetup: boolean
}) {
  const bestForecast = race.forecasts[0]
  const allResults = [...race.forecastResults, ...race.tricastResults]
  const raceWins = allResults.filter(r => r === 'won').length
  const raceLosses = allResults.filter(r => r === 'lost').length
  const isSettled = raceWins > 0 || raceLosses > 0

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{race.off_time}</span>
            <span className="text-sm text-amber-400 font-semibold">{race.course}</span>
            <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{race.field_size} runners</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {race.forecasts.length > 0 && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <Target className="w-3 h-3" />
                {race.forecasts.length} forecast{race.forecasts.length !== 1 ? 's' : ''}
              </span>
            )}
            {race.tricasts.length > 0 && (
              <span className="text-[10px] text-purple-400 flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {race.tricasts.length} tricast{race.tricasts.length !== 1 ? 's' : ''}
              </span>
            )}
            {bestForecast && !isSettled && (
              <span className="text-[10px] text-green-400">
                Best edge: {bestForecast.edge_pct.toFixed(1)}%
              </span>
            )}
            {isSettled && (
              <span className="text-[10px] font-medium">
                <span className="text-green-400">{raceWins}W</span>
                <span className="text-gray-600 mx-0.5">/</span>
                <span className="text-red-400">{raceLosses}L</span>
              </span>
            )}
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700/50 p-4 space-y-4">
          {race.forecasts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Straight Forecasts (1st + 2nd in order)
              </h3>
              <div className="space-y-3">
                {race.forecasts.map((fc, i) => (
                  <ForecastCard
                    key={i}
                    pick={fc}
                    rank={i + 1}
                    raceId={race.race_id}
                    course={race.course}
                    offTime={race.off_time}
                    result={race.forecastResults[i]}
                    bet={betsByKey.get(`${race.race_id}:${fc.first.horse_name} / ${fc.second.horse_name}`)}
                    isPlaced={placedBetKeys.has(`${race.race_id}:${fc.first.horse_name} / ${fc.second.horse_name}`)}
                    needsSetup={needsSetup}
                    csfDividend={race.dividends.csf}
                  />
                ))}
              </div>
            </div>
          )}

          {race.tricasts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5" />
                Tricasts (1st + 2nd + 3rd in order)
              </h3>
              <div className="space-y-3">
                {race.tricasts.map((tc, i) => (
                  <TricastCard
                    key={i}
                    pick={tc}
                    rank={i + 1}
                    raceId={race.race_id}
                    course={race.course}
                    offTime={race.off_time}
                    result={race.tricastResults[i]}
                    bet={betsByKey.get(`${race.race_id}:${tc.first.horse_name} / ${tc.second.horse_name} / ${tc.third.horse_name}`)}
                    isPlaced={placedBetKeys.has(`${race.race_id}:${tc.first.horse_name} / ${tc.second.horse_name} / ${tc.third.horse_name}`)}
                    needsSetup={needsSetup}
                    tricastDividend={race.dividends.tricast}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Place Exotic Bet Modal ─────────────────────────────────────────────

function ExoticPlaceBetButton({
  betLabel,
  horseName,
  horseId,
  raceId,
  course,
  offTime,
  estimatedOdds,
  kellyStake,
  isPlaced,
  needsSetup,
}: {
  betLabel: string
  horseName: string
  horseId: string
  raceId: string
  course: string
  offTime: string
  estimatedOdds: number
  kellyStake: number
  isPlaced: boolean
  needsSetup: boolean
}) {
  const [showModal, setShowModal] = useState(false)
  const [betAmount, setBetAmount] = useState('')
  const [placed, setPlaced] = useState(isPlaced)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const placeMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      return await callSupabaseFunction('place-bet', {
        horse_name: horseName,
        horse_id: horseId,
        race_id: raceId,
        course,
        off_time: offTime,
        bet_amount: amount,
        odds: estimatedOdds,
        current_odds: String(estimatedOdds),
        bet_type: betLabel.toLowerCase(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
      queryClient.invalidateQueries({ queryKey: ['user-bets-summary'] })
      setPlaced(true)
      setShowModal(false)
      setBetAmount('')
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to place bet')
    },
  })

  const handleConfirm = () => {
    const amt = parseFloat(betAmount)
    if (!amt || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    setError(null)
    placeMutation.mutate({ amount: amt })
  }

  if (placed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
        <CheckCircle className="w-3.5 h-3.5" />
        Bet Placed
      </span>
    )
  }

  if (needsSetup) return null

  const modal = showModal && createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Place {betLabel}</h3>
            <button onClick={() => { setShowModal(false); setError(null) }} className="p-1 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h4 className="font-semibold text-white text-sm mb-2">{horseName}</h4>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between"><span>Course:</span><span className="text-white">{course}</span></div>
                <div className="flex justify-between"><span>Time:</span><span className="text-white">{offTime}</span></div>
                <div className="flex justify-between"><span>Est. Odds:</span><span className="text-yellow-400 font-medium">~{Math.round(estimatedOdds)}/1</span></div>
                <div className="flex justify-between"><span>Kelly suggests:</span><span className="text-yellow-400 font-medium">£{kellyStake.toFixed(2)}</span></div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Stake (GBP)</label>
              <input
                type="number"
                step="0.50"
                min="0.50"
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                placeholder={`Kelly: £${kellyStake.toFixed(2)}`}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                autoFocus
              />
            </div>

            {betAmount && parseFloat(betAmount) > 0 && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Est. Return:</span>
                  <span className="text-green-400 font-medium">
                    ~£{(parseFloat(betAmount) * estimatedOdds).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleConfirm}
                disabled={placeMutation.isPending || !betAmount || parseFloat(betAmount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {placeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PoundSterling className="w-4 h-4" />}
                <span>Place Bet</span>
              </button>
              <button
                onClick={() => { setShowModal(false); setError(null) }}
                className="px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      <button
        onClick={() => { setShowModal(true); setBetAmount(String(kellyStake.toFixed(2))) }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
      >
        <PoundSterling className="w-3.5 h-3.5" />
        Place Bet
      </button>
      {modal}
    </>
  )
}

// ─── Won / Lost Badge ───────────────────────────────────────────────────

function ResultBadge({ result, stake, totalReturn, bet, dividend }: {
  result: SettledResult
  stake: number
  totalReturn: number
  bet?: any
  dividend?: number | null
}) {
  if (result === null) return null

  if (result === 'won') {
    const actualReturn = bet ? Number(bet.potential_return) : totalReturn
    const actualStake = bet ? Number(bet.bet_amount) : stake
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
            <CheckCircle className="w-3 h-3" /> WON
          </span>
          <span className="text-sm font-bold text-green-400">
            +£{actualReturn.toFixed(2)}
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          Staked £{actualStake.toFixed(2)}
          {dividend ? ` · Div £${dividend.toFixed(2)}` : ''}
        </span>
      </div>
    )
  }

  const lostAmount = bet ? Number(bet.bet_amount) : stake
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
          <XCircle className="w-3 h-3" /> LOST
        </span>
        <span className="text-sm font-bold text-red-400">
          -£{lostAmount.toFixed(2)}
        </span>
      </div>
      <span className="text-[10px] text-gray-500">
        Staked £{lostAmount.toFixed(2)}
      </span>
    </div>
  )
}

// ─── Forecast Card ──────────────────────────────────────────────────────

function ForecastCard({ pick, rank, raceId, course, offTime, result, bet, isPlaced, needsSetup, csfDividend }: {
  pick: ForecastPick; rank: number; raceId: string; course: string; offTime: string
  result: SettledResult; bet?: any; isPlaced: boolean; needsSetup: boolean
  csfDividend: number | null
}) {
  const isSettled = result !== null
  const edgeColor = pick.edge_pct >= 3 ? 'text-green-400' : pick.edge_pct >= 1.5 ? 'text-yellow-400' : 'text-gray-400'
  const combinedName = `${pick.first.horse_name} / ${pick.second.horse_name}`
  const borderColor = isSettled
    ? result === 'won' ? 'border-green-500/30' : 'border-red-500/20'
    : 'border-amber-500/20'

  const stake = bet ? Number(bet.bet_amount) : pick.kelly_stake
  const totalReturn = bet
    ? Number(bet.potential_return)
    : csfDividend
      ? stake * csfDividend
      : stake * pick.estimated_market_odds

  return (
    <div className={`bg-gray-800/60 border ${borderColor} rounded-xl p-3`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">#{rank}</span>
          <span className={`text-[10px] font-semibold ${edgeColor}`}>Edge: {pick.edge_pct.toFixed(1)}%</span>
        </div>
        {isSettled ? (
          <ResultBadge result={result} stake={stake} totalReturn={totalReturn} bet={bet} dividend={csfDividend} />
        ) : pick.kelly_stake > 0 ? (
          <div className="flex items-center gap-1 text-yellow-400">
            <Gauge className="w-3 h-3" />
            <span className="text-xs font-medium">Kelly: £{pick.kelly_stake.toFixed(2)}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-500/30 text-amber-300 font-bold w-5 h-5 rounded-full flex items-center justify-center">1</span>
          <span className="text-sm font-semibold text-white flex-1">{pick.first.horse_name}</span>
          <span className="text-xs text-gray-400">{formatOdds(pick.first.odds)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-gray-600/50 text-gray-300 font-bold w-5 h-5 rounded-full flex items-center justify-center">2</span>
          <span className="text-sm font-medium text-gray-300 flex-1">{pick.second.horse_name}</span>
          <span className="text-xs text-gray-400">{formatOdds(pick.second.odds)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>Model: {(pick.harville_prob * 100).toFixed(2)}%</span>
          <span>Market: {(pick.market_prob * 100).toFixed(2)}%</span>
          {isSettled && csfDividend ? (
            <span className="text-amber-400 font-medium">CSF: £{csfDividend.toFixed(2)}</span>
          ) : (
            <span>~{Math.round(pick.estimated_market_odds)}/1</span>
          )}
        </div>
      </div>

      {!isSettled && pick.kelly_stake > 0 && (
        <div className="mt-3">
          <ExoticPlaceBetButton
            betLabel="Forecast"
            horseName={combinedName}
            horseId={pick.first.horse_id}
            raceId={raceId}
            course={course}
            offTime={offTime}
            estimatedOdds={pick.estimated_market_odds}
            kellyStake={pick.kelly_stake}
            isPlaced={isPlaced}
            needsSetup={needsSetup}
          />
        </div>
      )}
    </div>
  )
}

// ─── Tricast Card ───────────────────────────────────────────────────────

function TricastCard({ pick, rank, raceId, course, offTime, result, bet, isPlaced, needsSetup, tricastDividend }: {
  pick: TricastPick; rank: number; raceId: string; course: string; offTime: string
  result: SettledResult; bet?: any; isPlaced: boolean; needsSetup: boolean
  tricastDividend: number | null
}) {
  const isSettled = result !== null
  const edgeColor = pick.edge_pct >= 2 ? 'text-green-400' : pick.edge_pct >= 1 ? 'text-yellow-400' : 'text-gray-400'
  const combinedName = `${pick.first.horse_name} / ${pick.second.horse_name} / ${pick.third.horse_name}`
  const borderColor = isSettled
    ? result === 'won' ? 'border-green-500/30' : 'border-red-500/20'
    : 'border-purple-500/20'

  const stake = bet ? Number(bet.bet_amount) : pick.kelly_stake
  const totalReturn = bet
    ? Number(bet.potential_return)
    : tricastDividend
      ? stake * tricastDividend
      : stake * pick.estimated_market_odds

  return (
    <div className={`bg-gray-800/60 border ${borderColor} rounded-xl p-3`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full">#{rank}</span>
          <span className={`text-[10px] font-semibold ${edgeColor}`}>Edge: {pick.edge_pct.toFixed(2)}%</span>
        </div>
        {isSettled ? (
          <ResultBadge result={result} stake={stake} totalReturn={totalReturn} bet={bet} dividend={tricastDividend} />
        ) : pick.kelly_stake > 0 ? (
          <div className="flex items-center gap-1 text-yellow-400">
            <Gauge className="w-3 h-3" />
            <span className="text-xs font-medium">Kelly: £{pick.kelly_stake.toFixed(2)}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-purple-500/30 text-purple-300 font-bold w-5 h-5 rounded-full flex items-center justify-center">1</span>
          <span className="text-sm font-semibold text-white flex-1">{pick.first.horse_name}</span>
          <span className="text-xs text-gray-400">{formatOdds(pick.first.odds)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold w-5 h-5 rounded-full flex items-center justify-center">2</span>
          <span className="text-sm font-medium text-gray-300 flex-1">{pick.second.horse_name}</span>
          <span className="text-xs text-gray-400">{formatOdds(pick.second.odds)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-gray-600/30 text-gray-400 font-bold w-5 h-5 rounded-full flex items-center justify-center">3</span>
          <span className="text-sm font-medium text-gray-400 flex-1">{pick.third.horse_name}</span>
          <span className="text-xs text-gray-400">{formatOdds(pick.third.odds)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>Model: {(pick.harville_prob * 100).toFixed(3)}%</span>
          <span>Market: {(pick.market_prob * 100).toFixed(3)}%</span>
          {isSettled && tricastDividend ? (
            <span className="text-purple-400 font-medium">Tricast: £{tricastDividend.toFixed(2)}</span>
          ) : (
            <span>~{Math.round(pick.estimated_market_odds)}/1</span>
          )}
        </div>
      </div>

      {!isSettled && pick.kelly_stake > 0 && (
        <div className="mt-3">
          <ExoticPlaceBetButton
            betLabel="Tricast"
            horseName={combinedName}
            horseId={pick.first.horse_id}
            raceId={raceId}
            course={course}
            offTime={offTime}
            estimatedOdds={pick.estimated_market_odds}
            kellyStake={pick.kelly_stake}
            isPlaced={isPlaced}
            needsSetup={needsSetup}
          />
        </div>
      )}
    </div>
  )
}
