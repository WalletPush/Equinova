import React, { useState } from 'react'
import { X, TrendingUp, TrendingDown, Minus, Star, Bot, Trophy, Clock, Target, Info, Heart, Check, Loader2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RaceEntry, supabase, callSupabaseFunction } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { OverviewTab, FormTab } from './HorseDetailTabs'
import { ConnectionsTab, PredictionsTab } from './HorseDetailTabsExtra'
import type { SmartSignal, PatternAlert } from '@/types/signals'

interface RaceContext {
  course_name?: string
  off_time?: string
  race_id?: string
}

interface HorseDetailModalProps {
  entry: RaceEntry
  raceContext?: RaceContext | null
  patternAlerts?: PatternAlert[]
  smartSignals?: SmartSignal[]
  isOpen: boolean
  onClose: () => void
}

interface TabConfig {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const tabs: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'form', label: 'Form', icon: TrendingUp },
  { id: 'connections', label: 'Connections', icon: Trophy },
  { id: 'predictions', label: 'AI Analysis', icon: Bot }
]

export function HorseDetailModal({ entry, raceContext, patternAlerts, smartSignals, isOpen, onClose }: HorseDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [shortlistOperations, setShortlistOperations] = useState<Record<string, boolean>>({})
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Get course from race context or fetch race data as fallback
  const { data: raceData } = useQuery({
    queryKey: ['race-for-course', entry.race_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('races')
        .select('course_name, off_time')
        .eq('race_id', entry.race_id)
        .single()
      
      if (error) {
        console.error('Error fetching race data:', error)
        return null
      }
      
      return data
    },
    enabled: isOpen && !!entry.race_id && !raceContext?.course_name, // Only query if we don't have race context
    staleTime: 1000 * 60 * 10 // 10 minutes
  })

  // Use provided race context or fallback to queried data
  const effectiveRaceData = raceContext?.course_name ? raceContext : raceData

  // Fetch user's shortlist
  const { data: userShortlist } = useQuery({
    queryKey: ['userShortlist'],
    queryFn: async () => {
      if (!user) {
        return []
      }

      const data = await callSupabaseFunction('get-shortlist', {});
      
      return data?.data || []
    },
    enabled: isOpen && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  })

  // Add to shortlist mutation
  const addToShortlistMutation = useMutation({
    mutationFn: async ({ horseName, raceTime, course, odds, source, jockeyName, trainerName }: {
      horseName: string
      raceTime: string
      course: string
      odds?: string
      source: 'today_races'
      jockeyName?: string
      trainerName?: string
    }) => {
      if (!user) {
        throw new Error('Please log in to add horses to your shortlist')
      }

      console.log('Adding horse to shortlist:', {
        horse_name: horseName,
        race_time: raceTime,
        course: course,
        current_odds: odds || 'N/A',
        source: source,
        jockey_name: jockeyName,
        trainer_name: trainerName
      })

      const data = await callSupabaseFunction('add-to-shortlist', { 
        horse_name: horseName, 
        race_time: raceTime, 
        course, 
        current_odds: odds || 'N/A', 
        source, 
        jockey_name: jockeyName || null, 
        trainer_name: trainerName || null, 
        ml_info: "Selected from Today's Races" 
      })
      
      console.log('Successfully added to shortlist:', data)
      return data
    },
    onSuccess: (data, variables) => {
      console.log(`Added ${variables.horseName} to shortlist successfully`)
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
      if (!user) {
        throw new Error('Please log in to manage your shortlist')
      }

      const data = await callSupabaseFunction('remove-from-shortlist', {
        horse_name: horseName,
        course: course,
      });
      
      return data
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
  const handleShortlistToggle = async () => {
    console.log('Shortlist toggle clicked for:', entry.horse_name)
    
    if (!effectiveRaceData?.course_name) {
      console.error('Course information not available:', effectiveRaceData)
      return
    }

    if (!user) {
      console.error('User not authenticated')
      return
    }

    const operationKey = entry.horse_name
    console.log('Setting loading state for:', operationKey)
    setShortlistOperations(prev => ({ ...prev, [operationKey]: true }))
    
    try {
      const isInShortlist = isHorseInShortlist(entry.horse_name, effectiveRaceData.course_name)
      console.log('Horse is currently in shortlist:', isInShortlist)
      
      if (isInShortlist) {
        console.log('Removing horse from shortlist...')
        await removeFromShortlistMutation.mutateAsync({ 
          horseName: entry.horse_name, 
          course: effectiveRaceData.course_name 
        })
      } else {
        console.log('Adding horse to shortlist...')
        // Get race time from the race data
        const raceTime = effectiveRaceData.off_time || '15:30'
        console.log('Race time:', raceTime)
        
        await addToShortlistMutation.mutateAsync({ 
          horseName: entry.horse_name, 
          raceTime: raceTime,
          course: effectiveRaceData.course_name, 
          odds: entry.current_odds?.toString(),
          source: 'today_races' as const,
          jockeyName: entry.jockey_name,
          trainerName: entry.trainer_name
        })
      }
    } catch (error) {
      console.error('Shortlist operation failed:', error)
      setShortlistOperations(prev => ({ ...prev, [operationKey]: false }))
    }
  }

  // Shortlist Button Component
  const ShortlistButton = () => {
    if (!effectiveRaceData?.course_name || !user) return null
    
    const isInShortlist = isHorseInShortlist(entry.horse_name, effectiveRaceData.course_name)
    const isLoading = shortlistOperations[entry.horse_name] || false
    
    return (
      <button
        onClick={handleShortlistToggle}
        disabled={isLoading}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          isInShortlist 
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isInShortlist ? 'Remove from shortlist' : 'Add to shortlist'}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isInShortlist ? (
          <>
            <Check className="w-4 h-4" />
            <span>Shortlisted</span>
          </>
        ) : (
          <>
            <Heart className="w-4 h-4" />
            <span>Add to Shortlist</span>
          </>
        )}
      </button>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            {entry.silk_url && (
              <img 
                src={entry.silk_url} 
                alt={`${entry.horse_name} silk`} 
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            )}
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-white">{entry.horse_name}</h2>
                {entry.current_odds && (
                  <span className="text-xl font-bold text-yellow-400">
                    {entry.current_odds}/1
                  </span>
                )}
              </div>
              <p className="text-gray-400">#{entry.number} • {entry.age}yo {entry.sex}</p>
              
              {/* Shortlist Button - positioned right below horse info */}
              <div className="mt-3">
                <ShortlistButton />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation - 2x2 Grid Layout */}
        <div className="border-b border-gray-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Row 1: Overview | Form & Performance */}
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'overview'
                  ? 'bg-yellow-400 text-gray-900 font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Info className="w-4 h-4" />
              <span className="font-medium">Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('form')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'form'
                  ? 'bg-yellow-400 text-gray-900 font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Form</span>
            </button>
            
            {/* Row 2: Connections | AI Analysis */}
            <button
              onClick={() => setActiveTab('connections')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'connections'
                  ? 'bg-yellow-400 text-gray-900 font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span className="font-medium">Connections</span>
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'predictions'
                  ? 'bg-yellow-400 text-gray-900 font-semibold'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span className="font-medium">AI Analysis</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'overview' && <OverviewTab entry={entry} />}
          {activeTab === 'form' && <FormTab entry={entry} />}
          {activeTab === 'connections' && <ConnectionsTab entry={entry} />}
          {activeTab === 'predictions' && <PredictionsTab entry={entry} raceId={raceContext?.race_id || entry.race_id} patternAlerts={patternAlerts} smartSignals={smartSignals} />}
        </div>
      </div>
    </div>
  )
}
