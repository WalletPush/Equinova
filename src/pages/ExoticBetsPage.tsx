import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { supabase } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { getUKDate } from '@/lib/dateUtils'
import { computeRaceExotics, type Runner, type RaceExotics, type ForecastPick, type TricastPick } from '@/lib/harville'
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
} from 'lucide-react'

export function ExoticBetsPage() {
  const { user } = useAuth()
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
  const formatDate = (ds: string) =>
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
      if (!races?.length) return { races: [], entries: [] }

      const raceIds = races.map(r => r.race_id)
      let allEntries: any[] = []
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
      }

      return { races, entries: allEntries }
    },
    staleTime: 60_000,
  })

  const exoticRaces = useMemo(() => {
    if (!raceData?.races?.length || !raceData?.entries?.length) return []

    const raceMap = new Map<string, any>()
    for (const r of raceData.races) raceMap.set(r.race_id, r)

    const byRace = new Map<string, any[]>()
    for (const e of raceData.entries) {
      if (!byRace.has(e.race_id)) byRace.set(e.race_id, [])
      byRace.get(e.race_id)!.push(e)
    }

    const results: RaceExotics[] = []

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

      if (exotics) results.push(exotics)
    }

    results.sort((a, b) => {
      const timeA = a.off_time || ''
      const timeB = b.off_time || ''
      return timeA.localeCompare(timeB)
    })

    return results
  }, [raceData, bankroll])

  const totalForecasts = exoticRaces.reduce((s, r) => s + r.forecasts.length, 0)
  const totalTricasts = exoticRaces.reduce((s, r) => s + r.tricasts.length, 0)

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

        {/* Info panel */}
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
            <p className="text-xs text-gray-400 leading-relaxed">
              The <span className="text-amber-300 font-medium">Harville formula</span> derives these probabilities from
              our Benter win probabilities. We compare against the market's implied probabilities to find combos where
              our edge is largest. Kelly Criterion sizes each stake (more conservatively than win bets due to higher variance).
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
            <span className="text-sm text-white font-medium">{formatDate(selectedDate)}</span>
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

        {/* No picks */}
        {exoticRaces.length === 0 && (
          <div className="text-center py-12">
            <Layers className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No qualifying exotic bets found for this date</p>
          </div>
        )}

        {/* Race cards */}
        <div className="space-y-4">
          {exoticRaces.map(race => {
            const isExpanded = expandedRace === race.race_id
            const bestForecast = race.forecasts[0]
            const bestTricast = race.tricasts[0]

            return (
              <div key={race.race_id} className="bg-gray-900/80 border border-gray-700/50 rounded-2xl overflow-hidden">
                {/* Race header */}
                <button
                  onClick={() => setExpandedRace(isExpanded ? null : race.race_id)}
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
                      {bestForecast && (
                        <span className="text-[10px] text-green-400">
                          Best edge: {bestForecast.edge_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-700/50 p-4 space-y-4">
                    {/* Forecasts */}
                    {race.forecasts.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" />
                          Straight Forecasts (1st + 2nd in order)
                        </h3>
                        <div className="space-y-3">
                          {race.forecasts.map((fc, i) => (
                            <ForecastCard key={i} pick={fc} rank={i + 1} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tricasts */}
                    {race.tricasts.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5" />
                          Tricasts (1st + 2nd + 3rd in order)
                        </h3>
                        <div className="space-y-3">
                          {race.tricasts.map((tc, i) => (
                            <TricastCard key={i} pick={tc} rank={i + 1} />
                          ))}
                        </div>
                      </div>
                    )}
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

function ForecastCard({ pick, rank }: { pick: ForecastPick; rank: number }) {
  const edgeColor = pick.edge_pct >= 3 ? 'text-green-400' : pick.edge_pct >= 1.5 ? 'text-yellow-400' : 'text-gray-400'

  return (
    <div className="bg-gray-800/60 border border-amber-500/20 rounded-xl p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">#{rank}</span>
          <span className={`text-[10px] font-semibold ${edgeColor}`}>Edge: {pick.edge_pct.toFixed(1)}%</span>
        </div>
        {pick.kelly_stake > 0 && (
          <div className="flex items-center gap-1 text-yellow-400">
            <Gauge className="w-3 h-3" />
            <span className="text-xs font-medium">Kelly: £{pick.kelly_stake.toFixed(2)}</span>
          </div>
        )}
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
        </div>
        <span className="text-[10px] text-gray-500">
          ~{Math.round(pick.estimated_market_odds)}/1 est. payout
        </span>
      </div>
    </div>
  )
}

function TricastCard({ pick, rank }: { pick: TricastPick; rank: number }) {
  const edgeColor = pick.edge_pct >= 2 ? 'text-green-400' : pick.edge_pct >= 1 ? 'text-yellow-400' : 'text-gray-400'

  return (
    <div className="bg-gray-800/60 border border-purple-500/20 rounded-xl p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full">#{rank}</span>
          <span className={`text-[10px] font-semibold ${edgeColor}`}>Edge: {pick.edge_pct.toFixed(2)}%</span>
        </div>
        {pick.kelly_stake > 0 && (
          <div className="flex items-center gap-1 text-yellow-400">
            <Gauge className="w-3 h-3" />
            <span className="text-xs font-medium">Kelly: £{pick.kelly_stake.toFixed(2)}</span>
          </div>
        )}
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
        </div>
        <span className="text-[10px] text-gray-500">
          ~{Math.round(pick.estimated_market_odds)}/1 est. payout
        </span>
      </div>
    </div>
  )
}
