import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase, Race } from '@/lib/supabase'
import { normalizeField, formatNormalized } from '@/lib/normalize'
import { formatTime, getUKDate, raceTimeToMinutes } from '@/lib/dateUtils'
import { 
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Timer,
  Medal,
  Brain,
  TrendingUp,
  TrendingDown,
  Zap,
  BarChart3,
  Target,
  Lightbulb,
  AlertTriangle,
  Loader2
} from 'lucide-react'

// ─── Runner type from race_runners table ────────────────────────────
interface RaceRunner {
  id: number
  race_id: string
  position: number | null
  horse: string
  number: number
  sp: string
  btn: number | null
  ovr_btn: number | null
  time: string | null
  comment: string | null
}

// ─── Parse outcome from comment for horses that didn't finish ───────
// Returns "Fell", "Pulled Up", "Unseated", "Brought Down", "Refused", or "DNF"
function parseNonFinishOutcome(runner: RaceRunner | undefined): string {
  if (!runner) return 'N/R'
  const c = (runner.comment || '').toLowerCase()
  if (c.includes('unseated')) return 'Unseated'
  if (c.includes('fell')) return 'Fell'
  if (c.includes('pulled up')) return 'Pulled Up'
  if (c.includes('brought down')) return 'Brought Down'
  if (c.includes('refused')) return 'Refused'
  if (c.includes('slipped up')) return 'Slipped Up'
  if (c.includes('carried out')) return 'Carried Out'
  // If they're in race_runners but no position and no clear outcome, they started but didn't finish
  return 'DNF'
}

// ─── Extended race type with runners ────────────────────────────────
interface ResultsRace extends Race {
  runners?: RaceRunner[]
}

// ─── Strip country suffix e.g. "(IRE)", "(GB)", "(FR)" for matching ─
function bareHorseName(name: string): string {
  return name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
}

// ─── Medal colors for positions ─────────────────────────────────────
function positionBadge(pos: number | null) {
  if (pos === 1) return { bg: 'bg-yellow-500', text: 'text-gray-900', label: '1st' }
  if (pos === 2) return { bg: 'bg-gray-400', text: 'text-gray-900', label: '2nd' }
  if (pos === 3) return { bg: 'bg-amber-600', text: 'text-white', label: '3rd' }
  if (pos) return { bg: 'bg-gray-600', text: 'text-white', label: `${pos}th` }
  return { bg: 'bg-gray-700', text: 'text-gray-400', label: '-' }
}

export function PreviousRacesPage() {
  // ─── Default to today (UK timezone) ─────────────────────────────
  const [selectedDate, setSelectedDate] = useState(() => getUKDate())
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRaces, setExpandedRaces] = useState<Set<string>>(new Set())

  // ─── Live UK clock (ticks every second when viewing today) ──────
  const [ukTime, setUkTime] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )
  const ukToday = getUKDate()
  const isToday = selectedDate === ukToday

  useEffect(() => {
    if (!isToday) return
    const tick = setInterval(() => {
      setUkTime(
        new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }, 1000)
    return () => clearInterval(tick)
  }, [isToday])

  // ─── Daily analysis state ────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisExpanded, setAnalysisExpanded] = useState(true)
  const queryClient = useQueryClient()

  // Fetch existing analysis for the selected date
  const { data: analysisData } = useQuery({
    queryKey: ['daily-analysis', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_analysis')
        .select('*')
        .eq('date', selectedDate)
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5
  })

  const runAnalysis = async () => {
    setIsAnalyzing(true)
    try {
      const { data, error } = await supabase.functions.invoke('daily-race-analysis', {
        body: { date: selectedDate }
      })
      if (error) throw error
      // Invalidate to refetch stored analysis
      queryClient.invalidateQueries({ queryKey: ['daily-analysis', selectedDate] })
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ─── Data fetching ──────────────────────────────────────────────
  const { data: racesData, isLoading, error, isFetching } = useQuery({
    queryKey: ['results-races', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('race-data', {
        body: { date: selectedDate }
      })
      if (error) throw error
      if (!data?.data) throw new Error(data?.error?.message || 'Race data API failed')
      return data.data
    },
    staleTime: isToday ? 1000 * 30 : 1000 * 60 * 10, // 30s today, 10min historical
    refetchInterval: isToday ? 60_000 : false,         // auto-refresh every 60s for today
    retry: 3,
    retryDelay: 1000,
    placeholderData: keepPreviousData
  })

  const allRaces: ResultsRace[] = (racesData as any)?.races || []
  const completedRaces = (racesData as any)?.completed_races ?? 0

  // ─── Split into completed & pending, apply search ───────────────
  const { completed, pending } = useMemo(() => {
    const matchesSearch = (race: ResultsRace) =>
      race.course_name.toLowerCase().includes(searchTerm.toLowerCase())

    const done: ResultsRace[] = []
    const waiting: ResultsRace[] = []

    for (const race of allRaces) {
      if (!matchesSearch(race)) continue
      if (race.hasResults && race.runners && race.runners.length > 0) {
        done.push(race)
      } else {
        waiting.push(race)
      }
    }

    // Completed: most recent result first (descending off_time)
    done.sort((a, b) => raceTimeToMinutes(b.off_time) - raceTimeToMinutes(a.off_time))
    // Pending: chronological (next race first)
    waiting.sort((a, b) => raceTimeToMinutes(a.off_time) - raceTimeToMinutes(b.off_time))

    return { completed: done, pending: waiting }
  }, [allRaces, searchTerm])

  // ─── Toggle expand/collapse ─────────────────────────────────────
  const toggleExpand = (raceId: string) => {
    setExpandedRaces(prev => {
      const next = new Set(prev)
      if (next.has(raceId)) next.delete(raceId)
      else next.add(raceId)
      return next
    })
  }

  // ─── Find ML predicted winner for a race ────────────────────────
  // Only consider horses that actually FINISHED (position != null).
  // This excludes non-runners, pulled-up, fell, etc.
  const getMlPredictedWinner = (race: ResultsRace) => {
    if (!race.topEntries || race.topEntries.length === 0) return null

    // If we have results, only match against horses that finished (position is set)
    if (race.runners && race.runners.length > 0) {
      const finisherNames = new Set(
        race.runners
          .filter(r => r.position != null && r.position > 0)
          .map(r => bareHorseName(r.horse))
      )

      // Walk topEntries (sorted by ensemble_proba desc) — first finisher match wins
      for (const entry of race.topEntries) {
        const bareName = bareHorseName(entry.horse_name)
        let found = finisherNames.has(bareName)
        if (!found) {
          for (const fn of finisherNames) {
            if (fn.startsWith(bareName) || bareName.startsWith(fn)) {
              found = true
              break
            }
          }
        }
        if (found) return entry
      }

      // No ML entry matched a finisher — return null (no valid pick for this race)
      return null
    }

    // Pre-race (no runners data yet) — return top ML pick
    return race.topEntries[0]
  }

  // ─── Date navigation ───────────────────────────────────────────
  const goToPreviousDay = () => {
    const date = new Date(selectedDate + 'T12:00:00')
    date.setDate(date.getDate() - 1)
    setSelectedDate(date.toLocaleDateString('en-CA'))
  }

  const goToNextDay = () => {
    if (selectedDate < ukToday) {
      const date = new Date(selectedDate + 'T12:00:00')
      date.setDate(date.getDate() + 1)
      setSelectedDate(date.toLocaleDateString('en-CA'))
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

  const canGoNext = selectedDate < ukToday

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="p-4 space-y-5">

        {/* ── Header ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              {isToday ? "Today's Results" : 'Results'}
            </h1>
            {isToday && (
              <div className="flex items-center space-x-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-1.5">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-mono text-sm font-medium">{ukTime}</span>
                <span className="text-gray-500 text-xs">UK</span>
              </div>
            )}
          </div>

          {/* Progress indicator */}
          {!isLoading && allRaces.length > 0 && (
            <div className="mt-3 flex items-center space-x-3">
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-yellow-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((completed.length / allRaces.length) * 100)}%` }}
                />
              </div>
              <span className="text-sm text-gray-400 whitespace-nowrap">
                <span className="text-yellow-400 font-medium">{completed.length}</span> of {allRaces.length} races completed
              </span>
            </div>
          )}
        </div>

        {/* ── Daily Intelligence Panel ─────────────────────────── */}
        {completed.length > 0 && (
          <div className="space-y-3">
            {/* Analysis button or existing analysis */}
            {!analysisData ? (
              <button
                onClick={runAnalysis}
                disabled={isAnalyzing || pending.length > 0}
                className="w-full bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/40 rounded-xl p-4 hover:from-yellow-500/30 hover:to-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-center space-x-3">
                  {isAnalyzing ? (
                    <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                  ) : (
                    <Brain className="w-5 h-5 text-yellow-400" />
                  )}
                  <span className="text-yellow-400 font-semibold">
                    {isAnalyzing ? 'Analyzing...' : 'Assess Results — Generate Daily Intelligence'}
                  </span>
                </div>
                {pending.length > 0 && !isAnalyzing && (
                  <p className="text-xs text-gray-500 mt-1">Available once all races are completed</p>
                )}
              </button>
            ) : (
              <div className="bg-gray-800/90 border border-yellow-500/30 rounded-xl overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setAnalysisExpanded(!analysisExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Brain className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-base font-semibold text-white">Daily Intelligence Report</h2>
                    <span className="text-xs bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded">
                      {analysisData.completed_races} races analyzed
                    </span>
                  </div>
                  {analysisExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {analysisExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* ML Accuracy Cards */}
                    {analysisData.ml_accuracy && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ML Model Performance</h3>
                        <div className="grid grid-cols-5 gap-2">
                          {Object.entries(analysisData.ml_accuracy as Record<string, any>)
                            .sort(([,a]: any, [,b]: any) => b.win_rate - a.win_rate)
                            .map(([model, stats]: [string, any]) => (
                            <div key={model} className={`rounded-lg p-2.5 text-center ${
                              stats.win_rate >= 30 ? 'bg-green-500/10 border border-green-500/20' :
                              stats.win_rate >= 20 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                              'bg-gray-700/30 border border-gray-700'
                            }`}>
                              <div className="text-[10px] text-gray-400 uppercase font-medium">{model}</div>
                              <div className={`text-lg font-bold ${
                                stats.win_rate >= 30 ? 'text-green-400' : stats.win_rate >= 20 ? 'text-yellow-400' : 'text-gray-300'
                              }`}>{stats.win_rate}%</div>
                              <div className="text-[10px] text-gray-500">{stats.wins}/{stats.picks} wins</div>
                              {stats.roi_pct !== undefined && (
                                <div className={`text-[10px] font-semibold mt-0.5 ${
                                  stats.roi_pct > 0 ? 'text-green-400' : stats.roi_pct < 0 ? 'text-red-400' : 'text-gray-500'
                                }`}>
                                  {stats.roi_pct > 0 ? '+' : ''}{stats.roi_pct}% ROI
                                </div>
                              )}
                              {stats.profit !== undefined && (
                                <div className={`text-[10px] ${
                                  stats.profit > 0 ? 'text-green-500/70' : stats.profit < 0 ? 'text-red-500/70' : 'text-gray-600'
                                }`}>
                                  {stats.profit > 0 ? '+' : ''}&pound;{stats.profit.toFixed(2)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Signal Performance Table */}
                    {(() => {
                      const signalLabels: Record<string, string> = {
                        steamer_ml_pick: 'Backed + ML Pick',
                        ml_ratings_consensus: 'ML + RPR + TS',
                        ratings_consensus: 'RPR + TS Consensus',
                        ml_pick_top_rpr: 'ML Pick + Top RPR',
                        ml_top_pick: 'ML Top Pick',
                        top_rpr: 'Top RPR in Field',
                        top_ts: 'Top Topspeed',
                        steamer: 'Market Confidence',
                        single_trainer: 'Single Trainer Entry',
                        speed_standout: 'Speed Figure Standout',
                        drifter: 'Market Drifter',
                        trainer_form: 'Trainer in Form (21d)',
                        jockey_form: 'Jockey in Form (21d)',
                        course_specialist: 'Course Specialist',
                        distance_form: 'Distance Specialist',
                        steamer_single_trainer: 'Backed + Single Trainer',
                        steamer_trainer_form: 'Backed + Trainer Form',
                        triple_signal: 'Triple Signal',
                        ml_pick_trainer_form: 'ML + Trainer Form',
                        single_trainer_in_form: 'Single Trainer in Form',
                        steamer_jockey_form: 'Backed + Jockey Form',
                        ml_pick_course_specialist: 'ML + Course Specialist'
                      }

                      // Gather all signal stats from all the _stats fields
                      const allStats: any[] = []
                      const addStat = (data: any) => {
                        if (data && data.occurrences > 0) allStats.push(data)
                      }
                      addStat(analysisData.steamer_stats)
                      addStat(analysisData.single_trainer_stats)
                      addStat(analysisData.top_rpr_stats)
                      addStat(analysisData.top_ts_stats)
                      addStat(analysisData.trainer_form_stats)
                      addStat(analysisData.jockey_form_stats)
                      addStat(analysisData.course_specialist_stats)
                      addStat(analysisData.distance_specialist_stats)
                      addStat(analysisData.speed_figure_stats)
                      if (analysisData.combined_signal_stats) {
                        for (const s of Object.values(analysisData.combined_signal_stats as Record<string, any>)) {
                          addStat(s)
                        }
                      }
                      allStats.sort((a, b) => b.win_rate - a.win_rate)

                      if (allStats.length === 0) return null
                      return (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Signal Performance &amp; ROI (£1 Level Stakes)</h3>
                          <div className="flex items-center justify-between py-1 px-3 mb-1">
                            <span className="text-[10px] text-gray-600 uppercase">Signal</span>
                            <div className="flex items-center space-x-3">
                              <span className="text-[10px] text-gray-600 uppercase min-w-[36px] text-right">Bets</span>
                              <span className="text-[10px] text-gray-600 uppercase min-w-[40px] text-right">Win%</span>
                              <span className="text-[10px] text-gray-600 uppercase min-w-[52px] text-right">P&amp;L</span>
                              <span className="text-[10px] text-gray-600 uppercase min-w-[44px] text-right">ROI</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {allStats.map((s: any) => {
                              const label = signalLabels[s.signal_type] || s.signal_type
                              const isCompound = s.signal_type?.includes('_') && !['single_trainer','ml_top_pick','top_rpr','top_ts','trainer_form','jockey_form','course_specialist','distance_form','speed_standout'].includes(s.signal_type)
                              const hasRoi = s.roi_pct !== undefined && s.roi_pct !== null
                              const profit = s.profit ?? 0
                              return (
                                <div key={s.signal_type} className={`flex items-center justify-between py-1.5 px-3 rounded ${
                                  hasRoi && profit > 0 ? 'bg-green-500/10' : s.win_rate >= 40 ? 'bg-green-500/10' : s.win_rate >= 20 ? 'bg-gray-700/30' : 'bg-gray-800/30'
                                }`}>
                                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                                    {isCompound ? <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" /> : <Target className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                                    <span className="text-sm text-gray-300 truncate">{label}</span>
                                  </div>
                                  <div className="flex items-center space-x-3 flex-shrink-0">
                                    <span className="text-xs text-gray-500 min-w-[36px] text-right">{s.occurrences} bets</span>
                                    <span className={`text-xs font-bold min-w-[40px] text-right ${
                                      s.win_rate >= 40 ? 'text-green-400' : s.win_rate >= 20 ? 'text-yellow-400' : s.win_rate <= 10 ? 'text-red-400' : 'text-gray-300'
                                    }`}>{s.win_rate}%</span>
                                    {hasRoi && (
                                      <>
                                        <span className={`text-xs font-semibold min-w-[52px] text-right ${
                                          profit > 0 ? 'text-green-400' : profit < 0 ? 'text-red-400' : 'text-gray-500'
                                        }`}>
                                          {profit > 0 ? '+' : ''}&pound;{profit.toFixed(2)}
                                        </span>
                                        <span className={`text-[10px] font-bold min-w-[44px] text-right px-1 py-0.5 rounded ${
                                          s.roi_pct > 0 ? 'bg-green-500/15 text-green-400' : s.roi_pct < -20 ? 'bg-red-500/15 text-red-400' : 'text-gray-500'
                                        }`}>
                                          {s.roi_pct > 0 ? '+' : ''}{s.roi_pct}%
                                        </span>
                                      </>
                                    )}
                                    {!hasRoi && (
                                      <span className="text-xs text-gray-500 min-w-[40px] text-right">{s.wins}/{s.occurrences}</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Key Insights */}
                    {analysisData.top_insights && (analysisData.top_insights as string[]).length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Insights</h3>
                        <div className="space-y-1.5">
                          {(analysisData.top_insights as string[]).map((insight: string, i: number) => (
                            <div key={i} className="flex items-start space-x-2 text-sm">
                              <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-300">{insight}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Re-run button */}
                    <button
                      onClick={runAnalysis}
                      disabled={isAnalyzing}
                      className="text-xs text-gray-500 hover:text-gray-400 flex items-center space-x-1 transition-colors"
                    >
                      {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                      <span>{isAnalyzing ? 'Re-analyzing...' : 'Re-run analysis'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Abandoned Banner ────────────────────────────────── */}
        {(racesData as any)?.abandoned_count > 0 && (
          <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/30 flex items-center space-x-3">
            <span className="text-red-400 text-lg flex-shrink-0">&#x26A0;</span>
            <p className="text-sm">
              <span className="text-red-400 font-semibold">Meeting Abandoned</span>
              <span className="text-gray-400"> — {(racesData as any).abandoned_courses?.join(', ')} ({(racesData as any).abandoned_count} race{(racesData as any).abandoned_count > 1 ? 's' : ''} removed)</span>
            </p>
          </div>
        )}

        {/* ── Date Navigation ────────────────────────────────── */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <button onClick={goToPreviousDay} className="p-2 text-gray-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-semibold text-white">{formatDate(selectedDate)}</div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={ukToday}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm mt-1 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
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

        {/* ── Search ──────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by course name..."
            className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
          />
        </div>

        {/* ── Loading ─────────────────────────────────────────── */}
        {(isLoading || isFetching) && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
              <span className="text-gray-400">{isFetching && !isLoading ? 'Refreshing...' : 'Loading results...'}</span>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load results. Please try again.</p>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────── */}
        {!isLoading && !isFetching && completed.length === 0 && pending.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {searchTerm ? 'No races found' : isToday ? 'No Results Yet' : 'No races on this date'}
            </h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try a different search term' : isToday ? 'Results will appear here as races finish' : 'Try selecting a different date'}
            </p>
          </div>
        )}

        {/* ── Completed Races ─────────────────────────────────── */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h2 className="text-base font-semibold text-gray-300">Completed Races</h2>
            </div>

            {completed.map((race) => {
              const isExpanded = expandedRaces.has(race.race_id)
              const runners = (race.runners || []).slice().sort((a, b) => {
                if (a.position == null && b.position == null) return 0
                if (a.position == null) return 1
                if (b.position == null) return -1
                return a.position - b.position
              })
              const top3 = runners.filter(r => r.position != null && r.position <= 3)
              const rest = runners.filter(r => r.position == null || r.position > 3)
              const mlPick = getMlPredictedWinner(race)
              const winner = runners.find(r => r.position === 1)

              // Check if ML predicted the winner
              const mlGotItRight = mlPick && winner &&
                bareHorseName(mlPick.horse_name) === bareHorseName(winner.horse)

              return (
                <div key={race.race_id} className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden">
                  {/* Race header */}
                  <Link to={`/race/${race.race_id}`} className="block p-4 hover:bg-gray-800/90 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-base font-semibold text-white">{race.course_name}</h3>
                          <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-medium">{race.race_class}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTime(race.off_time)}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{race.distance}</span>
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{race.field_size} ran</span>
                          {race.prize && <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />&pound;{race.prize.replace(/[£,]/g, '')}</span>}
                          <span className="text-gray-500">Going: {race.going}</span>
                        </div>
                      </div>
                      <span className="text-xs bg-green-500/15 text-green-400 px-2 py-1 rounded font-medium">Result</span>
                    </div>
                  </Link>

                  {/* Top 3 finishers */}
                  <div className="px-4 pb-2 space-y-1.5">
                    {top3.map(runner => {
                      const badge = positionBadge(runner.position)
                      const isMlPick = mlPick && bareHorseName(mlPick.horse_name) === bareHorseName(runner.horse)
                      return (
                        <div key={runner.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-700/30 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${badge.bg} ${badge.text}`}>
                              {runner.position}
                            </div>
                            {runner.number > 0 && (
                              <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                {runner.number}
                              </div>
                            )}
                            <div>
                              <div className="text-white text-sm font-medium flex items-center gap-2">
                                {runner.horse}
                                {isMlPick && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                    runner.position === 1 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/15 text-yellow-500'
                                  }`}>
                                    {runner.position === 1 ? 'ML Winner ✓' : 'ML Pick'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 text-right">
                            {runner.btn != null && runner.position !== 1 && (
                              <span className="text-xs text-gray-400">{runner.btn} len</span>
                            )}
                            {runner.sp && (
                              <span className="text-sm text-gray-200 font-mono min-w-[48px] text-right">{runner.sp}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* ML prediction callout */}
                  {mlPick && (
                    <div className={`mx-4 mb-2 px-3 py-1.5 rounded-lg text-xs ${
                      mlGotItRight
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-gray-700/40 text-gray-400'
                    }`}>
                      <span className="font-medium">ML Pick:</span>{' '}
                      {mlPick.horse_name}
                      {mlPick.ensemble_proba != null && (
                        <span className="text-gray-500 ml-1">
                          ({(() => {
                            const normMap = normalizeField(race.topEntries || [], 'ensemble_proba', 'horse_id')
                            const norm = normMap.get(String(mlPick.horse_id))
                            return norm != null ? formatNormalized(norm) : `${(mlPick.ensemble_proba * 100).toFixed(1)}%`
                          })()})
                        </span>
                      )}
                      {mlGotItRight
                        ? <span className="ml-2 text-green-400 font-semibold">— Correct!</span>
                        : winner && <span className="ml-2">— Finished: {
                          (() => {
                            const matched = runners.find(r => bareHorseName(r.horse) === bareHorseName(mlPick.horse_name))
                            const pos = matched?.position
                            if (pos) return `${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}`
                            return parseNonFinishOutcome(matched)
                          })()
                        }</span>
                      }
                    </div>
                  )}
                  {/* Show if original ML top pick didn't finish */}
                  {race.topEntries && race.topEntries.length > 0 && mlPick && 
                   bareHorseName(race.topEntries[0].horse_name) !== bareHorseName(mlPick.horse_name) && (
                    <div className="mx-4 mb-2 px-3 py-1 rounded text-[10px] text-gray-500 bg-gray-800/30">
                      {(() => {
                        const origName = race.topEntries[0].horse_name
                        const origRunner = runners.find(r => bareHorseName(r.horse) === bareHorseName(origName))
                        if (!origRunner) {
                          return `Original top pick ${origName} was N/R — pick moved to next best finisher`
                        }
                        const outcome = parseNonFinishOutcome(origRunner)
                        return `Original top pick ${origName} — ${outcome} — pick moved to next best finisher`
                      })()}
                    </div>
                  )}

                  {/* Expand button for full finishing order */}
                  {rest.length > 0 && (
                    <button
                      onClick={() => toggleExpand(race.race_id)}
                      className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700/50 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {isExpanded ? 'Hide full order' : `Show all ${runners.length} finishers`}
                    </button>
                  )}

                  {/* Expanded finishing order */}
                  {isExpanded && rest.length > 0 && (
                    <div className="px-4 pb-3 space-y-1 border-t border-gray-700/50 pt-2">
                      {rest.map(runner => {
                        const badge = positionBadge(runner.position)
                        return (
                          <div key={runner.id} className="flex items-center justify-between py-1 px-3 bg-gray-700/20 rounded">
                            <div className="flex items-center space-x-3">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                                {runner.position ?? '-'}
                              </div>
                              {runner.number > 0 && (
                                <span className="text-xs text-gray-500 w-5 text-center">{runner.number}</span>
                              )}
                              <span className="text-gray-300 text-sm">{runner.horse}</span>
                            </div>
                            <div className="flex items-center space-x-4 text-right">
                              {runner.ovr_btn != null && (
                                <span className="text-xs text-gray-500">{runner.ovr_btn} btn</span>
                              )}
                              {runner.sp && (
                                <span className="text-xs text-gray-400 font-mono">{runner.sp}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {runners[0]?.time && (
                        <div className="text-xs text-gray-500 text-center mt-2">
                          Winning time: {runners[0].time}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Pending Races (today only) ──────────────────────── */}
        {isToday && pending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Timer className="w-5 h-5 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-300">Awaiting Results</h2>
            </div>

            {pending.map(race => (
              <Link key={race.race_id} to={`/race/${race.race_id}`} className="block">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 opacity-60 hover:opacity-80 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-3 mb-1">
                        <h3 className="text-base font-medium text-gray-300">{race.course_name}</h3>
                        <span className="bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded text-xs">{race.race_class}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTime(race.off_time)}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{race.distance}</span>
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{race.field_size} runners</span>
                      </div>
                    </div>
                    <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-1 rounded">Awaiting Result</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Auto-refresh notice ─────────────────────────────── */}
        {isToday && !isLoading && allRaces.length > 0 && (
          <p className="text-center text-xs text-gray-600 pb-4">
            Results auto-refresh every 60 seconds
          </p>
        )}
      </div>
    </AppLayout>
  )
}
