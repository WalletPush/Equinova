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
  Award,
  BarChart3,
  PieChart,
  Zap,
  AlertCircle,
  Calendar,
  RefreshCw,
  Sparkles,
  Trophy,
  Activity,
  Clock,
  Download,
  Star,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Crown
} from 'lucide-react'

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
  race_results: {
    race_id: string
    course: string
    off_time: string
    horse_name: string
    probability: number
    finishing_position: number | null
    is_winner: boolean
  }[]
}

interface MLTrackerData {
  models: MLModelPerformance[]
  last_updated: string
  total_races_today: number
  completed_races: number
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

export function MLTrackerPage() {
  const { profile } = useAuth()
  const [isRefreshing, setIsRefreshing] = useState(false)

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
        console.log('ML Tracker: No races found for today')
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
          completed_races: 0
        }
      }

      const raceIds = races.map(r => r.race_id)
      console.log(`ML Tracker: Found ${races.length} races, fetching entries...`)

      // Step 2: Get all race entries with ML predictions and finishing positions
      // Supabase .in() has a limit, so batch if needed
      const batchSize = 50
      let allEntries: any[] = []

      for (let i = 0; i < raceIds.length; i += batchSize) {
        const batch = raceIds.slice(i, i + batchSize)
        const { data: entries, error: entriesError } = await supabase
          .from('race_entries')
          .select('race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, silk_url, number, finishing_position, result_updated_at, mlp_proba, rf_proba, xgboost_proba, benter_proba, ensemble_proba')
          .in('race_id', batch)

        if (entriesError) {
          console.error('ML Tracker: Failed to fetch entries batch:', entriesError)
          continue
        }
        if (entries) allEntries = allEntries.concat(entries)
      }

      console.log(`ML Tracker: Got ${allEntries.length} entries across ${races.length} races`)

      // Step 3: Build a map of race_id -> entries
      const raceEntriesMap: Record<string, any[]> = {}
      for (const entry of allEntries) {
        if (!raceEntriesMap[entry.race_id]) raceEntriesMap[entry.race_id] = []
        raceEntriesMap[entry.race_id].push(entry)
      }

      // Step 4: Build a map of race_id -> race info
      const raceInfoMap: Record<string, any> = {}
      for (const race of races) {
        raceInfoMap[race.race_id] = race
      }

      // Step 5: Determine which races have results (at least one entry has finishing_position)
      const completedRaceIds = new Set<string>()
      for (const [raceId, entries] of Object.entries(raceEntriesMap)) {
        if (entries.some(e => e.finishing_position != null && e.finishing_position > 0)) {
          completedRaceIds.add(raceId)
        }
      }

      console.log(`ML Tracker: ${completedRaceIds.size} races have results`)

      // Step 6: Current time for finding next runner
      const currentTime = getUKTime()
      const [curH, curM] = currentTime.split(':').map(Number)
      const curMinutes = curH * 60 + curM

      // Step 7: Compute performance for each model
      const modelPerformance: MLModelPerformance[] = []

      for (const modelName of MODEL_NAMES) {
        const probaField = PROBA_FIELDS[modelName]
        const raceResults: MLModelPerformance['race_results'] = []
        let racesWon = 0
        let racesLost = 0
        let racesTop3 = 0

        // Process each completed race
        for (const raceId of completedRaceIds) {
          const entries = raceEntriesMap[raceId] || []
          const raceInfo = raceInfoMap[raceId]

          // Find the model's top pick (highest probability)
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

          const pos = Number(topPick.finishing_position)
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

        // Sort race results chronologically
        raceResults.sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

        const totalCompleted = racesWon + racesLost
        const winRate = totalCompleted > 0 ? (racesWon / totalCompleted) * 100 : 0

        // Find next upcoming runner for this model
        let nextRunner: MLModelPerformance['next_runner'] = undefined

        // Sort all races chronologically and find the first upcoming one
        const sortedRaces = [...races].sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

        for (const race of sortedRaces) {
          const raceMin = raceTimeToMinutes(race.off_time)
          if (raceMin <= curMinutes) continue // Race already started
          if (completedRaceIds.has(race.race_id)) continue // Already has results

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

        // Check if model is "due a winner"
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
        completed_races: completedRaceIds.size
      }
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 // Auto-refresh every minute
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

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ML Model Tracker</h1>
            <p className="text-gray-400">Real-time performance tracking for today's races</p>
          </div>
          <div className="flex items-center space-x-4">
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
                <p className="text-gray-400 text-sm">Completed Races</p>
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
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {model.race_results.map((result) => (
                        <div key={result.race_id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-800/50">
                          <div className="flex items-center space-x-2 truncate">
                            {result.is_winner ? (
                              <Trophy className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                            ) : (
                              <span className="w-3 h-3 flex items-center justify-center text-gray-500 flex-shrink-0">
                                {result.finishing_position || '-'}
                              </span>
                            )}
                            <span className="text-gray-300 truncate">{result.horse_name}</span>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <span className="text-gray-500">{result.course}</span>
                            <span className="text-gray-500">{formatTime(result.off_time)}</span>
                            <span className={result.is_winner ? 'text-green-400 font-bold' : 'text-red-400'}>
                              P{result.finishing_position}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results yet info */}
                {model.race_results.length === 0 && model.total_races_today > 0 && (
                  <div className="mb-4 p-3 bg-gray-700/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-400">
                        No race results yet — {model.total_races_today} races scheduled
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
