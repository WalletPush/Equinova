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
 * Try to get race results from multiple sources:
 * 1. race_runners table (populated by fetch-race-results edge function)
 * 2. race_entries.finishing_position (populated by update-race-results-and-bets)
 * 3. ml_model_race_results table (populated by populate-ml-performance-data)
 */
async function fetchRacePositions(
  raceIds: string[]
): Promise<{ positions: Record<string, Record<string, number>>; source: string }> {
  // positions = { race_id -> { horse_id -> finishing_position } }
  const positions: Record<string, Record<string, number>> = {}

  // Source 1: race_runners table
  try {
    const batchSize = 50
    let allRunners: any[] = []
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize)
      const { data: runners, error } = await supabase
        .from('race_runners')
        .select('race_id, horse_id, position, horse')
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
        positions[r.race_id][r.horse_id] = Number(r.position)
      }
      console.log(`ML Tracker: Got ${allRunners.length} results from race_runners for ${Object.keys(positions).length} races`)
      return { positions, source: 'race_runners' }
    }
    console.log('ML Tracker: race_runners returned no data')
  } catch (e) {
    console.warn('ML Tracker: race_runners query failed:', e)
  }

  // Source 2: race_entries.finishing_position
  try {
    const batchSize = 50
    let allEntries: any[] = []
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize)
      const { data: entries, error } = await supabase
        .from('race_entries')
        .select('race_id, horse_id, finishing_position')
        .in('race_id', batch)
        .not('finishing_position', 'is', null)
        .gt('finishing_position', 0)
      if (!error && entries && entries.length > 0) {
        allEntries = allEntries.concat(entries)
      }
    }
    if (allEntries.length > 0) {
      for (const e of allEntries) {
        if (!positions[e.race_id]) positions[e.race_id] = {}
        positions[e.race_id][e.horse_id] = Number(e.finishing_position)
      }
      console.log(`ML Tracker: Got ${allEntries.length} results from race_entries.finishing_position for ${Object.keys(positions).length} races`)
      return { positions, source: 'race_entries' }
    }
    console.log('ML Tracker: race_entries.finishing_position all null')
  } catch (e) {
    console.warn('ML Tracker: race_entries finishing_position query failed:', e)
  }

  // Source 3: ml_model_race_results
  try {
    const today = getUKDate()
    const { data: mlResults, error } = await supabase
      .from('ml_model_race_results')
      .select('race_id, horse_id, actual_position, is_winner, model_name')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lt('created_at', `${today}T23:59:59.999Z`)
    if (!error && mlResults && mlResults.length > 0) {
      for (const r of mlResults) {
        if (!positions[r.race_id]) positions[r.race_id] = {}
        if (r.actual_position && r.actual_position > 0) {
          positions[r.race_id][r.horse_id] = Number(r.actual_position)
        }
      }
      console.log(`ML Tracker: Got ${mlResults.length} results from ml_model_race_results for ${Object.keys(positions).length} races`)
      return { positions, source: 'ml_model_race_results' }
    }
    console.log('ML Tracker: ml_model_race_results empty for today')
  } catch (e) {
    console.warn('ML Tracker: ml_model_race_results query failed:', e)
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

      // Step 1: Get all today's races
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('race_id, off_time, course_name, date')
        .eq('date', today)

      if (racesError) {
        console.error('ML Tracker: Failed to fetch races:', racesError)
        throw new Error('Failed to fetch races: ' + racesError.message)
      }

      if (!races || races.length === 0) {
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
          results_source: 'none'
        }
      }

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

          // Find the model's top pick
          let topPick: any = null
          let topProba = -1
          for (const entry of entries) {
            const proba = Number(entry[probaField]) || 0
            if (proba > topProba) {
              topProba = proba
              topPick = entry
            }
          }

          if (!topPick || topProba <= 0) continue

          // Look up this horse's finishing position
          const pos = racePositions[topPick.horse_id]
          if (!pos || pos < 1) continue // No result for this horse

          const isWinner = pos === 1
          const isTop3 = pos >= 1 && pos <= 3

          if (isWinner) racesWon++
          else racesLost++
          if (isTop3) racesTop3++

          raceResults.push({
            race_id: raceId,
            course: raceInfo?.course_name || 'Unknown',
            off_time: raceInfo?.off_time || '',
            horse_name: topPick.horse_name || 'Unknown',
            probability: topProba,
            finishing_position: pos,
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
        results_source: source
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
    setFetchStatus('Triggering result fetching...')
    try {
      // First try calling the race-results-scheduler
      try {
        setFetchStatus('Calling race-results-scheduler...')
        const { data: schedulerData, error: schedulerError } = await supabase.functions.invoke('race-results-scheduler', {
          body: { limit: 50, rateMs: 300 }
        })
        if (!schedulerError && schedulerData) {
          const readyCount = schedulerData.ready_count || schedulerData.data?.ready_count || 0
          const msg = schedulerData.message || schedulerData.data?.message || ''
          setFetchStatus(`Scheduler: ${msg} (${readyCount} results fetched)`)
          if (readyCount > 0) {
            // Results were fetched - now trigger update-race-results-and-bets for each
            // and refresh the tracker
            await new Promise(r => setTimeout(r, 2000))
            await refetch()
            setFetchStatus(`Done! ${readyCount} race results fetched and loaded.`)
            return
          }
        }
      } catch (schedulerErr) {
        console.warn('race-results-scheduler failed, trying individual fetch:', schedulerErr)
      }

      // Fallback: fetch results one by one for completed races
      const today = getUKDate()
      const { data: races } = await supabase
        .from('races')
        .select('race_id, off_time')
        .eq('date', today)

      if (!races || races.length === 0) {
        setFetchStatus('No races found for today')
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

      setFetchStatus(`Fetching results for ${completedRaces.length} completed races...`)
      let fetched = 0
      let errors = 0

      for (let i = 0; i < completedRaces.length; i++) {
        const race = completedRaces[i]
        setFetchStatus(`Fetching ${i + 1}/${completedRaces.length}: ${race.race_id}...`)
        try {
          const { data, error } = await supabase.functions.invoke('fetch-race-results', {
            body: { race_id: race.race_id }
          })
          if (!error && data?.success) {
            fetched++
            // Also trigger the update function to write finishing_position back
            try {
              await supabase.functions.invoke('update-race-results-and-bets', {
                body: { race_id: race.race_id }
              })
            } catch { /* ignore */ }
          }
        } catch (e) {
          errors++
          console.warn(`Failed to fetch results for ${race.race_id}:`, e)
        }
        // Small delay to avoid rate limiting
        if (i < completedRaces.length - 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }

      setFetchStatus(`Done! Fetched ${fetched} results (${errors} errors). Refreshing...`)
      await new Promise(r => setTimeout(r, 1000))
      await refetch()
      setFetchStatus(`Complete: ${fetched} race results loaded.`)
    } catch (err: any) {
      console.error('Error fetching results:', err)
      setFetchStatus(`Error: ${err.message || 'Failed to fetch results'}`)
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

        {/* Fetch Results Banner - shown when no results are available */}
        {hasNoResults && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6 text-yellow-400" />
                <div>
                  <h3 className="text-yellow-400 font-semibold">No Race Results Found</h3>
                  <p className="text-gray-400 text-sm">
                    Race results need to be fetched from the Racing API. Click "Fetch Results" to pull in today's finished race results.
                  </p>
                </div>
              </div>
              <button
                onClick={handleFetchResults}
                disabled={isFetchingResults}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-500/50 text-gray-900 font-semibold px-4 py-2 rounded-lg transition-colors flex items-center space-x-2 whitespace-nowrap"
              >
                <Download className={`w-4 h-4 ${isFetchingResults ? 'animate-bounce' : ''}`} />
                <span>{isFetchingResults ? 'Fetching...' : 'Fetch Results'}</span>
              </button>
            </div>
            {fetchStatus && (
              <p className="mt-3 text-sm text-gray-300 bg-gray-800/50 p-2 rounded">
                {fetchStatus}
              </p>
            )}
          </div>
        )}

        {/* Data source indicator */}
        {mlTrackerData?.results_source && mlTrackerData.results_source !== 'none' && (
          <div className="mb-4 text-xs text-gray-500">
            Results source: {mlTrackerData.results_source}
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
                        No results yet — click "Fetch Results" above
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
