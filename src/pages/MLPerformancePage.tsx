import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { fetchFromSupabaseFunction } from '@/lib/api'
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
  Minus
} from 'lucide-react'

interface ModelPerformance {
  model_name: string
  winner_accuracy: number
  top3_accuracy: number
  average_confidence: number
  total_races_analyzed: number
  total_predictions: number
  correct_winner_predictions: number
  performance_grade: string
  trend: 'improving' | 'declining' | 'stable'
  consistency: number
}

interface PerformanceData {
  models: ModelPerformance[]
  summary: {
    totalPredictions: number
    avgWinnerAccuracy: number
    avgTop3Accuracy: number
    bestPerformingModel: string
    analysisDate: string
  }
  comparison: ModelPerformance[]
}

interface AIAnalysis {
  analysis: string
  generated_at: string
  analysis_type: string
}

export function MLPerformancePage() {
  const { profile } = useAuth()
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedView, setSelectedView] = useState<'overview' | 'detailed' | 'comparison' | 'ai-insights'>('overview')

  // Check admin access
  if (!profile || profile.role !== 'admin') {
    return (
      <AppLayout>
        <div className="p-4 min-h-screen">
          <div className="max-w-md mx-auto mt-20 text-center">
            <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-300 mb-2">Admin Access Required</h2>
            <p className="text-red-400">Admin access required to view ML performance analysis.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  // Fetch performance data
  const fetchPerformanceData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await fetchFromSupabaseFunction('ml-performance-data')

      if (!response.ok) {
        throw new Error(`Failed to fetch performance data: ${response.status}`)
      }

      const result = await response.json()
      if (result.error) {
        throw new Error(result.error.message)
      }

      setPerformanceData(result.data)
    } catch (err) {
      console.error('Error fetching performance data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load performance data')
    } finally {
      setIsLoading(false)
    }
  }

  // Generate AI analysis
  const generateAIAnalysis = async (analysisType = 'comprehensive') => {
    try {
      setIsAnalyzing(true)
      setError(null)

      if (!profile.openai_api_key) {
        throw new Error('OpenAI API key not configured. Please add it in Settings.')
      }

      const response = await fetchFromSupabaseFunction('ai-model-analysis', {
        method: 'POST',
        body: JSON.stringify({
          openaiApiKey: profile.openai_api_key,
          analysisType
        })
      })

      if (!response.ok) {
        throw new Error(`AI analysis failed: ${response.status}`)
      }

      const result = await response.json()
      if (result.error) {
        throw new Error(result.error.message)
      }

      setAiAnalysis(result.data)
      setSelectedView('ai-insights')
    } catch (err) {
      console.error('Error generating AI analysis:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate AI analysis')
    } finally {
      setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    fetchPerformanceData()
  }, [])

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`
  
  const getPerformanceColor = (accuracy: number) => {
    if (accuracy >= 0.25) return 'text-green-400'
    if (accuracy >= 0.15) return 'text-yellow-400'
    if (accuracy >= 0.10) return 'text-orange-400'
    return 'text-red-400'
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500 text-white'
      case 'B+': return 'bg-green-400 text-gray-900'
      case 'B': return 'bg-yellow-500 text-gray-900'
      case 'B-': return 'bg-yellow-400 text-gray-900'
      case 'C': return 'bg-orange-500 text-white'
      default: return 'bg-red-500 text-white'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <ArrowUp className="w-4 h-4 text-green-400" />
      case 'declining': return <ArrowDown className="w-4 h-4 text-red-400" />
      default: return <Minus className="w-4 h-4 text-gray-400" />
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 min-h-screen">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin mr-3" />
              <span className="text-white text-lg">Loading ML Performance Data...</span>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-4 min-h-screen">
          <div className="max-w-4xl mx-auto mt-20 text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Error Loading Data</h2>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={fetchPerformanceData}
              className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6 min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
              <Brain className="w-8 h-8 text-yellow-400" />
              <span>ML Performance Dashboard</span>
            </h1>
            <p className="text-gray-400 mt-1">Comprehensive machine learning model analysis</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={fetchPerformanceData}
              className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-white">Refresh</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center space-x-1 bg-gray-800/50 p-1 rounded-lg border border-gray-700">
          {[
            { key: 'overview', label: 'Overview', icon: BarChart3 },
            { key: 'detailed', label: 'Detailed Analysis', icon: Target },
            { key: 'comparison', label: 'Model Comparison', icon: Trophy },
            { key: 'ai-insights', label: 'AI Insights', icon: Sparkles }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSelectedView(key as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                selectedView === key
                  ? 'bg-yellow-500 text-gray-900 font-semibold'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Overview Dashboard */}
        {selectedView === 'overview' && performanceData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Summary Cards */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 backdrop-blur-sm border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-300 text-sm font-medium">Best Model</p>
                    <p className="text-white text-lg font-bold capitalize">{performanceData.summary.bestPerformingModel}</p>
                  </div>
                  <Trophy className="w-8 h-8 text-yellow-400" />
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-green-500/20 to-green-600/20 backdrop-blur-sm border border-green-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-300 text-sm font-medium">Avg Winner Accuracy</p>
                    <p className="text-white text-lg font-bold">{formatPercentage(performanceData.summary.avgWinnerAccuracy)}</p>
                  </div>
                  <Target className="w-8 h-8 text-green-400" />
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-300 text-sm font-medium">Avg Top-3 Accuracy</p>
                    <p className="text-white text-lg font-bold">{formatPercentage(performanceData.summary.avgTop3Accuracy)}</p>
                  </div>
                  <Award className="w-8 h-8 text-blue-400" />
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-300 text-sm font-medium">Total Predictions</p>
                    <p className="text-white text-lg font-bold">{performanceData.summary.totalPredictions.toLocaleString()}</p>
                  </div>
                  <PieChart className="w-8 h-8 text-purple-400" />
                </div>
              </div>
            </div>

            {/* Model Performance Cards */}
            <div className="lg:col-span-3">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span>Model Performance Overview</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {performanceData.models.map((model) => (
                  <div key={model.model_name} className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6 hover:border-yellow-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-white capitalize">{model.model_name}</h4>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getGradeColor(model.performance_grade)}`}>
                          {model.performance_grade}
                        </span>
                        {getTrendIcon(model.trend)}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Winner Accuracy</span>
                        <span className={`font-bold ${getPerformanceColor(model.winner_accuracy)}`}>
                          {formatPercentage(model.winner_accuracy)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Top-3 Accuracy</span>
                        <span className="text-white font-medium">{formatPercentage(model.top3_accuracy)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Avg Confidence</span>
                        <span className="text-white font-medium">{formatPercentage(model.average_confidence)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Races Analyzed</span>
                        <span className="text-white font-medium">{model.total_races_analyzed}</span>
                      </div>
                      
                      <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
                        <div 
                          className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(model.winner_accuracy * 400, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Detailed Analysis View */}
        {selectedView === 'detailed' && performanceData && (
          <div className="space-y-6">
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <Activity className="w-5 h-5 text-yellow-400" />
                <span>Detailed Model Analysis</span>
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left text-gray-400 pb-3">Model</th>
                      <th className="text-center text-gray-400 pb-3">Grade</th>
                      <th className="text-center text-gray-400 pb-3">Winner Accuracy</th>
                      <th className="text-center text-gray-400 pb-3">Top-3 Accuracy</th>
                      <th className="text-center text-gray-400 pb-3">Predictions</th>
                      <th className="text-center text-gray-400 pb-3">Wins</th>
                      <th className="text-center text-gray-400 pb-3">Confidence</th>
                      <th className="text-center text-gray-400 pb-3">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData.models.map((model, index) => (
                      <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/25">
                        <td className="py-4 text-white font-medium capitalize">{model.model_name}</td>
                        <td className="py-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getGradeColor(model.performance_grade)}`}>
                            {model.performance_grade}
                          </span>
                        </td>
                        <td className={`py-4 text-center font-bold ${getPerformanceColor(model.winner_accuracy)}`}>
                          {formatPercentage(model.winner_accuracy)}
                        </td>
                        <td className="py-4 text-center text-white">{formatPercentage(model.top3_accuracy)}</td>
                        <td className="py-4 text-center text-white">{model.total_predictions.toLocaleString()}</td>
                        <td className="py-4 text-center text-white">{model.correct_winner_predictions}</td>
                        <td className="py-4 text-center text-white">{formatPercentage(model.average_confidence)}</td>
                        <td className="py-4 text-center">{getTrendIcon(model.trend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Model Comparison View */}
        {selectedView === 'comparison' && performanceData && (
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Model Comparison</h3>
            
            {performanceData.comparison && performanceData.comparison.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left text-gray-400 pb-2">Model</th>
                      <th className="text-center text-gray-400 pb-2">Winner Accuracy</th>
                      <th className="text-center text-gray-400 pb-2">Top 3 Accuracy</th>
                      <th className="text-center text-gray-400 pb-2">Avg Confidence</th>
                      <th className="text-center text-gray-400 pb-2">Total Races</th>
                      <th className="text-center text-gray-400 pb-2">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData.comparison.map((model, index) => (
                      <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/25">
                        <td className="py-3 text-white font-medium capitalize">{model.model_name}</td>
                        <td className={`py-3 text-center font-bold ${getPerformanceColor(model.winner_accuracy)}`}>
                          {formatPercentage(model.winner_accuracy)}
                        </td>
                        <td className="py-3 text-center text-white">{formatPercentage(model.top3_accuracy)}</td>
                        <td className="py-3 text-center text-white">{formatPercentage(model.average_confidence)}</td>
                        <td className="py-3 text-center text-white">{model.total_races_analyzed}</td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getGradeColor(model.performance_grade)}`}>
                            {model.performance_grade}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No comparison data available for the selected timeframe.</p>
              </div>
            )}
          </div>
        )}

        {/* AI Insights View */}
        {selectedView === 'ai-insights' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <span>AI-Powered Analysis</span>
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => generateAIAnalysis('comprehensive')}
                    disabled={isAnalyzing}
                    className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors text-white font-medium"
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Brain className="w-4 h-4" />
                    )}
                    <span>{isAnalyzing ? 'Analyzing...' : 'Generate Analysis'}</span>
                  </button>
                </div>
              </div>
              
              {!profile.openai_api_key && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400" />
                    <p className="text-yellow-300">OpenAI API key required for AI analysis. Please add it in Settings.</p>
                  </div>
                </div>
              )}
              
              {aiAnalysis ? (
                <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-600">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-green-300 font-medium">Analysis Complete</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-400 text-sm">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(aiAnalysis.generated_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {aiAnalysis.analysis}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-2">AI Analysis Ready</h3>
                  <p className="text-gray-500 mb-4">Generate comprehensive insights about your ML model performance.</p>
                  {profile.openai_api_key && (
                    <div className="flex justify-center space-x-3">
                      <button
                        onClick={() => generateAIAnalysis('comprehensive')}
                        disabled={isAnalyzing}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        Comprehensive Analysis
                      </button>
                      <button
                        onClick={() => generateAIAnalysis('comparative')}
                        disabled={isAnalyzing}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        Model Comparison
                      </button>
                      <button
                        onClick={() => generateAIAnalysis('improvement')}
                        disabled={isAnalyzing}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                      >
                        Improvement Focus
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* No Data State */}
        {!isLoading && !error && !performanceData && (
          <div className="text-center py-12">
            <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No ML Performance Data</h3>
            <p className="text-gray-500 mb-4">Upload race results to start tracking model performance.</p>
            <button className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-6 py-2 rounded-lg font-semibold transition-colors">
              Upload Results
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}