import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { supabase, Race } from '@/lib/supabase'
import { normalizeField, getNormalizedColor, getNormalizedStars, formatNormalized } from '@/lib/normalize'
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
} from 'lucide-react'
import type { SmartSignal, PatternAlert } from '@/types/signals'

export function TodaysRacesPage() {
  // Use UK timezone for proper date detection
  const [selectedDate, setSelectedDate] = useState(() => {
    const ukDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    return ukDate // Already in YYYY-MM-DD format
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedRace, setExpandedRace] = useState<string | null>(null)
  const { openHorseDetail } = useHorseDetail()

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
    normProb: number
    impliedProb: number
    edge: number
    entry: any // full entry for opening modal
  }

  const valueBets = useMemo<ValueBetResult[]>(() => {
    if (!races.length) return []

    const results: ValueBetResult[] = []

    for (const race of races) {
      if (!race.topEntries?.length) continue

      // Normalize ensemble proba across this race's field
      const normMap = normalizeField(race.topEntries, 'ensemble_proba', 'horse_id')

      for (const entry of race.topEntries) {
        const odds = Number(entry.current_odds)
        if (!odds || odds <= 0 || !entry.ensemble_proba || entry.ensemble_proba <= 0) continue

        const normProb = normMap.get(String(entry.horse_id)) ?? 0
        const impliedProb = 1 / (odds + 1)
        const edge = normProb - impliedProb

        // Only include horses with a strong positive edge (> 10%)
        if (edge > 0.10) {
          results.push({
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
            normProb,
            impliedProb,
            edge,
            entry,
          })
        }
      }
    }

    // Sort by edge descending (biggest value first)
    results.sort((a, b) => b.edge - a.edge)

    return results
  }, [races])

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
            <div className="bg-gray-800/90 border border-green-500/30 rounded-xl overflow-hidden">
              {/* Scanner header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-green-400" />
                  <h3 className="text-white font-bold text-sm">Value Bet Scanner</h3>
                  <span className="text-gray-400 text-xs">
                    {valueBets.length} found across {races.length} races
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
                  <p className="text-gray-400 font-medium">No value bets found</p>
                  <p className="text-gray-500 text-sm mt-1">No horses currently have a meaningful edge over the market odds</p>
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

                        {/* Right: edge + odds + action */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Edge + probabilities */}
                          <div className="text-right">
                            <div className="text-green-400 font-bold text-sm">
                              +{(vb.edge * 100).toFixed(1)}% edge
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {formatNormalized(vb.normProb)} vs {formatNormalized(vb.impliedProb)}
                            </div>
                          </div>

                          {/* Odds */}
                          <div className="text-right">
                            <div className="text-white font-mono font-bold text-sm">
                              {vb.current_odds}/1
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
                            return (
                            <div key={entry.id} className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                              hasSignal ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-700/30'
                            }`}>
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <div className="relative flex-shrink-0">
                                  <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                    {entry.number}
                                  </div>
                                  {hasSignal && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
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
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {entry.jockey_name}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2.5 flex-shrink-0">
                                {entry.ensemble_proba > 0 && (
                                  <div className={`text-sm font-medium ${getNormalizedColor(normMap.get(String(entry.horse_id)) ?? 0)}`}>
                                    {formatNormalized(normMap.get(String(entry.horse_id)) ?? 0)}
                                  </div>
                                )}
                                {entry.current_odds && (
                                  <div className="flex items-center gap-1">
                                    {entry.odds_movement === 'steaming' && (
                                      <TrendingUp className="w-3 h-3 text-green-400" />
                                    )}
                                    {entry.odds_movement === 'drifting' && (
                                      <ChevronDown className="w-3 h-3 text-red-400" />
                                    )}
                                    <div className={`text-sm font-mono font-medium ${
                                      entry.odds_movement === 'steaming' ? 'text-green-400' :
                                      entry.odds_movement === 'drifting' ? 'text-red-400' :
                                      'text-gray-300'
                                    }`}>
                                      {entry.current_odds}
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