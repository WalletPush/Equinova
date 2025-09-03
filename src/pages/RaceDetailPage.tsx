import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'


import { useAuth } from '@/contexts/AuthContext'
import { supabase, RaceEntry } from '@/lib/supabase'
import { fetchFromSupabaseFunction } from '@/lib/api'
import { 
  ArrowLeft, 
  Clock, 
  MapPin, 
  Trophy, 
  Users, 
  Bot,
  Brain,
  AlertCircle,
  Loader
} from 'lucide-react'

export function RaceDetailPage() {
  const { raceId } = useParams<{ raceId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const { data: raceData, isLoading, error } = useQuery({
    queryKey: ['race-detail', raceId],
    queryFn: async () => {
      const response = await fetchFromSupabaseFunction(`race-data?raceId=${raceId}`)
      const data = await response.json()
      return data.data
    },
    enabled: !!raceId
  })

  const race = raceData?.race
  const entries = raceData?.entries || []

  const getAiAnalysis = async () => {
    if (!race || !profile?.openai_api_key) {
      setAnalysisError('OpenAI API key required. Please add it in Settings.')
      return
    }

    setAnalysisLoading(true)
    setAnalysisError('')

    try {
      const response = await fetchFromSupabaseFunction('ai-race-analysis', {
        method: 'POST',
        body: JSON.stringify({
          raceId: race.race_id,
          openaiApiKey: profile.openai_api_key
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get AI analysis')
      }
      
      const data = await response.json()
      setAiAnalysis(data.data.aiAnalysis)
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to get AI analysis')
    } finally {
      setAnalysisLoading(false)
    }
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return ''
    return timeString.substring(0, 5)
  }

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }



  const formatAiAnalysis = (text: string) => {
    const lines = text.split('\n')
    return lines.map((line, index) => {
      // Check if line is a markdown header
      if (line.match(/^#{2,4}\s/)) {
        // Remove the # symbols and any **bold** markers
        const headerText = line.replace(/^#{2,4}\s/, '').replace(/\*\*/g, '')
        return (
          <div key={index} className="font-bold text-white text-lg mb-2 mt-4">
            {headerText}
          </div>
        )
      }
      // Regular line
      if (line.trim() === '') {
        return <div key={index} className="mb-2" />
      }
      
      // Handle **bold** text within regular lines
      const renderTextWithBold = (text: string) => {
        const parts = text.split(/\*\*(.*?)\*\*/g)
        return parts.map((part, partIndex) => {
          // Every odd index is bold text (inside **...** markers)
          if (partIndex % 2 === 1) {
            return (
              <span key={partIndex} className="font-bold text-white">
                {part}
              </span>
            )
          }
          return part
        })
      }
      
      return (
        <div key={index} className="text-gray-100 mb-1">
          {renderTextWithBold(line)}
        </div>
      )
    })
  }



  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
        </div>
      </AppLayout>
    )
  }

  if (error || !race) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load race details. Please try again.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{race.course_name}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-400 mt-1">
              <div className="flex items-center space-x-1">
                <Clock className="w-4 h-4" />
                <span>{formatTime(race.off_time)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{race.distance}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{race.field_size} runners</span>
              </div>
              {race.prize && (
                <div className="flex items-center space-x-1">
                  <Trophy className="w-4 h-4" />
                  <span>£{formatPrize(race.prize)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Race Info */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-400">Class</div>
              <div className="text-white font-medium">{race.race_class}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Going</div>
              <div className="text-white font-medium">{race.going}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Surface</div>
              <div className="text-white font-medium">{race.surface}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Age Band</div>
              <div className="text-white font-medium">{race.age_band}</div>
            </div>
          </div>
        </div>

        {/* AI Analysis Section */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">AI Race Analysis</h2>
            </div>
            {!aiAnalysis && (
              <button
                onClick={getAiAnalysis}
                disabled={analysisLoading || !profile?.openai_api_key}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-600 disabled:cursor-not-allowed text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                {analysisLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
                <span>{analysisLoading ? 'Analyzing...' : 'Get AI Analysis'}</span>
              </button>
            )}
          </div>

          {analysisError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-sm">{analysisError}</p>
            </div>
          )}

          {aiAnalysis ? (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="space-y-1">
                {formatAiAnalysis(aiAnalysis)}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Bot className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">Get comprehensive AI analysis of this race</p>
              <p className="text-sm text-gray-500">
                {!profile?.openai_api_key 
                  ? 'Add your OpenAI API key in Settings to enable AI analysis'
                  : 'Click the button above to generate detailed race insights'
                }
              </p>
            </div>
          )}
        </div>


      </div>
    </AppLayout>
  )
}