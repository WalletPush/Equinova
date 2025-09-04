import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { ShortlistButton } from '@/components/ShortlistButton'
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
  races_won: number
  races_lost: number
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
}

interface MLTrackerData {
  models: MLModelPerformance[]
  last_updated: string
  total_races_today: number
}

const modelConfig = {
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

export function MLTrackerPage() {
  const { profile } = useAuth()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch ML tracker data
  const { data: mlTrackerData, isLoading, error, refetch } = useQuery({
    queryKey: ['ml-tracker', new Date().toISOString().split('T')[0]], // Refresh daily
    queryFn: async () => {
      console.log('Fetching ML tracker data...')
      const { data, error } = await supabase.functions.invoke('get-ml-tracker', {
        body: {}
      })
      
      if (error) {
        console.error('Error invoking ML tracker API:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('ML tracker API returned error:', data.error)
        throw new Error(data.error?.message || 'ML tracker API failed')
      }
      
      console.log('ML tracker data fetched successfully:', data.data)
      return data.data as MLTrackerData
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

  const getPerformanceTrend = (winRate: number): 'hot' | 'cold' | 'normal' => {
    if (winRate >= 40) return 'hot'
    if (winRate <= 10) return 'cold'
    return 'normal'
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
    
    const racesWithoutWin = model.total_races_today - model.races_won
    return `${racesWithoutWin} races without a win - due for a winner!`
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Brain className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-pulse" />
            <h2 className="text-xl font-semibold text-white mb-2">Loading ML Tracker</h2>
            <p className="text-gray-400">Fetching today's model performance...</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <Trophy className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-gray-400 text-sm">Best Model Today</p>
                <p className="text-xl font-bold text-white">
                  {mlTrackerData?.models?.reduce((best, current) => 
                    current.win_rate > best.win_rate ? current : best
                  )?.full_name || 'N/A'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <Activity className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-gray-400 text-sm">Active Models</p>
                <p className="text-2xl font-bold text-white">
                  {mlTrackerData?.models?.filter(m => m.total_races_today > 0).length || 0}/5
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {mlTrackerData?.models?.map((model) => {
            const config = modelConfig[model.model_name as keyof typeof modelConfig]
            const IconComponent = config.icon
            const trend = getPerformanceTrend(model.win_rate)
            
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
                  {getTrendIcon(trend)}
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{model.total_races_today}</p>
                    <p className="text-xs text-gray-400">Races Run</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-400">{model.races_won}</p>
                    <p className="text-xs text-gray-400">Won</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-400">{model.races_lost}</p>
                    <p className="text-xs text-gray-400">Lost</p>
                  </div>
                </div>

                {/* Win Rate */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Win Rate</span>
                    <span className={`text-lg font-bold ${
                      model.win_rate >= 30 ? 'text-green-400' : 
                      model.win_rate >= 20 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {model.win_rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
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
