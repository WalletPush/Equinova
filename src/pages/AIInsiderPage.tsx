import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { getUKDateTime, formatTime, getQueryDateKey, getDateStatusLabel } from '@/lib/dateUtils'
import {
  Brain,
  Target,
  TrendingUp,
  AlertCircle,
  Clock,
  Trophy,
  Filter,
  RefreshCw,
  Star,
  Zap,
  Eye,
  MapPin,
  Users,
  Calendar,
  ChevronRight,
  DollarSign,
  PoundSterling,
  CheckCircle,
  Award,
  Heart,
  HeartIcon,
  Plus,
  Check,
  Loader2
} from 'lucide-react'

interface AIInsiderData {
  course_distance_specialists: {
    id: number
    horse_name: string
    course: string
    distance: string
    off_time?: string
    current_odds?: number
    jockey_name?: string
    trainer_name?: string
    speed_figure?: number
    total_runs: number
    wins: number
    win_percentage: number
    confidence_score: number
    insight_type: string
    silk_url?: string
  }[]
  trainer_intents: {
    id: number
    horse_name: string
    trainer_name: string
    jockey_name?: string
    course: string
    race_date: string
    off_time?: string
    current_odds?: number
    is_single_runner: boolean
    confidence_score: number
    intent_analysis: string
    strike_rate?: number
    insight_type: string
    silk_url?: string
  }[]
  market_movers: {
    id: number
    horse_name: string
    course: string
    off_time: string
    jockey_name?: string
    trainer_name?: string
    bookmaker: string
    initial_odds: string
    current_odds: string
    odds_change: string
    odds_movement: string
    odds_movement_pct: number
    last_updated: string
    insight_type: string
    silk_url?: string
  }[]
  unified_insights: {
    type: string
    horse_name: string
    course: string
    key_metric: string
    confidence: number
    summary: string
    silk_url?: string
  }[]
  race_statistics: Record<string, number>
}

interface AIInsiderResponse {
  success: boolean
  timestamp: string
  data: AIInsiderData
  summary: {
    total_specialists: number
    total_trainer_intents: number
    total_market_movers: number
    courses_covered: number
    last_updated: string
  }
}

interface UpcomingRace {
  race_id: string
  course_name: string
  off_time: string
  race_class: string
  distance: string
  field_size: number
  surface: string
  prize?: string
  total_entries: number
  ml_predictions_available: number
  has_market_interest: boolean
  top_ml_picks: {
    horse_name: string
    trainer_name: string
    jockey_name: string
    ensemble_proba: number
    silk_url?: string
  }[]
}

interface UpcomingRacesResponse {
  success: boolean
  data: {
    upcoming_races: UpcomingRace[]
    london_time: string
    message: string
    total_races_today: number
    races_completed: number
    races_remaining: number
  }
}

interface AIMarketInsight {
  race_id: string
  course: string
  off_time: string
  analysis: string
  key_insights: string[]
  market_confidence_horses: {
    horse_name: string
    horse_id: string
    silk_url?: string
    trainer_name: string
    jockey_name: string
    current_odds: string
    ml_prediction: string
    market_movement_pct: string
    confidence_score: number
    confidence_factors: string[]
    speed_figure?: number
    ae_at_distance?: number
  }[]
  confidence_score: number
  risk_assessment: string
  timestamp: string
  total_ml_horses_analyzed: number
  horses_with_movement: number
}

export function AIInsiderPage() {
  const [activeTab, setActiveTab] = useState<'upcoming_races' | 'ml_value_bets' | 'trainer_intent' | 'market_movers'>('upcoming_races')
  const [confidenceFilter, setConfidenceFilter] = useState<number>(60)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [raceInsights, setRaceInsights] = useState<Record<string, AIMarketInsight>>({})
  const [loadingInsights, setLoadingInsights] = useState<Record<string, boolean>>({})
  const [shortlistOperations, setShortlistOperations] = useState<Record<string, boolean>>({})
  const queryClient = useQueryClient()

  // Fetch AI Insider Data from our API endpoint
  const { data: aiInsiderResponse, refetch: refetchAIInsider, isLoading: aiInsiderLoading, error: aiInsiderError } = useQuery({
    queryKey: ['aiInsiderData', getQueryDateKey()], // Dynamic date key
    queryFn: async () => {
      console.log('Fetching AI Insider data from API...')
      const { data, error } = await supabase.functions.invoke('ai-insider-api', {
        body: {}
      })
      
      if (error) {
        console.error('Error invoking AI Insider API:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('AI Insider API returned error:', data.error)
        throw new Error(data.error?.message || 'AI Insider API failed')
      }
      
      console.log('AI Insider data fetched successfully:', data.summary)
      return data as AIInsiderResponse
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 * 5 // Auto-refresh every 5 minutes for Market Movers
  })

  // Fetch Upcoming Races with dynamic date key
  const { data: upcomingRacesResponse, refetch: refetchUpcomingRaces, isLoading: upcomingRacesLoading } = useQuery({
    queryKey: ['upcomingRaces', getQueryDateKey()], // Dynamic date key
    queryFn: async () => {
      console.log('Fetching upcoming races with London timezone...')
      const { data, error } = await supabase.functions.invoke('upcoming-races', {
        body: {}
      })
      
      if (error) {
        console.error('Error fetching upcoming races:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('Upcoming races API returned error:', data.error)
        throw new Error(data.error?.message || 'Upcoming races API failed')
      }
      
      console.log('Upcoming races fetched successfully:', data.data.message)
      return data as UpcomingRacesResponse
    },
    staleTime: 1000 * 30, // 30 seconds - more frequent for live races
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 * 2 // Refetch every 2 minutes
  })

  // Fetch ML Value Bets with dynamic date key
  const { data: mlValueBetsResponse, refetch: refetchMLValueBets, isLoading: mlValueBetsLoading } = useQuery({
    queryKey: ['mlValueBets', getQueryDateKey()], // Dynamic date key
    queryFn: async () => {
      console.log('Fetching ML Value Bets...')
      const { data, error } = await supabase.functions.invoke('ml-value-bets', {
        body: {}
      })
      
      if (error) {
        console.error('Error fetching ML Value Bets:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('ML Value Bets API returned error:', data.error)
        throw new Error(data.error?.message || 'ML Value Bets API failed')
      }
      
      console.log('ML Value Bets fetched successfully:', data.data.message)
      return data
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 3,
    retryDelay: 1000
  })



  // Fetch Enhanced Trainer Intent with dynamic date key
  const { data: trainerIntentResponse, refetch: refetchTrainerIntent, isLoading: trainerIntentLoading } = useQuery({
    queryKey: ['trainerIntentEnhanced', getQueryDateKey()], // Dynamic date key
    queryFn: async () => {
      console.log('Fetching enhanced trainer intent...')
      const { data, error } = await supabase.functions.invoke('trainer-intent-enhanced', {
        body: {}
      })
      
      if (error) {
        console.error('Error fetching trainer intent:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('Trainer intent API returned error:', data.error)
        throw new Error(data.error?.message || 'Trainer intent API failed')
      }
      
      console.log('Trainer intent fetched successfully:', data.data.message)
      return data
    },
    staleTime: 1000 * 60 * 3, // 3 minutes
    retry: 3,
    retryDelay: 1000
  })

  // Extract data from responses
  const specialists = aiInsiderResponse?.data?.course_distance_specialists?.filter(
    s => s.confidence_score >= confidenceFilter
  ) || []
  const trainerIntents = trainerIntentResponse?.data?.trainer_intent_signals || []
  const marketMovers = aiInsiderResponse?.data?.market_movers || []
  const upcomingRaces = upcomingRacesResponse?.data?.upcoming_races || []
  const mlValueBets = mlValueBetsResponse?.data?.value_bet_races || []

  const londonTime = getDateStatusLabel() // Use consistent UK timezone

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      if (activeTab === 'upcoming_races') {
        await refetchUpcomingRaces()
      } else if (activeTab === 'ml_value_bets') {
        await refetchMLValueBets()

      } else if (activeTab === 'trainer_intent') {
        await refetchTrainerIntent()
      } else {
        await refetchAIInsider()
      }
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // AI Market Insights for individual races (NEW FEATURE)
  const getAIInsights = async (raceId: string, course: string, offTime: string) => {
    if (loadingInsights[raceId]) return
    
    setLoadingInsights(prev => ({ ...prev, [raceId]: true }))
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-market-insights', {
        body: {
          race_id: raceId,
          course: course,
          off_time: offTime
        }
      })
      
      if (error) {
        console.error('Error getting AI insights:', error)
        throw error
      }
      
      if (data.success) {
        setRaceInsights(prev => ({ ...prev, [raceId]: data.data }))
        console.log(`AI insights for race ${raceId}:`, data.data.confidence_score)
      } else {
        throw new Error(data.error?.message || 'AI insights failed')
      }
    } catch (error) {
      console.error(`Failed to get insights for race ${raceId}:`, error)
      // You could show a toast notification here
    } finally {
      setLoadingInsights(prev => ({ ...prev, [raceId]: false }))
    }
  }

  // Enhanced Value Bet Analysis using OpenAI-powered analysis
  const getValueBetAnalysis = async (raceId: string, course: string, offTime: string) => {
    if (loadingInsights[raceId]) return
    
    setLoadingInsights(prev => ({ ...prev, [raceId]: true }))
    
    try {
      // Find the race and get the top value bet horse
      const targetRace = mlValueBets.find(race => race.race_id === raceId)
      if (!targetRace || !targetRace.top_value_bets || targetRace.top_value_bets.length === 0) {
        throw new Error('No value bet horses found for analysis')
      }
      
      // Get the top value bet horse (first one)
      const topValueBet = targetRace.top_value_bets[0]
      
      // Get the horse ID from race_entries table
      const { data: horseData, error: horseError } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', raceId)
        .eq('horse_name', topValueBet.horse_name)
        .single()
      
      if (horseError || !horseData) {
        throw new Error(`Failed to find horse ID for ${topValueBet.horse_name}`)
      }
      
      // Call the new enhanced value bet analysis function (Monte Carlo + OpenAI)
      const { data, error } = await supabase.functions.invoke('enhanced-value-bet-analysis', {
        body: {
          raceId: raceId,
          horseId: horseData.id.toString()
        }
      })
      
      if (error) {
        console.error('Error getting OpenAI value bet analysis:', error)
        throw error
      }
      
      if (data.data && data.data.success) {
        // Enhanced analysis with Monte Carlo data
        const mcData = data.data.monte_carlo_data;
        const analysisData: AIMarketInsight = {
          race_id: raceId,
          course: course,
          off_time: offTime,
          analysis: data.data.analysis,
          key_insights: [
            `Monte Carlo Win Probability: ${(mcData.win_probability * 100).toFixed(1)}%`,
            `Expected Return: ${(mcData.expected_return * 100).toFixed(1)}%`,
            `Kelly Fraction: ${(mcData.kelly_fraction * 100).toFixed(1)}%`,
            `Risk Level: ${data.data.risk_level}`,
            `Recommendation: ${data.data.bet_recommendation}`,
            `Statistical Confidence: ${mcData.confidence_level}%`
          ],
          risk_assessment: `${data.data.risk_level} - Based on ${mcData.simulation_runs.toLocaleString()} Monte Carlo simulations`,
          confidence_score: mcData.confidence_level,
          total_ml_horses_analyzed: targetRace.field_size || 0,
          horses_with_movement: 1,
          market_confidence_horses: [],
          timestamp: new Date().toISOString()
        }
        setRaceInsights(prev => ({ ...prev, [raceId]: analysisData }))
        console.log(`OpenAI value bet analysis completed for ${topValueBet.horse_name}`)
      } else {
        throw new Error(data.data?.error || 'OpenAI value bet analysis failed')
      }
    } catch (error) {
      console.error(`Failed to get OpenAI value bet analysis for race ${raceId}:`, error)
      // Show error in UI
      const errorData: AIMarketInsight = {
        race_id: raceId,
        course: course,
        off_time: offTime,
        analysis: `Analysis failed: ${error.message}`,
        key_insights: ['Please try again later'],
        risk_assessment: 'Unable to complete analysis',
        confidence_score: 0,
        total_ml_horses_analyzed: 0,
        horses_with_movement: 0,
        market_confidence_horses: [],
        timestamp: new Date().toISOString()
      }
      setRaceInsights(prev => ({ ...prev, [raceId]: errorData }))
    } finally {
      setLoadingInsights(prev => ({ ...prev, [raceId]: false }))
    }
  }

  // Enhanced Trainer Intent Analysis using OpenAI-powered analysis
  const getTrainerIntentAnalysis = async (raceId: string, course: string, offTime: string) => {
    if (loadingInsights[raceId]) return
    
    setLoadingInsights(prev => ({ ...prev, [raceId]: true }))
    
    try {
      // Find the trainer intent and get the horse
      const targetIntent = trainerIntents.find(intent => intent.race_id === raceId)
      if (!targetIntent) {
        throw new Error('No trainer intent found for analysis')
      }
      
      // Get the horse ID from race_entries table
      const { data: horseData, error: horseError } = await supabase
        .from('race_entries')
        .select('id')
        .eq('race_id', raceId)
        .eq('horse_name', targetIntent.horse_name)
        .single()
      
      if (horseError || !horseData) {
        throw new Error(`Failed to find horse ID for ${targetIntent.horse_name}`)
      }
      
      // No longer need Google Maps API check since we implemented Haversine formula
      // Proceed directly with OpenAI-powered trainer intent analysis
      
      // Call the new OpenAI-powered trainer intent analysis function
      const { data, error } = await supabase.functions.invoke('openai-trainer-intent-analysis', {
        body: {
          raceId: raceId,
          horseId: horseData.id.toString()
        }
      })
      
      if (error) {
        console.error('Error getting OpenAI trainer intent analysis:', error)
        throw error
      }
      
      if (data.data && data.data.success) {
        // Reformat for compatibility with existing UI
        const analysisData: AIMarketInsight = {
          race_id: raceId,
          course: course,
          off_time: offTime,
          analysis: data.data.analysis,
          key_insights: [
            `Analyzing ${targetIntent.horse_name} trainer intent`,
            `Travel distance: ${data.data.travelDistance || 'Unknown'}`,
            `Trainer: ${targetIntent.trainer_name}`,
            'AI-powered travel and intent analysis completed'
          ],
          risk_assessment: 'Based on OpenAI analysis of trainer commitment and travel distance',
          confidence_score: 80,
          total_ml_horses_analyzed: 1,
          horses_with_movement: 0,
          market_confidence_horses: [],
          timestamp: new Date().toISOString()
        }
        setRaceInsights(prev => ({ ...prev, [raceId]: analysisData }))
        console.log(`OpenAI trainer intent analysis completed for ${targetIntent.horse_name}`)
      } else {
        throw new Error(data.data?.error || 'OpenAI trainer intent analysis failed')
      }
    } catch (error) {
      console.error(`Failed to get OpenAI trainer intent analysis for race ${raceId}:`, error)
      // Show error in UI
      const errorData: AIMarketInsight = {
        race_id: raceId,
        course: course,
        off_time: offTime,
        analysis: `Analysis failed: ${error.message}`,
        key_insights: ['Please try again later'],
        risk_assessment: 'Unable to complete analysis',
        confidence_score: 0,
        total_ml_horses_analyzed: 0,
        horses_with_movement: 0,
        market_confidence_horses: [],
        timestamp: new Date().toISOString()
      }
      setRaceInsights(prev => ({ ...prev, [raceId]: errorData }))
    } finally {
      setLoadingInsights(prev => ({ ...prev, [raceId]: false }))
    }
  }

  // Fetch user's shortlist
  const { data: userShortlist, refetch: refetchShortlist } = useQuery({
    queryKey: ['userShortlist'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.log('No authenticated user for shortlist')
        return []
      }

      const { data, error } = await supabase.functions.invoke('get-shortlist', {
        body: {}
      })
      
      if (error) {
        console.error('Error fetching shortlist:', error)
        return []
      }
      
      return data?.data || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  })

  // Add to shortlist mutation
  const addToShortlistMutation = useMutation({
    mutationFn: async ({ horseName, raceTime, course, odds, source, jockeyName, trainerName, mlInfo }: {
      horseName: string
      raceTime: string
      course: string
      odds?: string
      source: 'value_bet' | 'trainer_intent' | 'market_mover'
      jockeyName?: string
      trainerName?: string
      mlInfo?: string
    }) => {
      return await callSupabaseFunction('add-to-shortlist', {
        horse_name: horseName,
        race_time: raceTime,
        course: course,
        current_odds: odds || 'N/A',
        source: source,
        jockey_name: jockeyName || null,
        trainer_name: trainerName || null,
        ml_info: mlInfo || null
      })
    },
    onSuccess: (data, variables) => {
      console.log(`Added ${variables.horseName} to shortlist`)
      queryClient.invalidateQueries({ queryKey: ['userShortlist'] })
      // Add a small delay to show feedback
      setTimeout(() => {
        setShortlistOperations(prev => ({ ...prev, [variables.horseName]: false }))
      }, 1500)
    },
    onError: (error, variables) => {
      console.error('Error adding to shortlist:', error)
      setShortlistOperations(prev => ({ ...prev, [variables.horseName]: false }))
    }
  })

  // Remove from shortlist mutation
  const removeFromShortlistMutation = useMutation({
    mutationFn: async ({ horseName, course }: {
      horseName: string
      course: string
    }) => {
      return await callSupabaseFunction('remove-from-shortlist', {
        horse_name: horseName,
        course: course
      })
    },
    onSuccess: (data, variables) => {
      console.log(`Removed ${variables.horseName} from shortlist`)
      queryClient.invalidateQueries({ queryKey: ['userShortlist'] })
      setShortlistOperations(prev => ({ ...prev, [variables.horseName]: false }))
    },
    onError: (error, variables) => {
      console.error('Error removing from shortlist:', error)
      setShortlistOperations(prev => ({ ...prev, [variables.horseName]: false }))
    }
  })

  // Helper function to check if horse is in shortlist
  const isHorseInShortlist = (horseName: string, course: string): boolean => {
    if (!userShortlist || !Array.isArray(userShortlist)) return false
    return userShortlist.some(item => 
      item.horse_name === horseName && item.course === course
    )
  }

  // Handle shortlist operations
  const handleShortlistToggle = async (
    horseName: string, 
    raceTime: string, 
    course: string, 
    odds: string | undefined, 
    source: 'value_bet' | 'trainer_intent' | 'market_mover',
    jockeyName?: string,
    trainerName?: string,
    mlInfo?: string
  ) => {
    const operationKey = horseName
    setShortlistOperations(prev => ({ ...prev, [operationKey]: true }))
    
    try {
      const isInShortlist = isHorseInShortlist(horseName, course)
      
      if (isInShortlist) {
        await removeFromShortlistMutation.mutateAsync({ horseName, course })
      } else {
        await addToShortlistMutation.mutateAsync({ 
          horseName, 
          raceTime, 
          course, 
          odds, 
          source, 
          jockeyName, 
          trainerName, 
          mlInfo 
        })
      }
    } catch (error) {
      console.error('Shortlist operation failed:', error)
      // Show error feedback if needed
    }
  }

  // Cap confidence at 100% to prevent values over 100%
  const capConfidence = (score: number): number => {
    return Math.min(100, Math.max(0, score || 0))
  }

  const getConfidenceColor = (score: number) => {
    const cappedScore = capConfidence(score)
    if (cappedScore >= 90) return 'text-green-400'
    if (cappedScore >= 80) return 'text-yellow-400'
    if (cappedScore >= 70) return 'text-orange-400'
    return 'text-gray-400'
  }

  const getConfidenceBadge = (score: number) => {
    const cappedScore = capConfidence(score)
    if (cappedScore >= 90) return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (cappedScore >= 80) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    if (cappedScore >= 70) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  // Shortlist Button Component
  const ShortlistButton = ({ 
    horseName, 
    raceTime, 
    course, 
    odds, 
    source,
    jockeyName,
    trainerName,
    mlInfo
  }: {
    horseName: string
    raceTime: string
    course: string
    odds?: string
    source: 'value_bet' | 'trainer_intent' | 'market_mover'
    jockeyName?: string
    trainerName?: string
    mlInfo?: string
  }) => {
    const isInShortlist = isHorseInShortlist(horseName, course)
    const isLoading = shortlistOperations[horseName] || false
    
    return (
      <button
        onClick={() => handleShortlistToggle(horseName, raceTime, course, odds, source, jockeyName, trainerName, mlInfo)}
        disabled={isLoading}
        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
          isInShortlist 
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isInShortlist ? 'Remove from shortlist' : 'Add to shortlist'}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isInShortlist ? (
          <>
            <Check className="w-3 h-3" />
            <span>Shortlisted</span>
          </>
        ) : (
          <>
            <Heart className="w-3 h-3" />
            <span>Shortlist</span>
          </>
        )}
      </button>
    )
  }

  // Use dateUtils formatTime function

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }

  // Format AI analysis text with bold numbered sections
  const formatAnalysisText = (text: string) => {
    if (!text) return text
    
    // Replace numbered sections like "1. SECTION NAME:" with bold formatting
    return text.replace(
      /(\d+\.)\s*([^:]+:)/g,
      (match, number, section) => {
        return `**${number} ${section.trim()}**\n\n`
      }
    )
  }

  // Component to render formatted analysis text
  const FormattedAnalysisText = ({ text, className = "" }: { text: string; className?: string }) => {
    if (!text) return null
    
    const formattedText = formatAnalysisText(text)
    const parts = formattedText.split(/\*\*(.*?)\*\*/g)
    
    return (
      <div className={`text-left leading-relaxed ${className}`}>
        {parts.map((part, index) => {
          if (index % 2 === 1) {
            // This is a bold section
            return (
              <div key={index} className="font-bold text-white mb-2 mt-4 first:mt-0">
                {part}
              </div>
            )
          } else {
            // This is regular text
            return part.split('\n').map((line, lineIndex) => {
              if (line.trim() === '') {
                return <div key={`${index}-${lineIndex}`} className="mb-2" />
              }
              return (
                <div key={`${index}-${lineIndex}`} className="text-gray-300 text-sm mb-2">
                  {line}
                </div>
              )
            })
          }
        })}
      </div>
    )
  }

  const tabs = [
    {
      id: 'upcoming_races' as const,
      label: 'Upcoming Races',
      icon: Clock,
      count: upcomingRaces?.length || 0
    },

    {
      id: 'ml_value_bets' as const,
      label: 'ML Value Bets',
      icon: PoundSterling,
      count: mlValueBets?.length || 0
    },
    {
      id: 'trainer_intent' as const,
      label: 'Trainer Intent',
      icon: Eye,
      count: trainerIntents?.length || 0
    },
    {
      id: 'market_movers' as const,
      label: 'Market Movers',
      icon: TrendingUp,
      count: marketMovers?.length || 0
    }
  ]

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header - Mobile Optimized */}
        <div className="space-y-4">
          {/* Title - Clean header without brain icon */}
          <div>
            <h1 className="text-2xl font-bold text-white">AI Insider</h1>
            <p className="text-gray-400 text-sm">Intelligent market analysis and insider signals</p>
          </div>
          
          {/* Line 2: Controls and London time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {londonTime && (
                <div className="flex items-center space-x-2 text-sm text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>London: {londonTime}</span>
                </div>
              )}

            </div>
            
            <button
              onClick={handleRefreshAll}
              disabled={isRefreshing || (activeTab === 'upcoming_races' ? upcomingRacesLoading : aiInsiderLoading)}
              className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col space-y-1 md:flex-row md:space-y-0 md:space-x-1 bg-gray-800 p-1 rounded-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors flex-1 ${
                  activeTab === tab.id
                    ? 'bg-yellow-500 text-gray-900'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm md:text-base">{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === tab.id
                      ? 'bg-gray-900 text-yellow-400'
                      : 'bg-gray-600 text-gray-300'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="min-h-96">
          {/* Error States */}
          {(aiInsiderError && activeTab !== 'upcoming_races') && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 mb-6">
              <div className="flex items-center space-x-2 text-red-400 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error Loading AI Insider Data</span>
              </div>
              <p className="text-red-300 text-sm">
                {aiInsiderError?.message || 'Failed to load AI Insider data from API'}
              </p>
              <button
                onClick={handleRefreshAll}
                className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* NEW: Upcoming Races Tab */}
          {activeTab === 'upcoming_races' && (
            <div className="space-y-4">
              {upcomingRacesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                </div>
              ) : upcomingRaces && upcomingRaces.length > 0 ? (
                <div className="space-y-4">
                  {upcomingRaces
                    .sort((a, b) => a.off_time.localeCompare(b.off_time)) // Chronological order
                    .slice(0, 4) // Show only next 4 upcoming races
                    .map((race) => {
                    const raceInsight = raceInsights[race.race_id]
                    const isLoadingInsight = loadingInsights[race.race_id] || false
                    
                    return (
                      <div
                        key={race.race_id}
                        className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-yellow-400/50 transition-colors"
                      >
                        {/* Race Header */}
                        <div className="mb-4">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-bold text-white">{race.course_name}</h3>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                              {race.race_class}
                            </span>
                            <div className="flex items-center space-x-1 text-yellow-400">
                              <Clock className="w-4 h-4" />
                              <span className="font-bold">{formatTime(race.off_time)}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-400 mb-3">
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
                            <div className="text-gray-300 text-xs bg-gray-700 px-2 py-0.5 rounded">
                              {race.surface}
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-4 text-sm">
                            <div className="text-gray-400">
                              <span className="text-yellow-400 font-medium">{race.ml_predictions_available}</span> ML predictions
                            </div>
                            {race.has_market_interest && (
                              <div className="flex items-center space-x-1 text-green-400">
                                <TrendingUp className="w-4 h-4" />
                                <span className="font-medium">Market Interest</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Top ML Picks */}
                        {race.top_ml_picks.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Top ML Predictions</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {race.top_ml_picks.map((pick, index) => (
                                <div key={index} className="bg-gray-700/50 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <HorseNameWithSilk 
                                      horseName={pick.horse_name} 
                                      silkUrl={pick.silk_url}
                                      className="text-yellow-400 font-bold text-sm"
                                    />
                                    <span className="text-green-400 font-bold text-sm">
                                      {(pick.ensemble_proba * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {pick.trainer_name} • {pick.jockey_name}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* AI Insights Results */}
                        {raceInsight && (
                          <div className="border-t border-gray-700 pt-4">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-2">
                                <Brain className="w-5 h-5 text-purple-400" />
                                <span className="text-lg font-bold text-white">AI Market Analysis</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-400">Confidence:</span>
                                <span className={`text-xl font-bold ${getConfidenceColor(raceInsight.confidence_score)}`}>
                                  {capConfidence(raceInsight.confidence_score)}%
                                </span>
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                              <div>
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Analysis Summary</h5>
                                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                                  {raceInsight.analysis}
                                </p>
                                
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Key Insights</h5>
                                <ul className="space-y-1">
                                  {raceInsight.key_insights.map((insight, index) => (
                                    <li key={index} className="text-sm text-gray-300 flex items-start space-x-2">
                                      <ChevronRight className="w-3 h-3 mt-0.5 text-yellow-400 flex-shrink-0" />
                                      <span>{insight}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              
                              <div>
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Risk Assessment</h5>
                                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                                  {raceInsight.risk_assessment}
                                </p>
                                
                                <div className="bg-gray-700/30 rounded-lg p-3">
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <span className="text-gray-400">ML Horses Analyzed:</span>
                                      <div className="text-white font-medium">{raceInsight.total_ml_horses_analyzed}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Market Movement:</span>
                                      <div className="text-white font-medium">{raceInsight.horses_with_movement}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Market Confidence Horses */}
                            {raceInsight.market_confidence_horses.length > 0 && (
                              <div className="mt-6">
                                <h5 className="text-sm font-medium text-gray-400 mb-3">Market Confidence Horses</h5>
                                <div className="grid gap-3">
                                  {raceInsight.market_confidence_horses.map((horse, index) => (
                                    <div key={horse.horse_id} className="bg-gray-700/50 rounded-lg p-4">
                                      <div className="flex items-start justify-between mb-3">
                                        <div>
                                          <HorseNameWithSilk 
                                            horseName={horse.horse_name} 
                                            silkUrl={horse.silk_url}
                                            className="text-yellow-400 font-bold text-lg"
                                          />
                                          <div className="text-sm text-gray-400 mt-1">
                                            {horse.trainer_name} • {horse.jockey_name}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-green-400 font-bold text-lg">{horse.current_odds}</div>
                                          <div className={`text-sm font-medium ${getConfidenceColor(horse.confidence_score)}`}>
                                            {capConfidence(horse.confidence_score)}% confidence
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                                        <div>
                                          <span className="text-gray-400">ML Prediction:</span>
                                          <div className="text-yellow-400 font-medium">{horse.ml_prediction}%</div>
                                        </div>
                                        <div>
                                          <span className="text-gray-400">Market Movement:</span>
                                          <div className="text-red-400 font-medium">-{horse.market_movement_pct}%</div>
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-1">
                                        <div className="text-xs text-gray-400 mb-1">Confidence Factors:</div>
                                        {horse.confidence_factors.map((factor, factorIndex) => (
                                          <div key={factorIndex} className="text-xs text-gray-300 flex items-start space-x-2">
                                            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full mt-1.5 flex-shrink-0"></div>
                                            <span>{factor}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Get Latest Insights Button - Moved to Bottom for Better Mobile UI */}
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <button
                            onClick={() => getAIInsights(race.race_id, race.course_name, race.off_time)}
                            disabled={isLoadingInsight || !!raceInsight}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                          >
                            {isLoadingInsight ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : raceInsight ? (
                              <span className="text-green-300">✓</span>
                            ) : (
                              <Zap className="w-4 h-4" />
                            )}
                            <span>
                              {isLoadingInsight ? 'Analyzing...' : raceInsight ? 'Insights Ready' : 'Get Latest Insights'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">
                    {upcomingRacesResponse?.data?.message || 'No Upcoming Races'}
                  </h3>
                  <p className="text-gray-500">
                    {upcomingRacesResponse?.data?.races_completed > 0 && 
                     `${upcomingRacesResponse.data.races_completed} races completed today`}
                  </p>
                  <div className="mt-4 text-sm text-gray-400">
                    Current London Time: {londonTime}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Market Movers - Updated to match Value Bets design */}
          {activeTab === 'market_movers' && (
            <div className="space-y-4">
              {aiInsiderLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                </div>
              ) : marketMovers && marketMovers.length > 0 ? (
                <div className="space-y-4">
                  {/* Group market movers by race and filter for upcoming races only */}
                  {(() => {
                    const now = new Date()
                    
                    // Filter market movers to only include upcoming races
                    const upcomingMovers = marketMovers.filter(mover => {
                      try {
                        // Parse race time - convert afternoon racing times (02:00 -> 14:00)
                        let raceTimeString = mover.off_time
                        if (raceTimeString.includes(':') && raceTimeString.split(':').length === 3) {
                          raceTimeString = raceTimeString.substring(0, 5)
                        }
                        
                        const [hours, minutes] = raceTimeString.split(':')
                        let hourNum = parseInt(hours, 10)
                        
                        // UK racing convention: times 01:XX - 08:XX are afternoon races
                        if (hourNum >= 1 && hourNum <= 8) {
                          hourNum += 12 // Convert to PM
                          raceTimeString = `${hourNum.toString().padStart(2, '0')}:${minutes}`
                        }
                        
                        // Create race datetime for today
                        const today = new Date().toISOString().split('T')[0]
                        const raceDateTimeString = `${today}T${raceTimeString}:00`
                        const raceDateTime = new Date(raceDateTimeString)
                        
                        // Adjust for UK timezone (BST = UTC+1)
                        const raceTimeUTC = new Date(raceDateTime.getTime() - (1 * 60 * 60 * 1000))
                        
                        // Only include races that haven't finished yet
                        return raceTimeUTC.getTime() > now.getTime()
                      } catch (error) {
                        console.warn('Error filtering market mover race time:', error)
                        return true // Include race if we can't parse the time
                      }
                    })
                    
                    const groups = upcomingMovers.reduce((acc, mover) => {
                      const raceKey = `${mover.course}_${mover.off_time}`
                      if (!acc[raceKey]) {
                        acc[raceKey] = {
                          race_id: `mover_${raceKey}`,
                          course_name: mover.course,
                          off_time: mover.off_time,
                          movers: []
                        }
                      }
                      acc[raceKey].movers.push(mover)
                      return acc
                    }, {} as Record<string, {
                      race_id: string;
                      course_name: string;
                      off_time: string;
                      movers: typeof marketMovers;
                    }>)
                    
                    return (Object.values(groups) as {
                      race_id: string;
                      course_name: string;
                      off_time: string;
                      movers: typeof marketMovers;
                    }[])
                      .sort((a, b) => a.off_time.localeCompare(b.off_time))
                      .map((raceGroup) => (
                        <div
                          key={raceGroup.race_id}
                          className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-yellow-400/50 transition-colors"
                        >
                          {/* Race Header - Same as Value Bets */}
                          <div className="mb-4">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-xl font-bold text-white">{raceGroup.course_name}</h3>
                              <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                                Market Movers
                              </span>
                              <div className="flex items-center space-x-1 text-yellow-400">
                                <Clock className="w-4 h-4" />
                                <span className="font-bold">{formatTime(raceGroup.off_time)}</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Market Movers - Same card style as Value Bets */}
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Market Movement Activity</h4>
                            <div className="grid gap-3">
                              {raceGroup.movers.map((mover, index) => {
                                // Check if this market mover is also a top ML pick
                                const isMLPick = upcomingRaces?.some(race => 
                                  race.top_ml_picks?.some(pick => pick.horse_name === mover.horse_name)
                                )
                                
                                return (
                                  <div key={mover.id} className="bg-gray-700/50 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-3">
                                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                          {index + 1}
                                        </div>
                                        <HorseNameWithSilk 
                                          horseName={mover.horse_name} 
                                          silkUrl={mover.silk_url}
                                          className="text-yellow-400 font-bold text-lg"
                                        />
                                      </div>
                                      <div className="text-right">
                                        <div className="text-green-400 font-bold text-lg">{mover.current_odds}</div>
                                        <div className="text-yellow-400 font-medium text-sm">
                                          {mover.odds_movement_pct > 0 ? '+' : ''}{mover.odds_movement_pct}%
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="text-xs text-gray-400 mb-2">
                                      {mover.trainer_name || 'Unknown'} • {mover.jockey_name || 'Unknown'}
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                      <div className="flex flex-wrap gap-1">
                                        <span className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                          {mover.bookmaker} #1
                                        </span>
                                        <span className={`border px-2 py-0.5 rounded text-xs font-medium ${
                                          mover.odds_movement === 'steaming' ? 'bg-red-600/20 text-red-400 border-red-600/30' : 
                                          mover.odds_movement === 'drifting' ? 'bg-blue-600/20 text-blue-400 border-blue-600/30' : 
                                          'bg-gray-600/20 text-gray-400 border-gray-600/30'
                                        }`}>
                                          {mover.odds_movement.charAt(0).toUpperCase() + mover.odds_movement.slice(1)}
                                        </span>
                                        {isMLPick && (
                                          <span className="bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                            ML Pick #1
                                          </span>
                                        )}
                                      </div>
                                      <ShortlistButton
                                        horseName={mover.horse_name}
                                        raceTime={mover.off_time}
                                        course={mover.course}
                                        odds={mover.current_odds}
                                        source="market_mover"
                                        jockeyName={mover.jockey_name}
                                        trainerName={mover.trainer_name}
                                        mlInfo={`Movement: ${mover.odds_movement} (${mover.odds_movement_pct > 0 ? '+' : ''}${mover.odds_movement_pct}%)`}
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                  })()}
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">No Market Movers</h3>
                  <p className="text-gray-500">No significant market movements detected</p>
                </div>
              )}
            </div>
          )}

          {/* ML Value Bets (Replaces Course & Distance) */}
          {activeTab === 'ml_value_bets' && (
            <div className="space-y-4">
              {mlValueBetsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                    <span className="text-gray-400">Analyzing ML value bets...</span>
                  </div>
                </div>
              ) : mlValueBets && mlValueBets.length > 0 ? (
                <div className="space-y-4">
                  {mlValueBets.map((race) => {
                    const raceInsight = raceInsights[race.race_id]
                    const isLoadingInsight = loadingInsights[race.race_id] || false
                    
                    return (
                      <div
                        key={race.race_id}
                        className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-yellow-400/50 transition-colors"
                      >
                        {/* Race Header */}
                        <div className="mb-4">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-bold text-white">{race.course_name}</h3>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                              {race.race_class}
                            </span>
                            <div className="flex items-center space-x-1 text-yellow-400">
                              <Clock className="w-4 h-4" />
                              <span className="font-bold">{formatTime(race.off_time)}</span>
                            </div>

                          </div>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-400 mb-3">
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
                            <div className="text-gray-300 text-xs bg-gray-700 px-2 py-0.5 rounded">
                              {race.surface}
                            </div>
                          </div>
                        </div>
                        
                        {/* Top Value Bets */}
                        {race.top_value_bets.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Top ML Value Bets (6/1+)</h4>
                            <div className="grid gap-3">
                              {race.top_value_bets.map((bet, index) => (
                                <div key={index} className="bg-gray-700/50 rounded-lg p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                        {bet.number}
                                      </div>
                                      <HorseNameWithSilk 
                                        horseName={bet.horse_name} 
                                        silkUrl={bet.silk_url}
                                        className="text-yellow-400 font-bold text-lg"
                                      />
                                    </div>
                                    <div className="text-right">
                                      <div className="text-green-400 font-bold text-lg">{bet.current_odds}/1</div>
                                      <div className="text-yellow-400 font-medium text-sm">
                                        {(bet.ensemble_proba * 100).toFixed(1)}% ML
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="text-xs text-gray-400 mb-2">
                                    {bet.trainer_name} • {bet.jockey_name}
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-wrap gap-1">
                                      {bet.top_in_models.map((model, modelIndex) => (
                                        <span key={modelIndex} className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                          {model} #1
                                        </span>
                                      ))}
                                    </div>
                                    <ShortlistButton
                                      horseName={bet.horse_name}
                                      raceTime={race.off_time}
                                      course={race.course_name}
                                      odds={`${bet.current_odds}/1`}
                                      source="value_bet"
                                      jockeyName={bet.jockey_name}
                                      trainerName={bet.trainer_name}
                                      mlInfo={`ML: ${(bet.ensemble_proba * 100).toFixed(1)}% | Models: ${bet.top_in_models.join(', ')}`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* AI Insights Results */}
                        {raceInsight && (
                          <div className="border-t border-gray-700 pt-4">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center space-x-2">
                                <Brain className="w-5 h-5 text-purple-400" />
                                <span className="text-lg font-bold text-white">Value Bet Analysis</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-400">Confidence:</span>
                                <span className={`text-xl font-bold ${getConfidenceColor(raceInsight.confidence_score)}`}>
                                  {capConfidence(raceInsight.confidence_score)}%
                                </span>
                              </div>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-6">
                              <div>
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Value Assessment</h5>
                                <FormattedAnalysisText 
                                  text={raceInsight.analysis} 
                                  className="mb-4"
                                />
                                
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Key Value Insights</h5>
                                <ul className="space-y-1">
                                  {raceInsight.key_insights.map((insight, index) => (
                                    <li key={index} className="text-sm text-gray-300 flex items-start space-x-2">
                                      <ChevronRight className="w-3 h-3 mt-0.5 text-yellow-400 flex-shrink-0" />
                                      <span>{insight}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              
                              <div>
                                <h5 className="text-sm font-medium text-gray-400 mb-2">Value Bet Risk Assessment</h5>
                                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                                  {raceInsight.risk_assessment}
                                </p>
                                
                                <div className="bg-gray-700/30 rounded-lg p-3">
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <span className="text-gray-400">ML Models Analyzed:</span>
                                      <div className="text-white font-medium">{raceInsight.total_ml_horses_analyzed}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Value Opportunities:</span>
                                      <div className="text-green-400 font-medium">{race.total_value_bets}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Value Bet Analysis Button */}
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <button
                            onClick={() => getValueBetAnalysis(race.race_id, race.course_name, race.off_time)}
                            disabled={isLoadingInsight || !!raceInsight}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                          >
                            {isLoadingInsight ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : raceInsight ? (
                              <span className="text-green-300">✓</span>
                            ) : (
                              <PoundSterling className="w-4 h-4" />
                            )}
                            <span>
                              {isLoadingInsight ? 'Analyzing Value...' : raceInsight ? 'Value Analysis Ready' : 'Analyse Value Bets'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <PoundSterling className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">
                    {mlValueBetsResponse?.data?.message || 'No ML Value Bets Found'}
                  </h3>
                  <p className="text-gray-500">
                    No top-rated ML horses found with odds 6/1+ today
                  </p>
                  <div className="mt-4 text-sm text-gray-400">
                    Current London Time: {mlValueBetsResponse?.data?.london_time || londonTime}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trainer Intent - Updated to match Value Bets design */}
          {activeTab === 'trainer_intent' && (
            <div className="space-y-4">
              {trainerIntentLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                </div>
              ) : trainerIntents && trainerIntents.length > 0 ? (
                <div className="space-y-4">
                  {/* Group trainer intents by race */}
                  {(() => {
                    const groups = trainerIntents.reduce((acc, intent) => {
                      const raceKey = `${intent.course}_${intent.off_time}`
                      if (!acc[raceKey]) {
                        acc[raceKey] = {
                          race_id: intent.race_id || `intent_${raceKey}`,
                          course_name: intent.course,
                          off_time: intent.off_time,
                          intents: []
                        }
                      }
                      acc[raceKey].intents.push(intent)
                      return acc
                    }, {} as Record<string, {
                      race_id: string;
                      course_name: string;
                      off_time: string;
                      intents: typeof trainerIntents;
                    }>)
                    
                    return (Object.values(groups) as {
                      race_id: string;
                      course_name: string;
                      off_time: string;
                      intents: typeof trainerIntents;
                    }[])
                      .sort((a, b) => a.off_time.localeCompare(b.off_time))
                      .map((raceGroup) => {
                        const raceInsight = raceInsights[raceGroup.race_id]
                        const isLoadingInsight = loadingInsights[raceGroup.race_id] || false
                        
                        return (
                          <div
                            key={raceGroup.race_id}
                            className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:border-yellow-400/50 transition-colors"
                          >
                            {/* Race Header - Same as Value Bets */}
                            <div className="mb-4">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="text-xl font-bold text-white">{raceGroup.course_name}</h3>
                                <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                                  Trainer Intent
                                </span>
                                <div className="flex items-center space-x-1 text-yellow-400">
                                  <Clock className="w-4 h-4" />
                                  <span className="font-bold">{formatTime(raceGroup.off_time)}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Trainer Intent Signals - Same card style as Value Bets */}
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Trainer Intent Signals</h4>
                              <div className="grid gap-3">
                                {raceGroup.intents.map((intent, index) => (
                                  <div key={intent.id} className="bg-gray-700/50 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-3">
                                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                          {index + 1}
                                        </div>
                                        <HorseNameWithSilk 
                                          horseName={intent.horse_name} 
                                          silkUrl={intent.silk_url}
                                          className="text-yellow-400 font-bold text-lg"
                                        />
                                      </div>
                                      <div className="text-right">
                                        <div className="text-green-400 font-bold text-lg">{intent.current_odds || 'TBC'}</div>
                                        <div className="text-yellow-400 font-medium text-sm">
                                          {capConfidence(intent.confidence_score)}%
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="text-xs text-gray-400 mb-2">
                                      {intent.trainer_name} • {intent.jockey_name || 'Unknown'}
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                      <div className="flex flex-wrap gap-1">
                                        <span className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                          {intent.is_single_runner ? 'Single Runner' : 'Intent Signal'} #1
                                        </span>
                                        {intent.strike_rate && (
                                          <span className="bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                            {intent.strike_rate.toFixed(1)}% Strike Rate
                                          </span>
                                        )}
                                        <span className={`border px-2 py-0.5 rounded text-xs font-medium ${
                                          intent.confidence_score >= 80 ? 'bg-green-600/20 text-green-400 border-green-600/30' :
                                          intent.confidence_score >= 60 ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' :
                                          'bg-gray-600/20 text-gray-400 border-gray-600/30'
                                        }`}>
                                          High Confidence
                                        </span>
                                      </div>
                                      <ShortlistButton
                                        horseName={intent.horse_name}
                                        raceTime={intent.off_time || 'TBC'}
                                        course={intent.course}
                                        odds={intent.current_odds}
                                        source="trainer_intent"
                                        jockeyName={intent.jockey_name}
                                        trainerName={intent.trainer_name}
                                        mlInfo={intent.is_single_runner ? `Single Runner Intent | Strike Rate: ${intent.strike_rate?.toFixed(1) || 'N/A'}%` : `Trainer Intent | Strike Rate: ${intent.strike_rate?.toFixed(1) || 'N/A'}%`}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            {/* AI Insights Results */}
                            {raceInsight && (
                              <div className="border-t border-gray-700 pt-4">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center space-x-2">
                                    <Brain className="w-5 h-5 text-purple-400" />
                                    <span className="text-lg font-bold text-white">AI Trainer Intent Analysis</span>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-400">Confidence:</span>
                                    <span className={`text-xl font-bold ${getConfidenceColor(raceInsight.confidence_score)}`}>
                                      {capConfidence(raceInsight.confidence_score)}%
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="grid md:grid-cols-2 gap-6">
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 mb-2">Travel & Intent Analysis</h5>
                                    <FormattedAnalysisText 
                                      text={raceInsight.analysis} 
                                      className="mb-4"
                                    />
                                    
                                    <h5 className="text-sm font-medium text-gray-400 mb-2">Key Intent Insights</h5>
                                    <ul className="space-y-1">
                                      {raceInsight.key_insights.map((insight, index) => (
                                        <li key={index} className="text-sm text-gray-300 flex items-start space-x-2">
                                          <ChevronRight className="w-3 h-3 mt-0.5 text-yellow-400 flex-shrink-0" />
                                          <span>{insight}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 mb-2">Trainer Commitment Assessment</h5>
                                    <p className="text-gray-300 text-sm leading-relaxed mb-4">
                                      {raceInsight.risk_assessment}
                                    </p>
                                    
                                    <div className="bg-gray-700/30 rounded-lg p-3">
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                          <span className="text-gray-400">Horse Analyzed:</span>
                                          <div className="text-white font-medium">{raceGroup.intents[0]?.horse_name}</div>
                                        </div>
                                        <div>
                                          <span className="text-gray-400">Analysis Timestamp:</span>
                                          <div className="text-green-400 font-medium">{new Date(raceInsight.timestamp).toLocaleTimeString()}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* AI Analyser Button */}
                            <div className="mt-4 pt-4 border-t border-gray-700">
                              <button
                                onClick={() => getTrainerIntentAnalysis(raceGroup.race_id, raceGroup.course_name, raceGroup.off_time)}
                                disabled={isLoadingInsight || !!raceInsight}
                                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                              >
                                {isLoadingInsight ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : raceInsight ? (
                                  <span className="text-green-300">✓</span>
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                                <span>
                                  {isLoadingInsight ? 'Analyzing Intent...' : raceInsight ? 'Intent Analysis Ready' : 'AI Trainer Analysis'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )
                      })
                  })()}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Eye className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">No Trainer Intent Signals</h3>
                  <p className="text-gray-500">No trainer intent patterns detected for today</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}