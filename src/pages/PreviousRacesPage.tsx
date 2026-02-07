import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase, Race } from '@/lib/supabase'
import { normalizeField, formatNormalized } from '@/lib/normalize'
import { 
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
  Target,
  Award,
  BarChart3
} from 'lucide-react'

export function PreviousRacesPage() {
  // Cap confidence at 100% to prevent values over 100%
  const capConfidence = (score: number): number => {
    return Math.min(100, Math.max(0, score || 0))
  }

  // Use UK timezone for proper date detection - default to yesterday (races should be finished)
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date()
    const ukToday = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }))
    ukToday.setDate(ukToday.getDate() - 1) // Yesterday in UK timezone
    return ukToday.toLocaleDateString('en-CA') // YYYY-MM-DD format
  })
  
  const [searchTerm, setSearchTerm] = useState('')

  const { data: racesData, isLoading, error, isFetching } = useQuery({
    queryKey: ['previous-races', selectedDate],
    queryFn: async () => {
      console.log(`Fetching previous races for ${selectedDate}...`)
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
      
      console.log(`Previous races for ${selectedDate} fetched successfully: ${data.data.races?.length || 0} races`)
      return data.data
    },
    staleTime: 1000 * 60 * 5, // 5 minutes (historical data changes less frequently)
    retry: 3,
    retryDelay: 1000,
    placeholderData: keepPreviousData // Keep previous data while fetching new data
  })

  // Fetch ML Performance Analysis for today's date only
  const { data: mlPerformanceData } = useQuery({
    queryKey: ['ml-performance-analysis', selectedDate],
    queryFn: async () => {
      console.log('Fetching ML performance analysis...')
      const { data, error } = await supabase.functions.invoke('ml-performance-analysis', {
        body: { date: selectedDate }
      })
      
      if (error) {
        console.error('Error fetching ML performance analysis:', error)
        throw error
      }
      
      if (!data.success) {
        console.error('ML performance analysis API returned error:', data.error)
        throw new Error(data.error?.message || 'ML performance analysis API failed')
      }
      
      console.log('ML performance analysis fetched successfully')
      return data.data
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 3,
    retryDelay: 1000,
    enabled: true // Fetch for any selected date
  })

  const races = (racesData as any)?.races || []
  
  // Get current UK time for proper filtering
  const currentUKTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/London' })
  const currentUKDate = new Date(currentUKTime).toLocaleDateString('en-CA')
  const isToday = selectedDate === currentUKDate
  
  // Filter races: only show races with results, or if today, only show completed races
  const filteredRaces = races.filter((race: Race) => {
    // Basic search filter
    const matchesSearch = race.course_name.toLowerCase().includes(searchTerm.toLowerCase())
    if (!matchesSearch) return false
    
    // If it's today, only show races that have finished (have results)
    if (isToday) {
      return race.hasResults === true
    }
    
    // For past dates, show all races (they should have results)
    return true
  })

  const goToPreviousDay = () => {
    const date = new Date(selectedDate + 'T00:00:00')
    date.setDate(date.getDate() - 1)
    setSelectedDate(date.toLocaleDateString('en-CA'))
  }

  const goToNextDay = () => {
    const ukToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (selectedDate < ukToday) {
      const date = new Date(selectedDate + 'T00:00:00')
      date.setDate(date.getDate() + 1)
      setSelectedDate(date.toLocaleDateString('en-CA'))
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return ''
    return timeString.substring(0, 5)
  }

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }

  const ukToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const canGoNext = selectedDate < ukToday

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Previous Races</h1>
          <p className="text-gray-400">Browse historical race results and data</p>
          
          {/* ML Performance Summary */}
          {mlPerformanceData && (
            <div className="mt-4 bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
              <p className="text-gray-300 text-sm">
                <span className="text-yellow-400 font-medium">
                  {isToday ? `In today's races there were ${mlPerformanceData.totalWinners} ML winners` : `On ${selectedDate} there were ${mlPerformanceData.totalWinners} ML winners`}
                </span>
                {mlPerformanceData.data_source === 'estimated_performance' && (
                  <span className="text-gray-400 text-xs ml-2">
                    (estimated based on {mlPerformanceData.models?.[1]?.predictions || 'race'} races)
                  </span>
                )}
                {mlPerformanceData.has_actual_data && (
                  <span className="text-green-400 text-xs ml-2">
                    (verified results)
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* ML Performance Dashboard */}
        {mlPerformanceData && (
          <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">ML Performance Dashboard</h2>
            </div>
            
            <div className="space-y-3">
              {mlPerformanceData.models.map((model: any, index: number) => {
                const gradeColor = model.grade === 'A' ? 'bg-green-500' : model.grade === 'B' ? 'bg-yellow-500' : 'bg-red-500'
                const winPercentage = model.predictions > 0 ? ((model.wins / model.predictions) * 100).toFixed(1) : '0.0'
                const top3Percentage = model.predictions > 0 ? ((model.top3 / model.predictions) * 100).toFixed(1) : '0.0'
                
                return (
                  <div key={index} className="bg-gray-700/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${gradeColor}`}></div>
                        <span className="text-white font-medium">{model.name}</span>
                        <span className="text-xs bg-gray-600 text-gray-300 px-2 py-1 rounded">
                          Grade {model.grade}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-yellow-400 font-medium">
                          {capConfidence(model.confidence)}% Confidence
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Winner Accuracy</span>
                          <span className="text-sm text-green-400 font-medium">{winPercentage}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Top-3 Accuracy</span>
                          <span className="text-sm text-blue-400 font-medium">{top3Percentage}%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Predictions</span>
                          <span className="text-sm text-white font-medium">{model.predictions}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Winners</span>
                          <span className="text-sm text-yellow-400 font-medium">{model.wins}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Date Navigation */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousDay}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="text-center">
              <div className="text-lg font-semibold text-white">
                {formatDate(selectedDate)}
              </div>
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
              className={`p-2 transition-colors ${
                canGoNext 
                  ? 'text-gray-400 hover:text-white' 
                  : 'text-gray-600 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
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

        {/* Loading */}
        {(isLoading || isFetching) && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
              <span className="text-gray-400">
                {isFetching ? 'Loading new date...' : 'Loading races...'}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load races. Please try again.</p>
          </div>
        )}

        {/* No races */}
        {!isLoading && !isFetching && filteredRaces.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {searchTerm ? 'No races found' : 
               isToday ? 'No Results Yet' : 'No races on this date'}
            </h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try a different search term' : 
               isToday ? 'Race results will appear here once races are completed' : 'Try selecting a different date'}
            </p>
          </div>
        )}

        {/* Race Cards */}
        <div className="space-y-4">
          {filteredRaces.map((race: Race) => (
            <Link
              key={race.race_id}
              to={`/race/${race.race_id}`}
              className="block"
            >
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 hover:border-yellow-400/50 rounded-xl p-6 transition-all duration-200 hover:bg-gray-800">
                {/* Race Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {race.course_name}
                      </h3>
                      <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                        {race.race_class}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
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

                {/* Top Entries Preview */}
                {race.topEntries && race.topEntries.length > 0 && (() => {
                  const raceNormMap = normalizeField(race.topEntries, 'ensemble_proba', 'horse_id')
                  return (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">
                      {race.hasResults ? 'Results' : 'Top Predictions'}
                    </h4>
                    {race.topEntries.slice(0, 3).map((entry, index) => {
                      // Use actual finishing position if available, otherwise use predicted position
                      const position = race.hasResults && entry.finishing_position ? entry.finishing_position : (index + 1)
                      const positionColor = 
                        position === 1 ? 'bg-yellow-500 text-gray-900' :
                        position === 2 ? 'bg-gray-400 text-gray-900' :
                        position === 3 ? 'bg-amber-600 text-white' :
                        'bg-gray-600 text-white'
                      
                      return (
                        <div key={entry.id} className="flex items-center justify-between py-2 px-3 bg-gray-700/30 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${positionColor}`}>
                              {position}
                            </div>
                            <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                              {entry.number}
                            </div>
                            <div>
                              <div className="text-white text-sm font-medium">
                                {entry.horse_name}
                              </div>
                              <div className="text-xs text-gray-400">
                                {entry.jockey_name}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            {race.hasResults ? (
                              <div className="text-xs text-gray-400">
                                {position === 1 ? 'Winner!' : 
                                 position === 2 ? 'Second' :
                                 position === 3 ? 'Third' : `${position}th`}
                              </div>
                            ) : (
                              entry.ensemble_proba && (
                                <div className="text-xs text-gray-400">
                                  {formatNormalized(raceNormMap.get(String(entry.horse_id)) ?? 0)} win prob
                                </div>
                              )
                            )}
                            {entry.current_odds && (
                              <div className="text-sm text-gray-300 font-mono">
                                {entry.current_odds}/1
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}

                {/* Going & Surface */}
                <div className="flex items-center space-x-4 mt-4 pt-4 border-t border-gray-700">
                  <div className="text-sm text-gray-400">
                    <span className="text-gray-300">Going:</span> {race.going}
                  </div>
                  <div className="text-sm text-gray-400">
                    <span className="text-gray-300">Surface:</span> {race.surface}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}