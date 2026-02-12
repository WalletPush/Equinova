import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { supabase, callSupabaseFunction } from '@/lib/supabase'
import { fetchFromSupabaseFunction, createSupabaseClient } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { getUKDateTime, formatTime, getQueryDateKey, getDateStatusLabel, isRaceUpcoming, compareRaceTimes } from '@/lib/dateUtils'
import { normalizeField, formatNormalized, getNormalizedColor } from '@/lib/normalize'
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
    horse_id: string
    race_id: string
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
    horse_id: string
    race_id: string
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
    horse_id: string
    race_id: string
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
    abandoned_courses?: string[]
    abandoned_count?: number
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
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<'upcoming_races' | 'ai_top_picks' | 'ml_value_bets' | 'trainer_intent' | 'market_movers'>('upcoming_races')
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
  // Fetch market movers directly from `horse_market_movement` (only backed/shortening horses,
  // using `odds_movement_pct` filter as requested)
  const { data: persistentMarketMoversData, isLoading: persistentMarketMoversLoading } = useQuery({
    queryKey: ['market-movers'],
    queryFn: async () => {
      console.log('Fetching market movers from horse_market_movement...')

      const { data: rows, error } = await supabase
        .from('horse_market_movement')
        .select('*')
        .eq('odds_movement', 'steaming')
        .order('last_updated', { ascending: false })

      if (error) {
        console.error('Error fetching horse_market_movement:', error)
        throw error
      }

      // Enrich market mover rows with race_entries (horse name, jockey, trainer, silks)
      const horseIds = Array.from(new Set((rows || []).map((r: any) => r.horse_id).filter(Boolean)))
      let entries: any[] = []
      if (horseIds.length > 0) {
        const { data: fetchedEntries, error: entriesError } = await supabase
          .from('race_entries')
          .select('horse_id,horse_name,jockey_name,trainer_name,silk_url')
          .in('horse_id', horseIds)

        if (entriesError) {
          console.warn('Failed to fetch race_entries for market movers enrichment:', entriesError)
        } else {
          entries = fetchedEntries || []
        }
      }

      const entryMap = new Map(entries.map((e: any) => [e.horse_id, e]))
      // Also fetch race metadata for accurate date + off_time handling
      const raceIds = Array.from(new Set((rows || []).map((r: any) => r.race_id).filter(Boolean)))
      let races: any[] = []
      if (raceIds.length > 0) {
        const { data: fetchedRaces, error: racesError } = await supabase
          .from('races')
          .select('race_id,course_name,off_time,date')
          .in('race_id', raceIds)

        if (racesError) {
          console.warn('Failed to fetch races for market movers enrichment:', racesError)
        } else {
          races = fetchedRaces || []
        }
      }

      const raceMap = new Map(races.map((r: any) => [r.race_id, r]))

      const currentUKDateTime = getUKDateTime().dateTime // 'YYYY-MM-DD HH:MM'

      const marketMovers = (rows || []).map((m: any) => {
        const entry = entryMap.get(m.horse_id)
        const race = raceMap.get(m.race_id) || {}

        // normalize off_time display using existing helper
        const offTimeRaw = race.off_time || m.off_time || ''
        const displayOffTime = formatTime(offTimeRaw)
        const raceDate = race.date || ''
        const raceDateTime = raceDate && displayOffTime ? `${raceDate} ${displayOffTime}` : ''

        return {
          horse_id: m.horse_id,
          race_id: m.race_id,
          horse_name: m.horse_name || entry?.horse_name || 'Unknown',
          course: m.course || race.course_name || m.course_name,
          off_time: displayOffTime,
          race_date_time: raceDateTime,
          jockey_name: m.jockey_name || entry?.jockey_name || null,
          trainer_name: m.trainer_name || entry?.trainer_name || null,
          silk_url: entry?.silk_url || m.silk_url || null,
          bookmaker: m.bookmaker,
          initial_odds: m.initial_odds,
          current_odds: m.current_odds,
          odds_movement: m.odds_movement,
          odds_movement_pct: m.odds_movement_pct,
          last_updated: m.last_updated,
          first_detected_at: m.created_at || m.first_detected_at,
          total_movements: m.change_count ?? 1,
          latest_change: m,
          _raceRaw: race
        }
      })

      // Filter out races that have already started using UK-aware date+time comparison
      const currentUK = getUKDateTime().dateTime // 'YYYY-MM-DD HH:MM'
      const upcomingMovers = marketMovers.filter((m: any) => {
        if (!m.race_date_time) return false
        return m.race_date_time > currentUK
      })

      // Group by race (course + time) to match the frontend structure
      const raceGroups = upcomingMovers.reduce((acc: any, mover: any) => {
        const raceKey = `${mover.course}_${mover.off_time}`
        if (!acc[raceKey]) {
          acc[raceKey] = {
            race_id: `mover_${raceKey}`,
            course_name: mover.course,
            off_time: mover.off_time,
            movers: []
          }
        }
        acc[raceKey].movers.push(Object.assign({ id: mover.horse_id }, mover))
        return acc
      }, {})

      // Sort races chronologically (handles AM storage quirk)
      const sortedRaces = Object.values(raceGroups).sort((a: any, b: any) => {
        return compareRaceTimes(a.off_time, b.off_time)
      })

      console.log('Market movers fetched successfully', { marketMoversCount: marketMovers.length })

      return {
        market_movers: marketMovers,
        race_groups: sortedRaces,
        total_movers: marketMovers.length,
        total_races: sortedRaces.length
      }
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 // Auto-refresh every minute
  })

  // Fetch AI Top Picks
  const { data: aiTopPicksData, isLoading: aiTopPicksLoading } = useQuery({
    queryKey: ['ai-top-picks'],
    queryFn: async () => {
      console.log('Fetching AI Top Picks...')
      const { data, error } = await supabase.functions.invoke('get-ai-top-picks', {
        body: {}
      })
      
      if (error) {
        console.error('Error invoking AI Top Picks API:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('AI Top Picks API returned error:', data.error)
        throw new Error(data.error?.message || 'AI Top Picks API failed')
      }
      
      console.log('AI Top Picks fetched successfully:', data.data)
      return data.data
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 3,
    retryDelay: 1000,
    refetchInterval: 1000 * 60 // Auto-refresh every minute
  })

  const persistentMarketMovers = persistentMarketMoversData?.race_groups || []
  const upcomingRaces = upcomingRacesResponse?.data?.upcoming_races || []
  const mlValueBets = mlValueBetsResponse?.data?.value_bet_races || []
  const aiTopPicks = aiTopPicksData || []

  // Fetch race_entries for top-rated ML horses per race (rf, xgboost, benter, mlp, ensemble)
  const { data: topRatedMapData, isLoading: topRatedLoading } = useQuery({
    queryKey: ['race_entries_top_models', getQueryDateKey(), upcomingRaces?.length, aiTopPicks?.length, mlValueBets?.length, trainerIntentResponse?.data?.trainer_intent_signals?.length],
    queryFn: async () => {
      try {
        const raceIds = Array.from(new Set([
          ...(upcomingRaces || []).map((r: any) => r.race_id),
          ...(trainerIntentResponse?.data?.trainer_intent_signals || []).map((t: any) => t.race_id),
          ...(aiTopPicks || []).map((p: any) => p.race_id),
          ...(mlValueBets || []).flatMap((r: any) => [r.race_id, ...(r.top_value_bets || []).map((b: any) => b.race_id)].filter(Boolean))
        ].filter(Boolean)))

        if (!raceIds || raceIds.length === 0) return {}

        const { data: entries, error } = await supabase
          .from('race_entries')
          .select('id,horse_id,race_id,rf_proba,xgboost_proba,benter_proba,mlp_proba,ensemble_proba')
          .in('race_id', raceIds)

        if (error) {
          console.error('Failed to fetch race_entries for top models:', error)
          return {}
        }

        const grouped: Record<string, any[]> = {}
        for (const e of entries || []) {
          if (!grouped[e.race_id]) grouped[e.race_id] = []
          grouped[e.race_id].push(e)
        }

        const result: Record<string, any> = {}
        for (const raceId of Object.keys(grouped)) {
          const rows = grouped[raceId]
          const models = ['rf_proba','xgboost_proba','benter_proba','mlp_proba','ensemble_proba']
          const topModels: Record<string, Set<string>> = {}
          const ensembleMap: Record<string, number> = {}

          for (const m of models) {
            let max = -Infinity
            for (const r of rows) {
              const val = Number(r[m] ?? -Infinity)
              if (isNaN(val)) continue
              if (val > max) max = val
            }
            // include both race_entries.horse_id and race_entries.id keys for matching
            topModels[m] = new Set()
            for (const r of rows.filter(r => Number(r[m]) === max)) {
              if (r.horse_id != null) topModels[m].add(String(r.horse_id))
              if (r.id != null) topModels[m].add(String(r.id))
            }
          }

          for (const r of rows) {
            if (r.horse_id != null) ensembleMap[String(r.horse_id)] = Number(r.ensemble_proba) || 0
            if (r.id != null) ensembleMap[String(r.id)] = Number(r.ensemble_proba) || 0
          }

          // topAny is union of all model top sets
          const topAny = new Set<string>()
          for (const s of Object.values(topModels)) for (const h of s) topAny.add(h)

          result[raceId] = { topModels, topAny, ensembleMap, entries: rows }
        }

        return result
      } catch (err) {
        console.error('Error computing topRatedMap:', err)
        return {}
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
    // Run once we have data from any tab that needs normalization
    enabled: (upcomingRaces && upcomingRaces.length > 0) ||
      (trainerIntentResponse?.data?.trainer_intent_signals && trainerIntentResponse.data.trainer_intent_signals.length > 0) ||
      (aiTopPicks && aiTopPicks.length > 0) ||
      (mlValueBets && mlValueBets.length > 0)
  })

  const topRatedMap = topRatedMapData || {}

  // Compute normalization sums per race for display
  const raceEnsembleSum = React.useMemo(() => {
    const sums: Record<string, number> = {}
    for (const [raceId, data] of Object.entries(topRatedMap)) {
      const d = data as any
      if (d.entries?.length) {
        sums[raceId] = d.entries.reduce(
          (acc: number, e: any) => acc + (Number(e.ensemble_proba) || 0),
          0
        )
      }
    }
    return sums
  }, [topRatedMap])

  // Normalize a raw ensemble_proba for a specific race
  const normalizeProba = React.useCallback(
    (rawProba: number, raceId: string): number => {
      const sum = raceEnsembleSum[raceId]
      if (!sum || sum <= 0) return rawProba // fallback to raw
      return rawProba / sum
    },
    [raceEnsembleSum]
  )

  const londonTime = getDateStatusLabel() // Use consistent UK timezone

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      if (activeTab === 'upcoming_races') {
        await refetchUpcomingRaces()
      } else if (activeTab === 'ai_top_picks') {
        await refetchAIInsider() // Will refetch AI Top Picks
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

  // Enhanced Value Bet Analysis - sends ALL value bet horses in the race for comparative analysis
  const getValueBetAnalysis = async (raceId: string, course: string, offTime: string) => {
    console.log('getValueBetAnalysis called', { raceId, course, offTime })
    const targetRace = mlValueBets.find((race: any) => race.race_id === raceId)
    if (!targetRace) {
      throw new Error('No Value Bets found for analysis')
    }
    const allValueBets = targetRace.top_value_bets
    if (!allValueBets?.length) {
      throw new Error('No value bet horses found for analysis')
    }

    const uiInsightKey = raceId
    if (loadingInsights[uiInsightKey]) return
    setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: true }))

    try {
      // Look up race_entries IDs for ALL value bet horses in this race
      const horseNames = allValueBets.map((b: any) => b.horse_name)
      const { data: horsesData, error: horseError } = await supabase
        .from('race_entries')
        .select('horse_id,id,horse_name')
        .eq('race_id', raceId)
        .in('horse_name', horseNames)

      if (horseError || !horsesData?.length) {
        throw new Error(`Failed to find horse IDs for ${horseNames.join(', ')}`)
      }

      const finalInsightKey = raceId

      // Send ALL value bet horse IDs for comparative analysis
      const response = await fetchFromSupabaseFunction('enhanced-value-bet-analysis', {
        method: 'POST',
        body: JSON.stringify({
          raceId: raceId,
          horseIds: horsesData.map((h: any) => h.id.toString()),
          openaiApiKey: profile?.openai_api_key
        })
      })

      const payload = await response.json()
      const body = payload?.data || payload || {}
      const analysisData: AIMarketInsight = {
        race_id: raceId,
        course: course,
        off_time: offTime,
        analysis: body.analysis || body.aiAnalysis || '',
        key_insights: body.key_insights || [],
        risk_assessment: body.risk_level || 'Unknown',
        confidence_score: body.confidence_score || 0,
        total_ml_horses_analyzed: targetRace.field_size || 0,
        horses_with_movement: body.horses_with_movement || 0,
        market_confidence_horses: body.market_confidence_horses || [],
        timestamp: new Date().toISOString()
      }
      setRaceInsights(prev => ({ ...prev, [finalInsightKey]: analysisData }))
      console.log(`Value Bet analysis completed for race ${raceId} (${horsesData.length} horses analyzed)`)
    } catch (error) {
      console.error(`Failed to get Value Bet analysis for race ${raceId}:`, error)
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
      setRaceInsights(prev => ({ ...prev, [uiInsightKey]: errorData }))
    } finally {
      setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: false }))
    }
  }

  // Enhanced Trainer Intent Analysis - EXACT COPY of AI Top Pick with different function call
  const getTrainerIntentAnalysis = async (raceId: string, course: string, offTime: string, horseIdOverride?: string) => {
    console.log('getTrainerIntentAnalysis called', { raceId, course, offTime, horseIdOverride })
    // Find the trainer intent using horse_name (more reliable than horse_id)
    const targetIntent = trainerIntents.find(intent => intent.race_id === raceId)
    if (!targetIntent) {
      throw new Error('No trainer intent found for analysis')
    }
    // Use simple raceId key (like Code 2) to avoid key mismatches
    const uiInsightKey = raceId
    if (loadingInsights[uiInsightKey]) return

    setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: true }))

    try {
      // Get the horse identifiers using horse_name (more reliable)
      const { data: horseData, error: horseError } = await supabase
        .from('race_entries')
        .select('horse_id,id')
        .eq('race_id', raceId)
        .eq('horse_name', targetIntent.horse_name)
        .single()

      if (horseError || !horseData) {
        throw new Error(`Failed to find horse ID for ${targetIntent.horse_name}`)
      }

      // Store result using simple raceId key
      const finalInsightKey = raceId

      // ONLY DIFFERENCE: Call openai-trainer-intent-analysis instead of ai-race-analysis
      const response = await fetchFromSupabaseFunction('openai-trainer-intent-analysis', {
        method: 'POST',
        body: JSON.stringify({
          raceId: raceId,
          horseId: horseData.id.toString(),
          openaiApiKey: profile?.openai_api_key
        })
      })

      const payload = await response.json()
      const body = payload?.data || payload || {}
      const analysisData: AIMarketInsight = {
        race_id: raceId,
        course: course,
        off_time: offTime,
        analysis: body.analysis || body.aiAnalysis || '',
        key_insights: body.key_insights || [],
        risk_assessment: body.risk_level || 'Unknown',
        confidence_score: body.confidence_score || 0,
        total_ml_horses_analyzed: 1,
        horses_with_movement: body.horses_with_movement || 0,
        market_confidence_horses: body.market_confidence_horses || [],
        timestamp: new Date().toISOString()
      }
      setRaceInsights(prev => ({ ...prev, [finalInsightKey]: analysisData }))
      console.log(`Trainer Intent analysis completed for race ${raceId}`)
    } catch (error) {
      console.error(`Failed to get Trainer Intent analysis for race ${raceId}:`, error)
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
      setRaceInsights(prev => ({ ...prev, [uiInsightKey]: errorData }))
    } finally {
      setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: false }))
    }
  }

  // AI Top Pick Analysis (mirrors value bet analysis but targets AI Top Picks)
  const getAiTopPickAnalysis = async (raceId: string, course: string, offTime: string) => {
    console.log('getAiTopPickAnalysis called', { raceId, course, offTime })
    // Determine top pick and key by raceId::horseId
    const targetRace = aiTopPicks.find((pick: any) => pick.race_id === raceId)
    if (!targetRace) {
      throw new Error('No AI Top Picks found for analysis')
    }
    const topPick = aiTopPicks.filter((p: any) => p.race_id === raceId)[0]
    if (!topPick) {
      throw new Error('No top pick horse found for analysis')
    }
    // Use the exact same key format as the UI
    const uiInsightKey = topPick.horse_id ? `${raceId}::${topPick.horse_id}` : raceId
    if (loadingInsights[uiInsightKey]) return

    setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: true }))

    try {
      // Find the AI top pick race
      const targetRace = aiTopPicks.find((pick: any) => pick.race_id === raceId)
      if (!targetRace) {
        throw new Error('No AI Top Picks found for analysis')
      }

      // Prefer the first top pick horse
      const topPick = aiTopPicks.filter((p: any) => p.race_id === raceId)[0]
      if (!topPick) {
        throw new Error('No top pick horse found for analysis')
      }

      // Get the horse identifiers from race_entries table
      const { data: horseData, error: horseError } = await supabase
        .from('race_entries')
        .select('horse_id,id')
        .eq('race_id', raceId)
        .eq('horse_name', topPick.horse_name)
        .single()

      if (horseError || !horseData) {
        throw new Error(`Failed to find horse ID for ${topPick.horse_name}`)
      }

      // Store result using the same key the UI is checking (topPick.horse_id, not horseData.horse_id)
      const finalInsightKey = `${raceId}::${topPick.horse_id}`

      // Use same server-side race analysis as RaceDetailPage for top pick
      const response = await fetchFromSupabaseFunction('ai-race-analysis', {
        method: 'POST',
        body: JSON.stringify({
          raceId: raceId,
          openaiApiKey: profile?.openai_api_key
        })
      })

      const payload = await response.json()
      const body = payload?.data || payload || {}
      const mcData = body.monte_carlo_data || {}
      const analysisData: AIMarketInsight = {
        race_id: raceId,
        course: course,
        off_time: offTime,
        analysis: body.analysis || body.aiAnalysis || '',
        key_insights: body.key_insights || [],
        risk_assessment: body.risk_level || 'Unknown',
        confidence_score: body.confidence_score || 0,
        total_ml_horses_analyzed: topPick.field_size || 0,
        horses_with_movement: body.horses_with_movement || 0,
        market_confidence_horses: body.market_confidence_horses || [],
        timestamp: new Date().toISOString()
      }
      setRaceInsights(prev => ({ ...prev, [finalInsightKey]: analysisData }))
      console.log(`AI Top Pick analysis completed for race ${raceId}`)
      console.log(`OpenAI top pick analysis completed for ${topPick.horse_name}`)
    } catch (error) {
      console.error(`Failed to get OpenAI top pick analysis for race ${raceId}:`, error)
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
      setRaceInsights(prev => ({ ...prev, [uiInsightKey]: errorData }))
    } finally {
      setLoadingInsights(prev => ({ ...prev, [uiInsightKey]: false }))
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
    mutationFn: async ({ horseName, raceTime, course, odds, source, jockeyName, trainerName, mlInfo, horseId, raceId }: {
      horseName: string
      raceTime: string
      course: string
      odds?: string
      source: 'value_bet' | 'trainer_intent' | 'market_mover' | 'ai_top_picks'
      jockeyName?: string
      trainerName?: string
      mlInfo?: string
      horseId?: string
      raceId?: string
    }) => {
      // Client-side validation to avoid calling function with missing required fields
      if (!horseName || !raceTime || !course) {
        console.error('addToShortlistMutation: missing required fields', { horseName, raceTime, course })
        throw new Error('Missing required fields for shortlist: horseName, raceTime, course')
      }

      const payload = {
        horse_name: horseName,
        race_time: raceTime,
        course: course,
        current_odds: odds || 'N/A',
        source: source,
        jockey_name: jockeyName || null,
        trainer_name: trainerName || null,
        ml_info: mlInfo || null,
        horse_id: horseId || null,
        race_id: raceId || null
      }
      console.log('addToShortlistMutation: payload', payload)
      try {
        const res = await callSupabaseFunction('add-to-shortlist', payload)
        console.log('addToShortlistMutation: response', res)
        return res
      } catch (err) {
        console.error('addToShortlistMutation: error', err)
        throw err
      }
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
      const payload = { horse_name: horseName, course }
      console.log('removeFromShortlistMutation: payload', payload)
      try {
        const res = await callSupabaseFunction('remove-from-shortlist', payload)
        console.log('removeFromShortlistMutation: response', res)
        return res
      } catch (err) {
        console.error('removeFromShortlistMutation: error', err)
        throw err
      }
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
    source: 'value_bet' | 'trainer_intent' | 'market_mover' | 'ai_top_picks',
    jockeyName?: string,
    trainerName?: string,
    mlInfo?: string,
    horseId?: string,
    raceId?: string
  ) => {
    const operationKey = horseName
    setShortlistOperations(prev => ({ ...prev, [operationKey]: true }))
    console.log('handleShortlistToggle start', { horseName, course, source })
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
          mlInfo,
          horseId,
          raceId
        })
      }
    } catch (error) {
      console.error('Shortlist operation failed:', error)
      // Show error feedback if needed
    } finally {
      setShortlistOperations(prev => ({ ...prev, [operationKey]: false }))
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

  // Reusable badge renderer for model/top badges (keeps same styling as Value Bets)
  const renderModelBadges = (labels?: string[] | Set<string> | null) => {
    if (!labels) return null
    const arr = Array.isArray(labels) ? labels : Array.from(labels)
    if (!arr || arr.length === 0) return null
    return arr.map((label, idx) => (
      <span key={idx} className="ml-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded text-xs font-medium">
        {label}
      </span>
    ))
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
    mlInfo,
    horseId,
    raceId
  }: {
    horseName: string
    raceTime: string
    course: string
    odds?: string
    source: 'value_bet' | 'trainer_intent' | 'market_mover' | 'ai_top_picks'
    jockeyName?: string
    trainerName?: string
    mlInfo?: string
    horseId?: string
    raceId?: string
  }) => {
    const isInShortlist = isHorseInShortlist(horseName, course)
    const isLoading = shortlistOperations[horseName] || false
    const lastToggleRef = useRef<number>(0)

    const handleButtonToggle = (e?: React.SyntheticEvent) => {
      e?.preventDefault?.()
      e?.stopPropagation?.()
      console.log('Shortlist button event', { horseName, course, source })
      if (isLoading) return
      const now = Date.now()
      if (now - lastToggleRef.current < 500) return
      lastToggleRef.current = now
      void handleShortlistToggle(horseName, raceTime, course, odds, source, jockeyName, trainerName, mlInfo, horseId, raceId)
    }

    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleButtonToggle}
          onTouchEnd={handleButtonToggle}
          onPointerDown={handleButtonToggle}
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

        {/* no additional tooltip */}
      </div>
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
      id: 'ai_top_picks' as const,
      label: 'AI Top Picks',
      icon: Award,
      count: aiTopPicks?.length || 0
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
      count: persistentMarketMovers?.length || 0
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

          {/* Abandoned Meeting Banner */}
          {upcomingRacesResponse?.data?.abandoned_count > 0 && (
            <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/30 flex items-center space-x-3 mb-4">
              <span className="text-red-400 text-lg flex-shrink-0">&#x26A0;</span>
              <p className="text-sm">
                <span className="text-red-400 font-semibold">Meeting Abandoned</span>
                <span className="text-gray-400"> — {upcomingRacesResponse.data.abandoned_courses?.join(', ')} ({upcomingRacesResponse.data.abandoned_count} race{upcomingRacesResponse.data.abandoned_count > 1 ? 's' : ''} excluded)</span>
              </p>
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
                  {[...upcomingRaces]
                    .sort((a, b) => compareRaceTimes(a.off_time, b.off_time)) // Chronological order
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
                                    <span className={`font-bold text-sm ${getNormalizedColor(normalizeProba(pick.ensemble_proba, race.race_id))}`} title="Normalized win probability">
                                      {(normalizeProba(pick.ensemble_proba, race.race_id) * 100).toFixed(1)}%
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
                                          <HorseNameWithSilk horseName={horse.horse_name} silkUrl={horse.silk_url} className="text-yellow-400 font-bold text-lg" />
                                          <div className="text-sm text-gray-400 mt-1">{horse.trainer_name} • {horse.jockey_name}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-green-400 font-bold text-lg">{horse.current_odds}</div>
                                          <div className={`text-sm font-medium ${getConfidenceColor(horse.confidence_score)}`}>{capConfidence(horse.confidence_score)}% confidence</div>
                                        </div>
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
              {persistentMarketMoversLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                </div>
              ) : persistentMarketMovers && persistentMarketMovers.length > 0 ? (
                <div className="space-y-4">
                  {/* Display persistent market movers grouped by race */}
                  {persistentMarketMovers.map((raceGroup: any) => (
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
                          {raceGroup.movers.map((mover: any, index: number) => {
                            // Determine model-specific #1 badges from `topRatedMap` (race_entries topModels)
                            const modelLabelMap: Record<string, string> = {
                              rf_proba: 'RF',
                              xgboost_proba: 'XGBoost',
                              benter_proba: 'Benter',
                              mlp_proba: 'MLP',
                              ensemble_proba: 'Ensemble'
                            }
                            const modelBadges: string[] = []
                            try {
                              const raceTop = topRatedMap?.[mover.race_id]
                              if (raceTop && raceTop.topModels) {
                                for (const key of Object.keys(modelLabelMap)) {
                                  const label = modelLabelMap[key]
                                  const set = raceTop.topModels[key]
                                  if (set && set.has(String(mover.horse_id))) modelBadges.push(label)
                                }
                              }
                            } catch (e) {
                              // ignore and leave modelBadges empty
                            }
                            
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
                                    <div className="text-green-400 font-bold text-lg">
                                      {mover.fractional_current || mover.current_odds}
                                    </div>
                                    <div className="text-gray-400 text-xs">
                                      was {mover.fractional_initial || mover.initial_odds}
                                    </div>
                                    <div className="text-yellow-400 font-medium text-sm">
                                      {mover.odds_movement_pct > 0 ? '+' : ''}{typeof mover.odds_movement_pct === 'number' ? mover.odds_movement_pct.toFixed(1) : mover.odds_movement_pct}%
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
                                      {mover.odds_movement === 'steaming' ? 'Backed' : mover.odds_movement === 'drifting' ? 'Drifting' : 'Stable'}
                                    </span>
                                    {modelBadges && modelBadges.length > 0 && modelBadges.map((b) => (
                                      <span key={b} className="bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                        {b} #1
                                      </span>
                                    ))}
                                  </div>
                                  <ShortlistButton
                                    horseName={mover.horse_name}
                                    raceTime={mover.off_time}
                                    course={mover.course}
                                    odds={mover.current_odds}
                                    source="market_mover"
                                    jockeyName={mover.jockey_name}
                                    trainerName={mover.trainer_name}
                                    mlInfo={`Movement: ${mover.odds_movement === 'steaming' ? 'Backed' : mover.odds_movement === 'drifting' ? 'Drifting' : 'Stable'} (${mover.odds_movement_pct > 0 ? '+' : ''}${mover.odds_movement_pct}%)`}
                                    horseId={mover.horse_id}
                                    raceId={mover.race_id}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
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

          {/* AI Top Picks - EXACT COPY OF ML VALUE BETS STRUCTURE */}
          {activeTab === 'ai_top_picks' && (
            <div className="space-y-4">
              {aiTopPicksLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
                    <span className="text-gray-400">Analyzing AI top picks...</span>
                  </div>
                </div>
              ) : aiTopPicks && aiTopPicks.length > 0 ? (
                <div className="space-y-4">
                  {(() => {
                    // Group AI Top Picks by race (same as ML Value Bets)
                    const groupedRaces = aiTopPicks.reduce((acc: any, pick: any) => {
                      const raceKey = pick.race_id
                      if (!acc[raceKey]) {
                        acc[raceKey] = {
                          race_id: pick.race_id,
                          course_name: pick.course_name,
                          off_time: pick.off_time,
                          race_class: pick.race_class || 'Class 4',
                          distance: pick.dist || '1m',
                          field_size: pick.field_size || 10,
                          prize: pick.prize || '8140',
                          surface: pick.surface || 'Turf',
                          ai_top_picks: []
                        }
                      }
                      acc[raceKey].ai_top_picks.push(pick)
                      return acc
                    }, {})

                    return Object.values(groupedRaces).sort((a: any, b: any) => compareRaceTimes(a.off_time, b.off_time)).map((race: any) => {
                      // Use horse-specific insight key so analyses don't collide with race-level insights
                      const topHorseId = race.ai_top_picks?.[0]?.horse_id
                      const insightKey = topHorseId ? `${race.race_id}::${topHorseId}` : race.race_id
                      const raceInsight = raceInsights[insightKey]
                      const isLoadingInsight = loadingInsights[insightKey] || false

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
                              <div className="flex items-center space-x-1">
                                <Trophy className="w-4 h-4" />
                                <span className="text-green-400 font-medium">£{race.prize}</span>
                              </div>
                              <div className="text-gray-300 text-xs bg-gray-700 px-2 py-0.5 rounded">
                                {race.surface}
                              </div>
                            </div>
                          </div>

                          {/* AI Top Picks List */}
                          {race.ai_top_picks.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">AI Top Picks (3+ Models Agree)</h4>
                              <div className="grid gap-3">
                                {race.ai_top_picks.map((pick: any, index: number) => (
                                  <div key={pick.horse_id} className="bg-gray-700/50 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-3">
                                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                          {pick.number || index + 1}
                                        </div>
                                        <HorseNameWithSilk 
                                          horseName={pick.horse_name}
                                          silkUrl={pick.silk_url}
                                          className="text-yellow-400 font-bold text-lg"
                                        />
                                      </div>
                                      <div className="text-right">
                                        <div className="text-green-400 font-bold text-lg">{pick.current_odds || 'TBC'}</div>
                                        <div className={`font-medium text-sm ${(() => {
                                          const rawEns = pick.horse_id && topRatedMap[race.race_id]?.ensembleMap?.[String(pick.horse_id)]
                                          const rawVal = rawEns || pick.ensemble_proba || pick.max_probability || 0
                                          return rawVal ? getNormalizedColor(normalizeProba(rawVal, race.race_id)) : 'text-yellow-400'
                                        })()}`}>
                                          {(() => {
                                            // Use normalized ensemble probability from full race field
                                            const rawEns = pick.horse_id && topRatedMap[race.race_id]?.ensembleMap?.[String(pick.horse_id)]
                                            const rawVal = rawEns || pick.ensemble_proba || pick.max_probability
                                            if (rawVal) return `${(normalizeProba(rawVal, race.race_id) * 100).toFixed(1)}%`
                                            return 'N/A'
                                          })()}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="text-xs text-gray-400 mb-2">
                                      {pick.trainer_name || 'Unknown'} • {pick.jockey_name || 'Unknown'}
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="flex flex-wrap gap-1">
                                        <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-xs font-medium">
                                          {pick.ai_reason}
                                        </span>
                                      </div>
                                      <ShortlistButton
                                        horseName={pick.horse_name}
                                        raceTime={pick.off_time}
                                        course={pick.course_name}
                                        odds={pick.current_odds ? `${pick.current_odds}/1` : undefined}
                                        source="ai_top_picks"
                                        jockeyName={pick.jockey_name}
                                        trainerName={pick.trainer_name}
                                        mlInfo={`AI Top Pick: ${pick.ai_reason}`}
                                        horseId={pick.horse_id}
                                        raceId={pick.race_id}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* AI Insights Results for Top Pick */}
                          {raceInsight && (
                            <div className="border-t border-gray-700 pt-4">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                  <Brain className="w-5 h-5 text-purple-400" />
                                  <span className="text-lg font-bold text-white">AI Top Pick Analysis</span>
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
                                  <FormattedAnalysisText text={raceInsight.analysis} className="mb-4" />

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
                                  <p className="text-gray-300 text-sm leading-relaxed mb-4">{raceInsight.risk_assessment}</p>

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
                              {raceInsight.market_confidence_horses && raceInsight.market_confidence_horses.length > 0 && (
                                <div className="mt-6">
                                  <h5 className="text-sm font-medium text-gray-400 mb-3">Market Confidence Horses</h5>
                                  <div className="grid gap-3">
                                    {raceInsight.market_confidence_horses.map((horse) => (
                                      <div key={horse.horse_id} className="bg-gray-700/50 rounded-lg p-4">
                                        <div className="flex items-start justify-between mb-3">
                                          <div>
                                            <HorseNameWithSilk horseName={horse.horse_name} silkUrl={horse.silk_url} className="text-yellow-400 font-bold text-lg" />
                                            <div className="text-sm text-gray-400 mt-1">{horse.trainer_name} • {horse.jockey_name}</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-green-400 font-bold text-lg">{horse.current_odds}</div>
                                            <div className={`text-sm font-medium ${getConfidenceColor(horse.confidence_score)}`}>{capConfidence(horse.confidence_score)}% confidence</div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* AI Top Pick Analysis Button (race level) */}
                          <div className="mt-4 pt-4 border-t border-gray-700">
                            <button
                              onClick={() => getAiTopPickAnalysis(race.race_id, race.course_name, race.off_time)}
                              disabled={isLoadingInsight || !!raceInsight}
                              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                            >
                              {isLoadingInsight ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : raceInsight ? (
                                <span className="text-green-300">✓</span>
                              ) : (
                                <Brain className="w-4 h-4" />
                              )}
                              <span>
                                {isLoadingInsight ? 'Analyzing Top Pick...' : raceInsight ? 'Top Pick Analysis Ready' : 'Analyse AI Top Pick'}
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
                  <Award className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">No AI Top Picks</h3>
                  <p className="text-gray-500">No horses meet the AI Top Picks criteria</p>
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
                  {[...mlValueBets].sort((a, b) => compareRaceTimes(a.off_time, b.off_time)).map((race) => {
                    // Use simple raceId key (like Code 2) to avoid key mismatches
                    const insightKey = race.race_id
                    const raceInsight = raceInsights[insightKey]
                    const isLoadingInsight = loadingInsights[insightKey] || false
                    
                    // Debug logging
                    if (race.race_id === Object.keys(raceInsights)[0]?.split('::')[0]) {
                      console.log('Value Bets UI looking for key:', insightKey)
                      console.log('Available insight keys:', Object.keys(raceInsights))
                      console.log('Found raceInsight:', !!raceInsight)
                    }
                    
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
                                      <div className={`font-medium text-sm ${getNormalizedColor(normalizeProba(bet.ensemble_proba, race.race_id))}`} title="Normalized win probability">
                                        {(normalizeProba(bet.ensemble_proba, race.race_id) * 100).toFixed(1)}%
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="text-xs text-gray-400 mb-2">
                                    {bet.trainer_name} • {bet.jockey_name}
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-wrap gap-1">
                                      {renderModelBadges(bet.top_in_models?.map((m: string) => `${m} #1`))}
                                    </div>
                                    <ShortlistButton
                                      horseName={bet.horse_name}
                                      raceTime={race.off_time}
                                      course={race.course_name}
                                      odds={`${bet.current_odds}/1`}
                                      source="value_bet"
                                      jockeyName={bet.jockey_name}
                                      trainerName={bet.trainer_name}
                                      mlInfo={`ML: ${(normalizeProba(bet.ensemble_proba, race.race_id) * 100).toFixed(1)}% | Models: ${(bet.top_in_models ?? []).join(', ')}`}
                                      horseId={bet.horse_id}
                                      raceId={race.race_id}
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
                      .sort((a, b) => compareRaceTimes(a.off_time, b.off_time))
                      .map((raceGroup) => {
                        // Use simple raceId key (like Code 2) to avoid key mismatches
                        const intentInsightKey = raceGroup.race_id
                        const raceInsight = raceInsights[intentInsightKey]
                        const isLoadingInsight = loadingInsights[intentInsightKey] || false
                        
                        // Debug logging
                        if (raceGroup.race_id === Object.keys(raceInsights)[0]?.split('::')[0]) {
                          console.log('Trainer Intent UI looking for key:', intentInsightKey)
                          console.log('Available insight keys:', Object.keys(raceInsights))
                          console.log('Found raceInsight:', !!raceInsight)
                        }
                        
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
                                {raceGroup.intents.map((intent, index) => {
                                  const topRated = topRatedMap?.[intent.race_id]
                                  const horseKey = String(intent.horse_id)
                                  const modelKeys = ['rf_proba','xgboost_proba','benter_proba','mlp_proba','ensemble_proba']
                                  const modelLabels: Record<string,string> = {
                                    rf_proba: 'Random Forest #1',
                                    xgboost_proba: 'XGBoost #1',
                                    benter_proba: 'Benter #1',
                                    mlp_proba: 'MLP #1',
                                    ensemble_proba: 'Ensemble #1'
                                  }
                                  const matchedModels: string[] = []
                                  if (topRated) {
                                    for (const k of modelKeys) {
                                      if (topRated.topModels && topRated.topModels[k] && topRated.topModels[k].has(horseKey)) {
                                        matchedModels.push(modelLabels[k])
                                      }
                                    }
                                  }

                                  return (
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
                                          {!topRatedLoading && topRated ? renderModelBadges(matchedModels) : null}
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
                                          horseId={intent.horse_id}
                                          raceId={intent.race_id}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
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
                                onClick={() => getTrainerIntentAnalysis(raceGroup.race_id, raceGroup.course_name, raceGroup.off_time, raceGroup.intents?.[0]?.horse_id)}
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

// Diagnostic toast rendered at root of AIInsiderPage to aid debugging in-browser
export function AIInsiderDebugToast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed right-4 top-20 z-50">
      <div className="bg-yellow-500/90 text-black px-4 py-2 rounded shadow">{message}</div>
    </div>
  )
}