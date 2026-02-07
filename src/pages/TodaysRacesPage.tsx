import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ShortlistButton } from '@/components/ShortlistButton'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { supabase, Race, callSupabaseFunction } from '@/lib/supabase'
import { 
  Clock, 
  MapPin, 
  Trophy, 
  Users, 
  TrendingUp, 
  Star,
  Calendar,
  ChevronRight,
  ChevronDown,
  Bot,
  RefreshCw
} from 'lucide-react'

export function TodaysRacesPage() {
  // Use UK timezone for proper date detection
  const [selectedDate, setSelectedDate] = useState(() => {
    const ukDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    return ukDate // Already in YYYY-MM-DD format
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedRace, setExpandedRace] = useState<string | null>(null)
  const queryClient = useQueryClient()
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

  // Fetch user's shortlist
  const { data: userShortlist, refetch: refetchShortlist } = useQuery({
    queryKey: ['userShortlist'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        console.log('No authenticated user for shortlist')
        return []
      }

      const data = await callSupabaseFunction('get-shortlist', {});
      
      return data?.data || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  })

  // Helper function to check if horse is in shortlist
  const isHorseInShortlist = (horseName: string, course: string): boolean => {
    if (!userShortlist || !Array.isArray(userShortlist)) return false
    return userShortlist.some(item => 
      item.horse_name === horseName && item.course === course
    )
  }

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

  const races = (racesData as any)?.races || []

  const formatTime = (timeString: string) => {
    if (!timeString) return ''
    return timeString.substring(0, 5)
  }

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }

  const getConfidenceColor = (proba: number) => {
    if (proba >= 0.7) return 'text-green-400'
    if (proba >= 0.5) return 'text-yellow-400'
    return 'text-gray-400'
  }

  const getConfidenceStars = (proba: number) => {
    if (proba >= 0.8) return 5
    if (proba >= 0.6) return 4
    if (proba >= 0.4) return 3
    if (proba >= 0.2) return 2
    return 1
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
          
          {/* Line 2: Refresh button and date controls */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
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
          
          {/* Line 3: Dynamic race summary (only for today) */}
          {selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) && raceStatsData && (
            <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
              <p className="text-gray-300 text-sm">
                <span className="text-yellow-400 font-medium">{raceStatsData.summary_message}</span>
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
                className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 hover:border-yellow-400/30 rounded-lg transition-all duration-200"
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
                                  i < getConfidenceStars(topPrediction.ensemble_proba) 
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
                              onHorseClick={(entry) => openHorseDetail(entry, {
                                course_name: race.course_name,
                                off_time: race.off_time,
                                race_id: race.race_id
                              })}
                              horseEntry={topPrediction}
                            />
                            <div className="text-sm text-gray-400 mt-1">
                              {topPrediction.jockey_name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold ${getConfidenceColor(topPrediction.ensemble_proba)}`}>
                              {(topPrediction.ensemble_proba * 100).toFixed(1)}%
                            </div>
                            <div className="text-sm text-gray-400">
                              Confidence
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Complete Runners List - ORIGINAL DISPLAY RESTORED */}
                    {race.topEntries && race.topEntries.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-300">All Runners</h4>
                        <div className="space-y-2">
                          {race.topEntries.map((entry, index) => (
                            <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-gray-700/30 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                  {entry.number}
                                </div>
                                <div>
                                  <HorseNameWithSilk 
                                    horseName={entry.horse_name}
                                    silkUrl={entry.silk_url}
                                    className="text-white text-sm font-medium"
                                    clickable={true}
                                    onHorseClick={(entry) => openHorseDetail(entry, {
                                      course_name: race.course_name,
                                      off_time: race.off_time,
                                      race_id: race.race_id
                                    })}
                                    horseEntry={entry}
                                  />
                                  <div className="text-xs text-gray-400 mt-1">
                                    {entry.jockey_name}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {entry.ensemble_proba > 0 && (
                                  <div className={`text-sm font-medium ${getConfidenceColor(entry.ensemble_proba)}`}>
                                    {(entry.ensemble_proba * 100).toFixed(1)}%
                                  </div>
                                )}
                                {entry.current_odds && (
                                  <div className="text-sm text-gray-300 font-mono">
                                    {entry.current_odds}/1
                                  </div>
                                )}
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    onClick={() => openHorseDetail(entry, {
                                      course_name: race.course_name,
                                      off_time: race.off_time,
                                      race_id: race.race_id
                                    })}
                                    className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors leading-tight"
                                  >
                                    Form
                                  </button>
                                  <ShortlistButton 
                                    horseName={entry.horse_name}
                                    raceContext={raceContext}
                                    odds={entry.current_odds ? String(entry.current_odds) : undefined}
                                    jockeyName={entry.jockey_name}
                                    trainerName={entry.trainer_name}
                                    isInShortlist={isHorseInShortlist(entry.horse_name, race.course_name)}
                                    size="small"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
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