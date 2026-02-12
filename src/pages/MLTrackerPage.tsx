import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { ShortlistButton } from '@/components/ShortlistButton'
import { getUKDate, getUKTime, raceTimeToMinutes, formatTime, compareRaceTimes } from '@/lib/dateUtils'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Zap,
  AlertCircle,
  Calendar,
  RefreshCw,
  Trophy,
  Activity,
  Clock,
  CheckCircle,
  Minus,
  Crown,
  Download
} from 'lucide-react'

interface RaceResult {
  race_id: string
  course: string
  off_time: string
  horse_name: string
  probability: number
  finishing_position: number | null
  is_winner: boolean
}

interface MLModelPerformance {
  model_name: string
  full_name: string
  total_races_today: number
  races_completed: number
  races_won: number
  races_lost: number
  races_top3: number
  win_rate: number
  next_runner?: {
    horse_name: string
    odds: string
    trainer: string
    jockey: string
    confidence: number
    race_time: string
    course: string
    race_id: string
    horse_id: string
  }
  is_due_winner: boolean
  performance_trend: 'hot' | 'cold' | 'normal'
  race_results: RaceResult[]
}

interface MLTrackerData {
  models: MLModelPerformance[]
  last_updated: string
  total_races_today: number
  completed_races: number
  results_source: string
  abandoned_courses: string[]
  abandoned_count: number
}

const MODEL_NAMES = ['mlp', 'rf', 'xgboost', 'benter', 'ensemble'] as const
type ModelName = typeof MODEL_NAMES[number]

const modelConfig: Record<ModelName, {
  full_name: string
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
}> = {
  mlp: {
    full_name: 'Multi-Layer Perceptron',
    icon: Brain,
    color: 'from-blue-500 to-blue-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30'
  },
  rf: {
    full_name: 'Random Forest',
    icon: BarChart3,
    color: 'from-green-500 to-green-600',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30'
  },
  xgboost: {
    full_name: 'XGBoost',
    icon: Zap,
    color: 'from-purple-500 to-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30'
  },
  benter: {
    full_name: 'Light GBM',
    icon: Target,
    color: 'from-orange-500 to-orange-600',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30'
  },
  ensemble: {
    full_name: 'Ensemble Model',
    icon: Crown,
    color: 'from-yellow-500 to-yellow-600',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30'
  }
}

const PROBA_FIELDS: Record<ModelName, string> = {
  mlp: 'mlp_proba',
  rf: 'rf_proba',
  xgboost: 'xgboost_proba',
  benter: 'benter_proba',
  ensemble: 'ensemble_proba'
}

/**
 * Strip country suffix e.g. "(IRE)", "(GB)", "(FR)" for name matching
 */
function bareHorseName(name: string): string {
  return name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
}

/**
 * Fetch actual race results from race_runners table.
 * Returns positions keyed by bare horse name (lowercase, no country suffix)
 * so we can match against race_entries.horse_name reliably.
 */
async function fetchRacePositions(
  raceIds: string[]
): Promise<{ positions: Record<string, Record<string, number>>; source: string }> {
  // positions = { race_id -> { bareHorseName -> finishing_position } }
  const positions: Record<string, Record<string, number>> = {}

  try {
    const batchSize = 50
    let allRunners: any[] = []
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize)
      const { data: runners, error } = await supabase
        .from('race_runners')
        .select('race_id, position, horse')
        .in('race_id', batch)
        .not('position', 'is', null)
        .gt('position', 0)
      if (!error && runners && runners.length > 0) {
        allRunners = allRunners.concat(runners)
      }
    }
    if (allRunners.length > 0) {
      for (const r of allRunners) {
        if (!positions[r.race_id]) positions[r.race_id] = {}
        positions[r.race_id][bareHorseName(r.horse)] = Number(r.position)
      }
      console.log(`ML Tracker: Got ${allRunners.length} results from race_runners for ${Object.keys(positions).length} races`)
      return { positions, source: 'race_runners' }
    }
    console.log('ML Tracker: race_runners returned no data')
  } catch (e) {
    console.warn('ML Tracker: race_runners query failed:', e)
  }

  return { positions, source: 'none' }
}

export function MLTrackerPage() {
  const { profile } = useAuth()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isFetchingResults, setIsFetchingResults] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<string | null>(null)

  // Compute ML tracker data entirely client-side
  const { data: mlTrackerData, isLoading, error, refetch } = useQuery({
    queryKey: ['ml-tracker-client', getUKDate()],
    queryFn: async (): Promise<MLTrackerData> => {
      const today = getUKDate()
      console.log('ML Tracker: Fetching races for', today)

      // Step 1: Get all today's races (including going and is_abandoned to detect abandoned)
      const { data: allRaces, error: racesError } = await supabase
        .from('races')
        .select('race_id, off_time, course_name, date, going, is_abandoned, race_status')
        .eq('date', today)

      if (racesError) {
        console.error('ML Tracker: Failed to fetch races:', racesError)
        throw new Error('Failed to fetch races: ' + racesError.message)
      }

      if (!allRaces || allRaces.length === 0) {
        return {
          models: MODEL_NAMES.map(name => ({
            model_name: name,
            full_name: modelConfig[name].full_name,
            total_races_today: 0,
            races_completed: 0,
            races_won: 0,
            races_lost: 0,
            races_top3: 0,
            win_rate: 0,
            is_due_winner: false,
            performance_trend: 'normal' as const,
            race_results: []
          })),
          last_updated: new Date().toISOString(),
          total_races_today: 0,
          completed_races: 0,
          results_source: 'none',
          abandoned_courses: [],
          abandoned_count: 0
        }
      }

      // Filter out abandoned races (check going field, is_abandoned column, and race_status)
      const isAbandoned = (r: any) =>
        r.going?.toLowerCase() === 'abandoned' ||
        r.is_abandoned === true ||
        r.race_status === 'abandoned'
      const abandonedRaceIds = new Set(
        allRaces.filter(isAbandoned).map(r => r.race_id)
      )
      const abandonedCourses = [...new Set(
        allRaces.filter(isAbandoned).map(r => r.course_name)
      )]
      const races = allRaces.filter(r => !isAbandoned(r))
      
      console.log(`ML Tracker: ${allRaces.length} total races, ${abandonedRaceIds.size} abandoned (${abandonedCourses.join(', ')}), ${races.length} active`)

      const raceIds = races.map(r => r.race_id)
      console.log(`ML Tracker: Found ${races.length} races, fetching entries and results...`)

      // Step 2: Get all race entries with ML predictions
      const batchSize = 50
      let allEntries: any[] = []
      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries, error: entriesError } = await supabase
          .from('race_entries')
          .select('race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, silk_url, number, mlp_proba, rf_proba, xgboost_proba, benter_proba, ensemble_proba')
          .in('race_id', batch)
        if (!entriesError && entries) allEntries = allEntries.concat(entries)
      }

      console.log(`ML Tracker: Got ${allEntries.length} entries`)

      // Step 3: Get actual race results from any available source
      const { positions, source } = await fetchRacePositions(raceIds)
      const completedRaceIds = new Set(Object.keys(positions))
      console.log(`ML Tracker: ${completedRaceIds.size} completed races (source: ${source})`)

      // Step 4: Build maps
      const raceEntriesMap: Record<string, any[]> = {}
      for (const entry of allEntries) {
        if (!raceEntriesMap[entry.race_id]) raceEntriesMap[entry.race_id] = []
        raceEntriesMap[entry.race_id].push(entry)
      }

      const raceInfoMap: Record<string, any> = {}
      for (const race of races) {
        raceInfoMap[race.race_id] = race
      }

      // Step 5: Current time for upcoming races
      const currentTime = getUKTime()
      const [curH, curM] = currentTime.split(':').map(Number)
      const curMinutes = curH * 60 + curM

      // Step 6: Compute performance for each model
      const modelPerformance: MLModelPerformance[] = []

      for (const modelName of MODEL_NAMES) {
        const probaField = PROBA_FIELDS[modelName]
        const raceResults: RaceResult[] = []
        let racesWon = 0
        let racesLost = 0
        let racesTop3 = 0

        for (const raceId of completedRaceIds) {
          const entries = raceEntriesMap[raceId] || []
          const raceInfo = raceInfoMap[raceId]
          const racePositions = positions[raceId] || {}

          // Sort entries by model probability (descending) to find best pick
          const sortedEntries = entries
            .map((entry: any) => ({ entry, proba: Number(entry[probaField]) || 0 }))
            .filter((e: any) => e.proba > 0)
            .sort((a: any, b: any) => b.proba - a.proba)

          if (sortedEntries.length === 0) continue

          // Walk down the ranked picks to find the highest-rated horse that actually ran.
          // If the top pick was a non-runner, fall through to the next best pick.
          let matchedPick: any = null
          let matchedProba = 0
          let matchedPos: number | undefined

          for (const { entry, proba } of sortedEntries) {
            const bareName = bareHorseName(entry.horse_name)
            // Try exact bare match first
            let pos = racePositions[bareName]
            // Fuzzy fallback: startsWith in either direction for slight name discrepancies
            if (pos === undefined) {
              for (const [resultName, resultPos] of Object.entries(racePositions)) {
                if (resultName.startsWith(bareName) || bareName.startsWith(resultName)) {
                  pos = resultPos
                  break
                }
              }
            }
            if (pos !== undefined) {
              matchedPick = entry
              matchedProba = proba
              matchedPos = pos
              break
            }
            // This horse was a non-runner (not in results) — try next pick
          }

          // If no pick could be matched to results at all, skip this race entirely
          if (!matchedPick || matchedPos === undefined) continue

          const isWinner = matchedPos === 1
          const isTop3 = matchedPos >= 1 && matchedPos <= 3

          if (isWinner) racesWon++
          else racesLost++
          if (isTop3) racesTop3++

          raceResults.push({
            race_id: raceId,
            course: raceInfo?.course_name || 'Unknown',
            off_time: raceInfo?.off_time || '',
            horse_name: matchedPick.horse_name || 'Unknown',
            probability: matchedProba,
            finishing_position: matchedPos,
            is_winner: isWinner
          })
        }

        raceResults.sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

        const totalCompleted = racesWon + racesLost
        const winRate = totalCompleted > 0 ? (racesWon / totalCompleted) * 100 : 0

        // Find next upcoming runner
        let nextRunner: MLModelPerformance['next_runner'] = undefined
        const sortedRaces = [...races].sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

        for (const race of sortedRaces) {
          const raceMin = raceTimeToMinutes(race.off_time)
          if (raceMin <= curMinutes) continue
          if (completedRaceIds.has(race.race_id)) continue

          const entries = raceEntriesMap[race.race_id] || []
          let topEntry: any = null
          let topProba = -1
          for (const entry of entries) {
            const proba = Number(entry[probaField]) || 0
            if (proba > topProba) {
              topProba = proba
              topEntry = entry
            }
          }

          if (topEntry && topProba > 0) {
            nextRunner = {
              horse_name: topEntry.horse_name || 'Unknown',
              odds: topEntry.current_odds ? `${topEntry.current_odds}/1` : 'N/A',
              trainer: topEntry.trainer_name || 'N/A',
              jockey: topEntry.jockey_name || 'N/A',
              confidence: topProba * 100,
              race_time: formatTime(race.off_time),
              course: race.course_name || 'N/A',
              race_id: race.race_id,
              horse_id: topEntry.horse_id
            }
            break
          }
        }

        const racesWithoutWin = totalCompleted - racesWon
        const isDueWinner = racesWithoutWin >= 5 && winRate < 20

        modelPerformance.push({
          model_name: modelName,
          full_name: modelConfig[modelName].full_name,
          total_races_today: races.length,
          races_completed: totalCompleted,
          races_won: racesWon,
          races_lost: racesLost,
          races_top3: racesTop3,
          win_rate: winRate,
          next_runner: nextRunner,
          is_due_winner: isDueWinner,
          performance_trend: winRate >= 40 ? 'hot' : winRate <= 10 && totalCompleted > 0 ? 'cold' : 'normal',
          race_results: raceResults
        })
      }

      return {
        models: modelPerformance,
        last_updated: new Date().toISOString(),
        total_races_today: races.length,
        completed_races: completedRaceIds.size,
        results_source: source,
        abandoned_courses: abandonedCourses,
        abandoned_count: abandonedRaceIds.size
      }
    },
    staleTime: 1000 * 30,
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60
  })

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } catch (error) {
      console.error('Error refreshing ML tracker:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Trigger result fetching for completed races that don't have results yet
  const handleFetchResults = async () => {
    setIsFetchingResults(true)
    setFetchStatus('Checking for completed race results...')
    try {
      // First try the batch scheduler
      try {
        setFetchStatus('Scanning for new results...')
        const { data: schedulerData, error: schedulerError } = await supabase.functions.invoke('race-results-scheduler', {
          body: { limit: 50, rateMs: 300 }
        })
        if (!schedulerError && schedulerData) {
          const readyCount = schedulerData.ready_count || schedulerData.data?.ready_count || 0
          if (readyCount > 0) {
            setFetchStatus(`Found ${readyCount} new results, updating tracker...`)
            await new Promise(r => setTimeout(r, 2000))
            await refetch()
            setFetchStatus(`Done! ${readyCount} new race results loaded.`)
            return
          }
        }
      } catch (schedulerErr) {
        console.warn('Batch scheduler unavailable, trying individual fetch:', schedulerErr)
      }

      // Fallback: fetch results one by one for completed races
      const today = getUKDate()
      const { data: races } = await supabase
        .from('races')
        .select('race_id, off_time, course_name')
        .eq('date', today)

      if (!races || races.length === 0) {
        setFetchStatus('No races scheduled for today.')
        return
      }

      const currentTime = getUKTime()
      const [curH, curM] = currentTime.split(':').map(Number)
      const curMinutes = curH * 60 + curM

      // Find races that should be finished (off_time + 10 min buffer has passed)
      const completedRaces = races.filter(r => {
        const raceMin = raceTimeToMinutes(r.off_time)
        return raceMin > 0 && (curMinutes - raceMin) > 10
      })

      if (completedRaces.length === 0) {
        setFetchStatus('No completed races found yet. Results will appear once races finish.')
        return
      }

      setFetchStatus(`Fetching results for ${completedRaces.length} completed races...`)
      let fetched = 0
      let errors = 0
      let notReady = 0

      for (let i = 0; i < completedRaces.length; i++) {
        const race = completedRaces[i]
        const courseName = race.course_name || 'Race'
        const raceTime = formatTime(race.off_time)
        setFetchStatus(`Loading results (${i + 1}/${completedRaces.length}): ${courseName} ${raceTime}...`)
        try {
          const { data, error } = await supabase.functions.invoke('fetch-race-results', {
            body: { race_id: race.race_id }
          })
          if (!error && data?.success) {
            fetched++
            // Also update finishing positions
            try {
              await supabase.functions.invoke('update-race-results-and-bets', {
                body: { race_id: race.race_id }
              })
            } catch { /* ignore */ }
          } else if (data?.code === 'RESULT_NOT_AVAILABLE') {
            notReady++
          }
        } catch (e) {
          errors++
          console.warn(`Failed to fetch results for ${race.course_name}:`, e)
        }
        // Small delay between requests
        if (i < completedRaces.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      const parts = []
      if (fetched > 0) parts.push(`${fetched} results loaded`)
      if (notReady > 0) parts.push(`${notReady} not yet available`)
      if (errors > 0) parts.push(`${errors} failed`)

      setFetchStatus(`Done! ${parts.join(', ')}. Refreshing tracker...`)
      await new Promise(r => setTimeout(r, 1000))
      await refetch()
      setFetchStatus(`Complete: ${parts.join(', ')}.`)
    } catch (err: any) {
      console.error('Error fetching results:', err)
      setFetchStatus('Something went wrong while fetching results. Please try again.')
    } finally {
      setIsFetchingResults(false)
    }
  }

  const getTrendIcon = (trend: 'hot' | 'cold' | 'normal') => {
    switch (trend) {
      case 'hot':
        return <TrendingUp className="w-5 h-5 text-green-400" />
      case 'cold':
        return <TrendingDown className="w-5 h-5 text-red-400" />
      default:
        return <Minus className="w-5 h-5 text-gray-400" />
    }
  }

  const getDueWinnerMessage = (model: MLModelPerformance) => {
    if (!model.is_due_winner) return null
    const racesWithoutWin = model.races_completed - model.races_won
    return `${racesWithoutWin} races without a win - due for a winner!`
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Brain className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-pulse" />
            <h2 className="text-xl font-semibold text-white mb-2">Loading ML Tracker</h2>
            <p className="text-gray-400">Computing today's model performance...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Error Loading ML Tracker</h2>
            <p className="text-gray-400 mb-4">Failed to load model performance data</p>
            <button
              onClick={handleRefresh}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  const hasNoResults = mlTrackerData?.completed_races === 0 && (mlTrackerData?.total_races_today || 0) > 0

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ML Model Tracker</h1>
            <p className="text-gray-400">Real-time performance tracking for today's races</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className="text-sm text-gray-400">Last Updated</p>
              <p className="text-white font-medium">
                {mlTrackerData?.last_updated ?
                  new Date(mlTrackerData.last_updated).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'Never'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Get Latest Results Banner */}
        <div className="mb-6 p-4 bg-gray-800/80 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {hasNoResults ? (
                <AlertCircle className="w-6 h-6 text-yellow-400" />
              ) : (
                <CheckCircle className="w-6 h-6 text-green-400" />
              )}
              <div>
                {hasNoResults ? (
                  <>
                    <h3 className="text-yellow-400 font-semibold">No Race Results Yet</h3>
                    <p className="text-gray-400 text-sm">
                      Click "Get Latest Results" to pull in the latest finishing positions for completed races.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-green-400 font-semibold">
                      {mlTrackerData?.completed_races || 0} Race Results Loaded
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Click "Get Latest Results" to check for any new results from recently finished races.
                    </p>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={handleFetchResults}
              disabled={isFetchingResults}
              className={`${hasNoResults ? 'bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-500/50 text-gray-900' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white'} font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 whitespace-nowrap`}
            >
              <Download className={`w-4 h-4 ${isFetchingResults ? 'animate-bounce' : ''}`} />
              <span>{isFetchingResults ? 'Loading...' : 'Get Latest Results'}</span>
            </button>
          </div>
          {fetchStatus && (
            <p className="mt-3 text-sm text-gray-300 bg-gray-800/50 p-2 rounded">
              {fetchStatus}
            </p>
          )}
        </div>

        {/* Abandoned Meeting Banner */}
        {mlTrackerData?.abandoned_count && mlTrackerData.abandoned_count > 0 && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <div>
                <h3 className="text-red-400 font-semibold">Meeting Abandoned</h3>
                <p className="text-gray-400 text-sm">
                  {mlTrackerData.abandoned_courses.join(', ')} — {mlTrackerData.abandoned_count} race{mlTrackerData.abandoned_count > 1 ? 's' : ''} abandoned and excluded from results.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <Calendar className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-gray-400 text-sm">Total Races Today</p>
                <p className="text-2xl font-bold text-white">{mlTrackerData?.total_races_today || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-gray-400 text-sm">Results Available</p>
                <p className="text-2xl font-bold text-white">{mlTrackerData?.completed_races || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <Trophy className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-gray-400 text-sm">Best Model Today</p>
                <p className="text-lg font-bold text-white">
                  {(() => {
                    const modelsWithResults = mlTrackerData?.models?.filter(m => m.races_completed > 0) || []
                    if (modelsWithResults.length === 0) return 'N/A'
                    const best = modelsWithResults.reduce((a, b) => a.win_rate > b.win_rate ? a : b)
                    return best.full_name
                  })()}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <Activity className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-gray-400 text-sm">Active Models</p>
                <p className="text-2xl font-bold text-white">
                  {mlTrackerData?.models?.length || 0}/5
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {mlTrackerData?.models?.map((model) => {
            const config = modelConfig[model.model_name as ModelName]
            if (!config) return null
            const IconComponent = config.icon

            return (
              <div
                key={model.model_name}
                className={`${config.bgColor} ${config.borderColor} border rounded-lg p-6 backdrop-blur-sm transition-all duration-200 hover:scale-105`}
              >
                {/* Model Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-r ${config.color}`}>
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{config.full_name}</h3>
                      <p className="text-sm text-gray-400 capitalize">{model.model_name}</p>
                    </div>
                  </div>
                  {getTrendIcon(model.performance_trend)}
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{model.races_completed}</p>
                    <p className="text-xs text-gray-400">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{model.races_won}</p>
                    <p className="text-xs text-gray-400">Won</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{model.races_lost}</p>
                    <p className="text-xs text-gray-400">Lost</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-400">{model.races_top3}</p>
                    <p className="text-xs text-gray-400">Top 3</p>
                  </div>
                </div>

                {/* Win Rate */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Win Rate</span>
                    <span className={`text-lg font-bold ${
                      model.win_rate >= 30 ? 'text-green-400' :
                      model.win_rate >= 20 ? 'text-yellow-400' :
                      model.races_completed === 0 ? 'text-gray-400' : 'text-red-400'
                    }`}>
                      {model.races_completed > 0 ? `${model.win_rate.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        model.win_rate >= 30 ? 'bg-green-500' :
                        model.win_rate >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(model.win_rate, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Due Winner Alert */}
                {model.is_due_winner && (
                  <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-yellow-400 font-medium">
                        {getDueWinnerMessage(model)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Race-by-Race Results */}
                {model.race_results.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Race Results</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {model.race_results.map((result) => (
                        <div key={result.race_id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-gray-800/50">
                          <div className="flex items-center space-x-2 truncate flex-1 min-w-0">
                            {result.is_winner ? (
                              <Trophy className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 flex items-center justify-center text-gray-500 flex-shrink-0 text-[10px]">
                                {result.finishing_position || '-'}
                              </span>
                            )}
                            <span className="text-gray-300 truncate">{result.horse_name}</span>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                            <span className="text-gray-500">{result.course}</span>
                            <span className={`font-bold ${result.is_winner ? 'text-green-400' : result.finishing_position && result.finishing_position <= 3 ? 'text-yellow-400' : 'text-red-400'}`}>
                              P{result.finishing_position}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results yet */}
                {model.race_results.length === 0 && model.total_races_today > 0 && (
                  <div className="mb-4 p-3 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">
                        No results yet — click "Get Latest Results" above
                      </span>
                    </div>
                  </div>
                )}

                {/* Next Runner */}
                {model.next_runner && (
                  <div className="border-t border-gray-600 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-300">Next Runner</h4>
                      <ShortlistButton
                        horseName={model.next_runner.horse_name}
                        raceContext={{
                          race_id: model.next_runner.race_id,
                          course_name: model.next_runner.course,
                          off_time: model.next_runner.race_time
                        }}
                        odds={model.next_runner.odds}
                        jockeyName={model.next_runner.jockey}
                        trainerName={model.next_runner.trainer}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Horse</span>
                        <span className="text-white font-medium">{model.next_runner.horse_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Odds</span>
                        <span className="text-white">{model.next_runner.odds}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Trainer</span>
                        <span className="text-white text-sm">{model.next_runner.trainer}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Jockey</span>
                        <span className="text-white text-sm">{model.next_runner.jockey}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Confidence</span>
                        <span className={`font-bold ${
                          model.next_runner.confidence >= 70 ? 'text-green-400' :
                          model.next_runner.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {model.next_runner.confidence.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Race</span>
                        <span className="text-white text-sm">
                          {model.next_runner.course} - {model.next_runner.race_time}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* No Next Runner */}
                {!model.next_runner && (
                  <div className="border-t border-gray-600 pt-4">
                    <div className="text-center py-4">
                      <Clock className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No upcoming runners</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Empty State */}
        {(!mlTrackerData?.models || mlTrackerData.models.length === 0) && (
          <div className="text-center py-12">
            <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No ML Data Available</h3>
            <p className="text-gray-500">ML model performance data will appear here once races start today.</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
