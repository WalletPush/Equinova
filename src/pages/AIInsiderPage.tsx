import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { useLifetimeSignalStats } from '@/hooks/useLifetimeSignalStats'
import { supabase, type RaceEntry, type Race } from '@/lib/supabase'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { MODEL_DEFS } from '@/components/ModelBadge'
import {
  getUKDateTime,
  getDateStatusLabel,
  getQueryDateKey,
  formatTime,
  compareRaceTimes,
  isRaceUpcoming,
} from '@/lib/dateUtils'
import {
  calculateConfluenceScores,
  detectProfitableSignals,
  groupByRace,
  type ConfluenceResult,
  type TrainerIntentData,
  type ProfitableSignal,
} from '@/lib/confluenceScore'
import { SignalPicksSection } from '@/components/insider/SignalPicksSection'
import { Brain, RefreshCw, Loader2, AlertCircle, Clock } from 'lucide-react'

// ─── Model picks helper (same as TodaysRacesPage) ──────────────────

function getModelPicksByHorseId(
  entries: RaceEntry[]
): Map<string, { label: string; color: string }[]> {
  const map = new Map<string, { label: string; color: string }[]>()
  if (!entries || entries.length === 0) return map

  for (const model of MODEL_DEFS) {
    const f = model.field as keyof RaceEntry
    let bestEntry: RaceEntry | null = null
    let bestProba = 0
    for (const entry of entries) {
      const p = entry[f] as number
      if (p > bestProba) {
        bestProba = p
        bestEntry = entry
      }
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

// ─── Page Component ────────────────────────────────────────────────

export function AIInsiderPage() {
  const { openHorseDetail } = useHorseDetail()

  // 1. Fetch today's races + entries in one query
  const { data: racesData, isLoading: racesLoading, error: racesError, refetch: refetchRaces } = useQuery({
    queryKey: ['insider-races', getQueryDateKey()],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('race-data', {
        body: { date: getQueryDateKey() },
      })
      if (error) throw error
      if (!data.data) throw new Error('Race data returned empty')
      return data.data as { races: Race[] }
    },
    staleTime: 1000 * 60 * 2,
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 * 3,
  })

  // 2. Fetch ALL race_entries with full field data for today's date
  const { data: allEntriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['insider-all-entries', getQueryDateKey()],
    queryFn: async () => {
      const todayDate = getQueryDateKey()

      // First get all race IDs for today
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('race_id')
        .eq('date', todayDate)

      if (racesError) throw racesError
      if (!races || races.length === 0) return []

      const raceIds = races.map(r => r.race_id)

      // Fetch entries in batches
      const batchSize = 50
      let allEntries: any[] = []
      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries, error: entriesError } = await supabase
          .from('race_entries')
          .select('*')
          .in('race_id', batch)

        if (!entriesError && entries) allEntries = allEntries.concat(entries)
      }

      return allEntries as RaceEntry[]
    },
    staleTime: 1000 * 60 * 2,
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 * 3,
  })

  // 3. Fetch market movers (steaming) — used to overlay odds_movement on entries for signal detection
  const { data: marketMoversData } = useQuery({
    queryKey: ['insider-market-movers'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('horse_market_movement')
        .select('horse_id,race_id,odds_movement,odds_movement_pct')
        .eq('odds_movement', 'steaming')

      if (error) throw error
      return rows || []
    },
    staleTime: 1000 * 30,
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60,
  })

  // 4. Fetch trainer intent data (single runners)
  const { data: trainerIntentData } = useQuery({
    queryKey: ['insider-trainer-intent', getQueryDateKey()],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('trainer-intent-enhanced', { body: {} })
      if (error) throw error
      return data?.data?.trainer_intent_signals || []
    },
    staleTime: 1000 * 60 * 3,
    retry: 2,
  })

  // 5. Lifetime signal performance for intelligent badges (shared hook)
  const historicalSignalStats = useLifetimeSignalStats()

  // ─── Derived Data ──────────────────────────────────────────────────

  const allEntries = allEntriesData || []
  const races = racesData?.races || []

  // Build race metadata map
  const raceMetaMap = useMemo(() => {
    const map: Record<string, { course_name: string; off_time: string; race_class: string; distance: string; going: string; surface: string; field_size: number; prize: string; type: string }> = {}
    for (const r of races) {
      map[r.race_id] = {
        course_name: r.course_name,
        off_time: r.off_time,
        race_class: r.race_class,
        distance: r.distance,
        going: r.going,
        surface: r.surface,
        field_size: r.field_size,
        prize: r.prize,
        type: r.type,
      }
    }
    return map
  }, [races])

  // Build trainer intent map
  const trainerIntentMap = useMemo(() => {
    const map = new Map<string, TrainerIntentData>()
    if (!trainerIntentData) return map
    for (const t of trainerIntentData) {
      map.set(t.horse_id, {
        isSingleRunner: t.is_single_runner || false,
        trainer21DayWinPct: t.trainer_21_day_pct || 0,
      })
    }
    return map
  }, [trainerIntentData])

  // Overlay market movement onto allEntries for signal detection
  const enrichedEntries = useMemo(() => {
    if (!marketMoversData || marketMoversData.length === 0) return allEntries

    const moverMap = new Map<string, any>()
    for (const m of marketMoversData) {
      moverMap.set(m.horse_id, m)
    }

    return allEntries.map(entry => {
      const mover = moverMap.get(entry.horse_id)
      if (!mover) return entry
      return {
        ...entry,
        odds_movement: mover.odds_movement as 'steaming' | 'drifting' | 'stable',
        odds_movement_pct: mover.odds_movement_pct,
      }
    })
  }, [allEntries, marketMoversData])

  // Filter to upcoming races only
  const upcomingEntries = useMemo(() => {
    return enrichedEntries.filter(entry => {
      const meta = raceMetaMap[entry.race_id]
      if (!meta) return false
      return isRaceUpcoming(meta.off_time)
    })
  }, [enrichedEntries, raceMetaMap])

  // Group entries by race
  const entriesByRace = useMemo(() => groupByRace(upcomingEntries), [upcomingEntries])

  // Model picks per race
  const modelPicksMap = useMemo(() => {
    const map: Record<string, Map<string, { label: string; color: string }[]>> = {}
    for (const [raceId, entries] of Object.entries(entriesByRace)) {
      map[raceId] = getModelPicksByHorseId(entries)
    }
    return map
  }, [entriesByRace])

  // ─── Confluence Scores & Verdicts ────────────────────────────────

  const allScoredByRace = useMemo(() => {
    const map: Record<string, ConfluenceResult[]> = {}
    for (const [raceId, entries] of Object.entries(entriesByRace)) {
      map[raceId] = calculateConfluenceScores(entries, trainerIntentMap)
    }
    return map
  }, [entriesByRace, trainerIntentMap])

  // Signal picks: horses with profitable lifetime signals, ordered by race time
  const PASSTHROUGH_SIGNAL_KEYS = new Set([
    'value_bet', 'value_ml_pick', 'value_backed', 'value_top_rated',
    'value_ml_backed', 'value_ml_top_rated', 'value_ml_backed_rated',
    'cd_ml_pick', 'cd_value', 'cd_backed',
    'cd_ml_value', 'cd_ml_backed', 'cd_top_rated',
  ])

  const signalPicks = useMemo(() => {
    if (!historicalSignalStats) return []
    const results: { result: ConfluenceResult; signals: ProfitableSignal[]; offTime: string }[] = []

    for (const [raceId, scored] of Object.entries(allScoredByRace)) {
      const meta = raceMetaMap[raceId]
      if (!meta) continue
      const raceEntries = entriesByRace[raceId] || []
      const picks = modelPicksMap[raceId] || new Map()

      for (const horse of scored) {
        const badges = picks.get(horse.entry.horse_id) || []
        const ti = trainerIntentMap.get(horse.entry.horse_id)
        const sigs = detectProfitableSignals(horse.entry, raceEntries, badges, ti, historicalSignalStats, 'lifetime')
        if (sigs.length === 0) continue

        const hasPassthroughSignal = sigs.some(s => PASSTHROUGH_SIGNAL_KEYS.has(s.key))
        // Allow through if: 2+ models agree OR horse has a profitable value/C&D signal
        if (badges.length < 2 && !hasPassthroughSignal) continue

        results.push({ result: horse, signals: sigs, offTime: meta.off_time })
      }
    }

    // Sort by race time, then by number of signals descending within same race
    return results.sort((a, b) => {
      const timeComp = compareRaceTimes(a.offTime, b.offTime)
      if (timeComp !== 0) return timeComp
      return b.signals.length - a.signals.length
    })
  }, [allScoredByRace, raceMetaMap, entriesByRace, modelPicksMap, trainerIntentMap, historicalSignalStats])

  // ─── Horse click handler ─────────────────────────────────────────

  const handleHorseClick = (entry: RaceEntry) => {
    const meta = raceMetaMap[entry.race_id]
    openHorseDetail(entry, meta ? { course_name: meta.course_name, off_time: meta.off_time, race_id: entry.race_id } : undefined)
  }

  // ─── Render ──────────────────────────────────────────────────────

  const isLoading = racesLoading || entriesLoading
  const londonTime = getDateStatusLabel()

  const handleRefresh = async () => {
    await refetchRaces()
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-950 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-yellow-400" />
              <h1 className="text-lg font-bold text-white">AI Insider</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {londonTime}
              </span>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-1.5 rounded-lg bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick stats bar */}
        {!isLoading && signalPicks.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-800/50">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-yellow-400 font-medium">{signalPicks.length} profitable {signalPicks.length === 1 ? 'signal' : 'signals'} today</span>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="p-4 space-y-8">
          {/* Welcome section */}
          {!isLoading && upcomingEntries.length > 0 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-yellow-500/5 to-amber-500/5 border border-yellow-500/20 rounded-xl p-4 sm:p-5">
                <h2 className="text-base font-bold text-yellow-400 mb-2">Today's Profitable Signals</h2>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">
                  These are horses that match <strong className="text-white">historically profitable signal patterns</strong> based on lifetime data. We run <strong className="text-white">5 AI models</strong> on every race and cross-reference their picks with <strong className="text-white">live market odds</strong>, <strong className="text-white">speed figures</strong>, <strong className="text-white">course & distance form</strong>, and <strong className="text-white">trainer data</strong> to find combinations that have actually made money over time.
                </p>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Each card below shows a horse that has triggered one or more profitable signals. The coloured badges show exactly which signal fired, along with its <strong className="text-white">historical win rate</strong>, <strong className="text-white">profit/loss</strong>, and <strong className="text-white">number of past bets</strong> — so you can see how reliable each signal has been. The <strong className="text-white">Equinova Score</strong> gauge shows the horse's overall strength across all data points, and the <strong className="text-white">expert comment</strong> from the racing data gives additional context.
                </p>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  <strong className="text-gray-300">Tip:</strong> Tap or click any <strong className="text-white">horse name</strong> for full form and deeper AI analysis. Hover or tap the <strong className="text-white">coloured model badges</strong> (MLP, RF, XGB, etc.) to see what each AI model does.
                </p>

                <div className="border-t border-yellow-500/10 pt-3">
                  <h3 className="text-[11px] font-bold text-yellow-400/80 mb-1.5">Equinova Score explained</h3>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5" />50+ = <strong className="text-green-400">Top Pick</strong> — strong across the board</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5" />35-49 = <strong className="text-amber-400">Worth a Look</strong> — some positive signals</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5" />Under 35 = <strong className="text-red-400">Risky</strong> — limited data support</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mb-3" />
              <p className="text-gray-400 text-sm">Analyzing today's races...</p>
              <p className="text-gray-600 text-xs mt-1">Scanning for profitable signal matches</p>
            </div>
          )}

          {/* Error state */}
          {racesError && !isLoading && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-red-400 mb-1">Failed to Load Race Data</h3>
              <p className="text-sm text-gray-400 mb-3">{(racesError as Error).message}</p>
              <button
                onClick={() => refetchRaces()}
                className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* No races */}
          {!isLoading && !racesError && upcomingEntries.length === 0 && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-8 text-center">
              <Brain className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-400 mb-1">No Upcoming Races</h3>
              <p className="text-sm text-gray-500">Either racing is finished for today or no race data is available yet. Check back tomorrow.</p>
            </div>
          )}

          {/* Profitable Signals */}
          {!isLoading && (
            <SignalPicksSection
              signalPicks={signalPicks}
              raceMap={raceMetaMap}
              modelPicksMap={modelPicksMap}
              onHorseClick={handleHorseClick}
            />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
