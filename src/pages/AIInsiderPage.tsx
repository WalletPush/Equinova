import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
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
  deriveVerdict,
  detectProfitableSignals,
  groupByRace,
  findSpeedStandouts,
  findCourseDistanceSpecialists,
  findTrainerHotspots,
  type ConfluenceResult,
  type RaceVerdict,
  type TrainerIntentData,
} from '@/lib/confluenceScore'
import { findReturningImprovers } from '@/components/insider/DataAnglesSection'
import { SpotlightSection } from '@/components/insider/SpotlightCard'
import { RaceVerdictsSection } from '@/components/insider/RaceVerdictCard'
import { MarketIntelSection } from '@/components/insider/MarketIntelCard'
import { DataAnglesSection, type ValueBetInsider } from '@/components/insider/DataAnglesSection'
import { normalizeField } from '@/lib/normalize'
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

  // 3. Fetch market movers (steaming)
  const { data: marketMoversData, isLoading: marketMoversLoading } = useQuery({
    queryKey: ['insider-market-movers'],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('horse_market_movement')
        .select('*')
        .eq('odds_movement', 'steaming')
        .order('last_updated', { ascending: false })

      if (error) throw error

      // Enrich with race_entries and race metadata
      const horseIds = Array.from(new Set((rows || []).map((r: any) => r.horse_id).filter(Boolean)))
      let entries: any[] = []
      if (horseIds.length > 0) {
        const { data: fetched } = await supabase
          .from('race_entries')
          .select('horse_id,horse_name,jockey_name,trainer_name,silk_url')
          .in('horse_id', horseIds)
        entries = fetched || []
      }
      const entryMap = new Map(entries.map((e: any) => [e.horse_id, e]))

      const raceIds = Array.from(new Set((rows || []).map((r: any) => r.race_id).filter(Boolean)))
      let races: any[] = []
      if (raceIds.length > 0) {
        const { data: fetched } = await supabase
          .from('races')
          .select('race_id,course_name,off_time,date')
          .in('race_id', raceIds)
        races = fetched || []
      }
      const raceMap = new Map(races.map((r: any) => [r.race_id, r]))

      const currentUK = getUKDateTime().dateTime

      const movers = (rows || []).map((m: any) => {
        const entry = entryMap.get(m.horse_id)
        const race: any = raceMap.get(m.race_id) || {}
        const offTimeRaw = race.off_time || m.off_time || ''
        const displayOffTime = formatTime(offTimeRaw)
        const raceDate = race.date || ''
        const raceDateTime = raceDate && displayOffTime ? `${raceDate} ${displayOffTime}` : ''

        return {
          horse_id: m.horse_id,
          race_id: m.race_id,
          horse_name: m.horse_name || entry?.horse_name || 'Unknown',
          course: m.course || race.course_name || '',
          off_time: displayOffTime,
          race_date_time: raceDateTime,
          jockey_name: m.jockey_name || entry?.jockey_name || null,
          trainer_name: m.trainer_name || entry?.trainer_name || null,
          silk_url: entry?.silk_url || m.silk_url || null,
          bookmaker: m.bookmaker,
          initial_odds: m.initial_odds,
          current_odds: m.current_odds,
          decimal_odds: m.decimal_odds,
          odds_movement: m.odds_movement,
          odds_movement_pct: m.odds_movement_pct,
          last_updated: m.last_updated,
          total_movements: m.change_count ?? 1,
        }
      })

      // Filter to upcoming races only
      const upcoming = movers.filter((m: any) => m.race_date_time && m.race_date_time > currentUK)

      // Group by race
      const raceGroups = upcoming.reduce((acc: any, mover: any) => {
        const raceKey = `${mover.course}_${mover.off_time}`
        if (!acc[raceKey]) {
          acc[raceKey] = {
            race_id: mover.race_id,
            course_name: mover.course,
            off_time: mover.off_time,
            movers: [],
          }
        }
        acc[raceKey].movers.push(mover)
        return acc
      }, {} as Record<string, any>)

      const sorted = Object.values(raceGroups).sort((a: any, b: any) =>
        compareRaceTimes(a.off_time, b.off_time)
      )

      return { movers: upcoming, raceGroups: sorted }
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

  // Overlay market movement onto allEntries
  const enrichedEntries = useMemo(() => {
    if (!marketMoversData?.movers) return allEntries

    const moverMap = new Map<string, any>()
    for (const m of marketMoversData.movers) {
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

  // Build entries map keyed by race_id for market intel
  const raceEntriesMap = useMemo(() => {
    return entriesByRace
  }, [entriesByRace])

  // ─── Confluence Scores & Verdicts ────────────────────────────────

  const allScoredByRace = useMemo(() => {
    const map: Record<string, ConfluenceResult[]> = {}
    for (const [raceId, entries] of Object.entries(entriesByRace)) {
      map[raceId] = calculateConfluenceScores(entries, trainerIntentMap)
    }
    return map
  }, [entriesByRace, trainerIntentMap])

  // Spotlight picks: best across ALL upcoming races, 50+ score, max 5
  const spotlightPicks = useMemo(() => {
    const all: ConfluenceResult[] = []
    for (const scored of Object.values(allScoredByRace)) {
      if (scored.length > 0 && scored[0].score >= 50) {
        all.push(scored[0])
      }
    }
    return all.sort((a, b) => b.score - a.score).slice(0, 5)
  }, [allScoredByRace])

  // Race verdicts: all upcoming races, sorted by time
  const allRaceVerdicts = useMemo(() => {
    const verdicts: RaceVerdict[] = []
    for (const [raceId, scored] of Object.entries(allScoredByRace)) {
      const meta = raceMetaMap[raceId]
      if (!meta) continue

      const entries = entriesByRace[raceId] || []
      const top3Spread = scored.length >= 2
        ? scored[0].score - scored[Math.min(2, scored.length - 1)].score
        : 999

      // Detect profitable signals for the top pick
      const topPick = scored[0] || null
      const topPickSignals = topPick
        ? detectProfitableSignals(
            topPick.entry,
            entries,
            (modelPicksMap[raceId] || new Map()).get(topPick.horseId) || [],
            trainerIntentMap.get(topPick.horseId),
          )
        : []

      verdicts.push({
        raceId,
        courseName: meta.course_name,
        offTime: meta.off_time,
        raceClass: meta.race_class,
        distance: meta.distance,
        fieldSize: meta.field_size,
        going: meta.going,
        surface: meta.surface,
        prize: meta.prize,
        type: meta.type,
        verdict: deriveVerdict(scored),
        topSelection: topPick,
        dangerHorse: scored[1] || null,
        competitiveness: top3Spread,
        allScored: scored,
        entries,
        topPickSignals,
      })
    }

    // Always sort chronologically by race time
    return verdicts.sort((a, b) => compareRaceTimes(a.offTime, b.offTime))
  }, [allScoredByRace, raceMetaMap, entriesByRace, modelPicksMap, trainerIntentMap])

  // Show only the next 4 upcoming races in Race by Race
  const raceVerdicts = useMemo(() => {
    return allRaceVerdicts.slice(0, 4)
  }, [allRaceVerdicts])

  // ─── Data Angles (scoped to the next 4 races only) ──────────────

  const next4Entries = useMemo(() => {
    const next4RaceIds = new Set(raceVerdicts.map(v => v.raceId))
    return upcomingEntries.filter(e => next4RaceIds.has(e.race_id))
  }, [upcomingEntries, raceVerdicts])

  const speedStandouts = useMemo(() => findSpeedStandouts(next4Entries), [next4Entries])
  const specialists = useMemo(() => findCourseDistanceSpecialists(next4Entries), [next4Entries])
  const trainerHotspots = useMemo(() => findTrainerHotspots(next4Entries, trainerIntentMap), [next4Entries, trainerIntentMap])
  const returningImprovers = useMemo(() => findReturningImprovers(next4Entries), [next4Entries])

  // ─── Value Bets (ML top pick + positive edge) ─────────────────────

  const valueBets = useMemo<ValueBetInsider[]>(() => {
    const results: ValueBetInsider[] = []

    for (const [raceId, entries] of Object.entries(entriesByRace)) {
      const normMap = normalizeField(entries, 'ensemble_proba', 'horse_id')
      const picks = modelPicksMap[raceId] || new Map()

      for (const entry of entries) {
        const badges = picks.get(entry.horse_id) || []
        if (badges.length === 0) continue

        const odds = Number(entry.current_odds)
        if (!odds || odds <= 0 || !entry.ensemble_proba || entry.ensemble_proba <= 0) continue

        const normProb = normMap.get(String(entry.horse_id)) ?? 0
        const impliedProb = 1 / (odds + 1)
        const edge = normProb - impliedProb

        if (edge > 0.02) {
          results.push({ entry, raceId, normProb, impliedProb, edge, modelBadges: badges })
        }
      }
    }

    return results.sort((a, b) => b.edge - a.edge)
  }, [entriesByRace, modelPicksMap])

  // ─── Market Movers with race groups ──────────────────────────────

  const marketRaceGroups = marketMoversData?.raceGroups || []

  // Build a flat horse_id → Equinova Score map for market intel
  const equinovaScoreMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const scored of Object.values(allScoredByRace)) {
      for (const s of scored) {
        map[s.horseId] = s.score
      }
    }
    return map
  }, [allScoredByRace])

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

  const strongCount = allRaceVerdicts.filter(v => v.verdict === 'strong').length
  const leanCount = allRaceVerdicts.filter(v => v.verdict === 'lean').length

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-950 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
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
        {!isLoading && allRaceVerdicts.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-800/50">
            <div className="max-w-4xl mx-auto flex items-center gap-4 text-xs">
              <span className="text-gray-500">{allRaceVerdicts.length} races today</span>
              {strongCount > 0 && (
                <span className="text-green-400 font-medium">{strongCount} top {strongCount === 1 ? 'pick' : 'picks'}</span>
              )}
              {leanCount > 0 && (
                <span className="text-amber-400">{leanCount} worth a look</span>
              )}
              {spotlightPicks.length > 0 && (
                <span className="text-yellow-400">{spotlightPicks.length} best {spotlightPicks.length === 1 ? 'pick' : 'picks'}</span>
              )}
              {(marketMoversData?.movers?.length || 0) > 0 && (
                <span className="text-cyan-400">{marketMoversData?.movers?.length} market movers</span>
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
          {/* Welcome section */}
          {!isLoading && upcomingEntries.length > 0 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-yellow-500/5 to-amber-500/5 border border-yellow-500/20 rounded-xl p-4 sm:p-5">
                <h2 className="text-base font-bold text-yellow-400 mb-2">Welcome to AI Insider</h2>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">
                  This is your daily briefing. We crunch <strong className="text-white">5 AI models</strong>, <strong className="text-white">live market odds</strong>, <strong className="text-white">speed figures</strong>, <strong className="text-white">course form</strong>, and <strong className="text-white">trainer data</strong> to surface the horses worth your attention. Everything on this page updates automatically as races approach.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <h3 className="text-[11px] font-bold text-white mb-1">Today's Best Picks</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">The standout horses across all of today's races. These scored 50+ on the Equinova Scale — meaning AI models, form, speed, and market all agree.</p>
                  </div>
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <h3 className="text-[11px] font-bold text-white mb-1">Next Races & Market Movers</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">Our AI verdict for the next 4 races plus horses with shortening odds. See who we like and why, race by race.</p>
                  </div>
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <h3 className="text-[11px] font-bold text-white mb-1">Key Stats</h3>
                    <p className="text-[10px] text-gray-400 leading-relaxed">Data patterns worth knowing — value bets, fastest horses, proven course winners, in-form trainers, and fresh horses running near their best.</p>
                  </div>
                </div>

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
              <p className="text-gray-600 text-xs mt-1">Calculating Equinova Scores across all data</p>
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

          {/* SECTION 1: AI Spotlight */}
          {!isLoading && spotlightPicks.length > 0 && (
            <SpotlightSection
              spotlightPicks={spotlightPicks}
              raceMap={raceMetaMap}
              modelPicksMap={modelPicksMap}
              onHorseClick={handleHorseClick}
            />
          )}

          {!isLoading && spotlightPicks.length === 0 && upcomingEntries.length > 0 && (
            <SpotlightSection
              spotlightPicks={[]}
              raceMap={raceMetaMap}
              modelPicksMap={modelPicksMap}
              onHorseClick={handleHorseClick}
            />
          )}

          {/* SECTION 2: Next Races (max 4) */}
          {!isLoading && raceVerdicts.length > 0 && (
            <RaceVerdictsSection
              verdicts={raceVerdicts}
              totalRaces={allRaceVerdicts.length}
              modelPicksMap={modelPicksMap}
              onHorseClick={handleHorseClick}
            />
          )}

          {/* SECTION 3: Market Intelligence */}
          {!isLoading && (
            <MarketIntelSection
              raceGroups={marketRaceGroups as any}
              raceEntriesMap={raceEntriesMap}
              modelPicksMap={modelPicksMap}
              equinovaScoreMap={equinovaScoreMap}
              onHorseClick={handleHorseClick}
            />
          )}

          {/* SECTION 4: Data Angles */}
          {!isLoading && upcomingEntries.length > 0 && (
            <DataAnglesSection
              valueBets={valueBets}
              speedStandouts={speedStandouts}
              specialists={specialists}
              trainerHotspots={trainerHotspots}
              returningImprovers={returningImprovers}
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
