import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { PlaceBetButton } from '@/components/PlaceBetButton'
import { callSupabaseFunction } from '@/lib/supabase'
import { formatTime } from '@/lib/dateUtils'
import { formatOdds } from '@/lib/odds'
import { 
  List, 
  Star, 
  TrendingUp, 
  Brain, 
  Clock, 
  MapPin, 
  Trash2, 
  Eye, 
  DollarSign, 
  RefreshCw,
  AlertCircle,
  Heart,
  Calendar,
  Filter,
  Plus,
  Check,
  Loader2,
  PoundSterling,
  Award,
  Users,
  Trophy
} from 'lucide-react'

interface ShortlistItem {
  id: number
  user_id: string
  horse_name: string
  horse_id?: string
  race_time: string
  course: string
  race_id?: string
  current_odds?: string
  source: 'value_bet' | 'trainer_intent' | 'market_mover' | 'today_races' | 'ai_top_picks'
  jockey_name?: string
  trainer_name?: string
  ml_info?: string
  created_at: string
  updated_at: string
}

export function ShortListPage() {
  const [activeTab, setActiveTab] = useState<'value_bet' | 'trainer_intent' | 'market_mover' | 'today_races' | 'ai_top_picks'>('value_bet')
  const [removingItems, setRemovingItems] = useState<Record<number, boolean>>({})
  const queryClient = useQueryClient()

  // Helper function to check if a race has finished
  const isRaceFinished = (raceTime: string): boolean => {
    try {
      const now = new Date()
      const currentTime = now.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/London',
        hour12: false // Use 24-hour format
      })
      
      // Convert race time from 12-hour to 24-hour format
      // Race times like "01:35" are actually 1:35 PM (13:35), not 1:35 AM
      const raceTimeFormatted = raceTime.substring(0, 5) // Get HH:MM format
      const [hours, minutes] = raceTimeFormatted.split(':').map(Number)
      
      // If hours are 01-11, they are PM times (add 12 hours)
      // If hours are 12, it's 12 PM (keep as 12)
      // If hours are 00, it's 12 AM (keep as 00)
      let adjustedHours = hours
      if (hours >= 1 && hours <= 11) {
        adjustedHours = hours + 12 // Convert to PM
      }
      
      const adjustedRaceTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      
      console.log(`Race time: ${raceTime} -> ${adjustedRaceTime}, Current time: ${currentTime}`)
      
      // If adjusted race time has passed, it's finished
      return adjustedRaceTime < currentTime
    } catch (error) {
      console.error('Error checking race finish time:', error)
      return false
    }
  }

  // Cleanup finished races mutation
  const cleanupFinishedRacesMutation = useMutation({
    mutationFn: async () => {
      return await callSupabaseFunction('cleanup-finished-races', {})
    },
    onSuccess: (data) => {
      console.log('Cleanup completed:', data)
      queryClient.invalidateQueries({ queryKey: ['userShortlist'] })
    },
    onError: (error) => {
      console.error('Cleanup failed:', error)
    }
  })

  // Fetch user's shortlist
  const { data: shortlistData, isLoading, error, refetch } = useQuery({
    queryKey: ['userShortlist'],
    queryFn: async () => {
      const data = await callSupabaseFunction('get-shortlist', {})
      
      // Return all shortlist items without filtering
      return data?.data || []
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 2
  })


  // Remove from shortlist mutation
  const removeFromShortlistMutation = useMutation({
    mutationFn: async ({ id, horseName, course }: {
      id: number
      horseName: string
      course: string
    }) => {
      return await callSupabaseFunction('remove-from-shortlist', {
        id: id,
        horse_name: horseName,
        course: course
      })
    },
    onSuccess: (data, variables) => {
      console.log(`Removed ${variables.horseName} from shortlist, ID: ${variables.id}`)
      console.log('Removed data:', data)
      
      // Update the cache directly instead of invalidating
      queryClient.setQueryData(['userShortlist'], (oldData: ShortlistItem[] | undefined) => {
        if (!oldData) return oldData
        console.log('Updating cache, removing item with ID:', variables.id)
        return oldData.filter(item => item.id !== variables.id)
      })
      
      setRemovingItems(prev => ({ ...prev, [variables.id]: false }))
    },
    onError: (error, variables) => {
      console.error('Error removing from shortlist:', error)
      setRemovingItems(prev => ({ ...prev, [variables.id]: false }))
    }
  })



  const handleRemove = async (item: ShortlistItem) => {
    console.log('Removing item with ID:', item.id, 'Horse:', item.horse_name, 'Course:', item.course)
    setRemovingItems(prev => ({ ...prev, [item.id]: true }))
    try {
      await removeFromShortlistMutation.mutateAsync({
        id: item.id,
        horseName: item.horse_name,
        course: item.course
      })
    } catch (error) {
      console.error('Remove operation failed:', error)
    }
  }



  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'value_bet': return <DollarSign className="w-4 h-4" />
      case 'trainer_intent': return <Eye className="w-4 h-4" />
      case 'market_mover': return <TrendingUp className="w-4 h-4" />
      case 'today_races': return <Calendar className="w-4 h-4" />
      default: return <Star className="w-4 h-4" />
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'value_bet': return 'Value Bet'
      case 'trainer_intent': return 'Trainer Intent'
      case 'market_mover': return 'Market Mover'
      case 'today_races': return 'Today\'s Races'
      case 'ai_top_picks': return 'AI Top Picks'
      default: return 'Unknown'
    }
  }

  // Define tabs array like in AIInsiderPage
  const tabs = [
    {
      id: 'value_bet' as const,
      label: 'Value Bets',
      icon: DollarSign,
      count: shortlistData ? shortlistData.filter(item => item.source === 'value_bet').length : 0
    },
    {
      id: 'trainer_intent' as const,
      label: 'Trainer Intent',
      icon: Eye,
      count: shortlistData ? shortlistData.filter(item => item.source === 'trainer_intent').length : 0
    },
    {
      id: 'market_mover' as const,
      label: 'Market Movers',
      icon: TrendingUp,
      count: shortlistData ? shortlistData.filter(item => item.source === 'market_mover').length : 0
    },
    {
      id: 'today_races' as const,
      label: 'Today\'s Races',
      icon: Calendar,
      count: shortlistData ? shortlistData.filter(item => item.source === 'today_races').length : 0
    },
    {
      id: 'ai_top_picks' as const,
      label: 'AI Top Picks',
      icon: Award,
      count: shortlistData ? shortlistData.filter(item => item.source === 'ai_top_picks').length : 0
    }
  ]

  // Filter shortlist based on selected tab (now includes ai_top_picks as regular shortlist items)
  const filteredShortlist = shortlistData?.filter(item => item.source === activeTab) || []

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Heart className="w-8 h-8 text-yellow-400" />
              <div>
                <h1 className="text-2xl font-bold text-white">Shortlist</h1>
                <p className="text-gray-400 text-sm">Your saved horses from AI Insider analysis</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Tabs - Identical to AI Insider navigation */}
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
        </div>

        {/* Content */}
        <div className="min-h-96">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-yellow-400" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
              <div className="flex items-center space-x-2 text-red-400 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error Loading Shortlist</span>
              </div>
              <p className="text-red-300 text-sm mb-4">
                {error?.message || 'Failed to load your shortlist'}
              </p>
              <button
                onClick={() => refetch()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && (
            (!filteredShortlist || filteredShortlist.length === 0) && (
              <div className="text-center py-12">
                <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-400 mb-2">
                  No {getSourceLabel(activeTab)} Horses
                </h3>
                <p className="text-gray-500 mb-4">
                  No horses added from {getSourceLabel(activeTab)} section
                </p>
                <p className="text-sm text-gray-400">
                  Visit the AI Insider tab and click "Shortlist" buttons to save horses here
                </p>
              </div>
            )
          )}


          {/* Shortlist Items - Value Bets Design */}
          {!isLoading && !error && filteredShortlist && filteredShortlist.length > 0 && (
            <div className="space-y-4">
              {/* Group shortlist items by race */}
              {(() => {
                const groups = filteredShortlist.reduce((acc, item) => {
                  const raceKey = `${item.course}_${item.race_time}`
                  if (!acc[raceKey]) {
                    acc[raceKey] = {
                      race_id: `shortlist_${raceKey}`,
                      course_name: item.course,
                      race_time: item.race_time,
                      items: []
                    }
                  }
                  acc[raceKey].items.push(item)
                  return acc
                }, {} as Record<string, {
                  race_id: string;
                  course_name: string;
                  race_time: string;
                  items: ShortlistItem[];
                }>)
                
                return (Object.values(groups) as {
                  race_id: string;
                  course_name: string;
                  race_time: string;
                  items: ShortlistItem[];
                }[])
                  .sort((a, b) => a.race_time.localeCompare(b.race_time))
                  .map((raceGroup) => (
                    <div
                      key={raceGroup.race_id}
                      className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden"
                    >
                      <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-400/10 border-b border-gray-700 px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2 text-yellow-400">
                              <Clock className="w-5 h-5" />
                              <span className="font-bold text-lg">{formatTime(raceGroup.race_time)}</span>
                            </div>
                            <div className="flex items-center space-x-2 text-white">
                              <MapPin className="w-5 h-5" />
                              <span className="font-semibold text-lg">{raceGroup.course_name}</span>
                            </div>
                          </div>
                          <div className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-3 py-1 rounded-full text-sm font-medium">
                            {raceGroup.items.length} selection{raceGroup.items.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-6">
                        <div className="grid gap-3">
                          {raceGroup.items
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((item, index) => (
                            <div key={item.id} className={`bg-gray-700/50 rounded-lg p-4 relative ${isRaceFinished(item.race_time) ? 'opacity-60 border border-red-500/30' : ''}`}>
                              {/* Delete Button - Top Right */}
                              <button
                                onClick={() => handleRemove(item)}
                                disabled={removingItems[item.id] || false}
                                className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-800/50 rounded-full"
                                title="Remove from shortlist"
                              >
                                {removingItems[item.id] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>

                              {/* Finished Race Indicator */}
                              {isRaceFinished(item.race_time) && (
                                <div className="absolute top-3 left-3 bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
                                  Race Finished
                                </div>
                              )}

                              <div className="flex items-center justify-between mb-2 pr-12">
                                <div className="flex items-center space-x-3">
                                  <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                                    {index + 1}
                                  </div>
                                  <HorseNameWithSilk 
                                    horseName={item.horse_name}
                                    className="text-yellow-400 font-bold text-lg"
                                  />
                                </div>
                                <div className="text-right">
                                  <div className="text-green-400 font-bold text-lg">{formatOdds(item.current_odds)}</div>
                                  <div className="text-gray-400 font-medium text-sm">
                                    Added {new Date(item.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="text-xs text-gray-400 mb-3">
                                {item.trainer_name || 'Unknown'} • {item.jockey_name || 'Unknown'}
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex flex-wrap gap-1">
                                  <span className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                    {getSourceLabel(item.source)} #1
                                  </span>
                                  {item.ml_info && (
                                    <span className="bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                      {item.ml_info.length > 30 ? item.ml_info.substring(0, 30) + '...' : item.ml_info}
                                    </span>
                                  )}
                                  <span className="bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 px-2 py-0.5 rounded text-xs font-medium">
                                    Saved
                                  </span>
                                </div>
                              </div>
                              
                              {/* Place Bet Button - Full Width at Bottom */}
                              {!isRaceFinished(item.race_time) && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                  <PlaceBetButton
                                    horseName={item.horse_name}
                                    raceContext={{
                                      race_id: `race_${item.course.replace(/\s+/g, '_')}_${item.race_time.replace(':', '')}`,
                                      course_name: item.course,
                                      off_time: item.race_time,
                                      race_time: item.race_time
                                    }}
                                    odds={formatOdds(item.current_odds)}
                                    jockeyName={item.jockey_name}
                                    trainerName={item.trainer_name}
                                    size="normal"
                                    customRaceEntryId={`shortlist_${item.id}_${item.horse_name.replace(/\s+/g, '_')}_${item.course.replace(/\s+/g, '_')}`}
                                    raceId={item.race_id}
                                    horseId={item.horse_id}
                                    onSuccess={() => {
                                      console.log(`Successfully placed bet on ${item.horse_name} from shortlist`)
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
              })()
              }
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}