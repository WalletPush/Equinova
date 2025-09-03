import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { callSupabaseFunction } from '@/lib/supabase'
import { Heart, Check, Loader2, AlertCircle } from 'lucide-react'

interface RaceContext {
  race_id: string
  course_name: string
  off_time: string
  race_time?: string // alias for compatibility
}

interface ShortlistButtonProps {
  horseName: string
  raceContext: RaceContext
  odds?: string | number
  jockeyName?: string
  trainerName?: string
  isInShortlist?: boolean
  size?: 'normal' | 'small'
  onToggle?: (isInShortlist: boolean) => void
}

export function ShortlistButton({ 
  horseName, 
  raceContext, 
  odds,
  jockeyName,
  trainerName,
  isInShortlist = false,
  size = 'normal',
  onToggle
}: ShortlistButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Add to shortlist mutation
  const addToShortlistMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        horse_name: horseName,
        race_time: raceContext.race_time || raceContext.off_time,
        course: raceContext.course_name,
        current_odds: odds ? String(odds) : 'N/A',
        source: 'today_races',
        jockey_name: jockeyName || null,
        trainer_name: trainerName || null
      }
      
      console.log('Adding to shortlist:', payload)
      return await callSupabaseFunction('add-to-shortlist', payload)
    },
    onSuccess: () => {
      console.log(`Added ${horseName} to shortlist`)
      queryClient.invalidateQueries({ queryKey: ['userShortlist'] })
      onToggle?.(true)
      setIsLoading(false)
      setError(null)
    },
    onError: (error: Error) => {
      console.error('Error adding to shortlist:', error)
      setError(error.message)
      setIsLoading(false)
    }
  })

  // Remove from shortlist mutation
  const removeFromShortlistMutation = useMutation({
    mutationFn: async () => {
      console.log('Removing from shortlist:', { horseName, course: raceContext.course_name })
      return await callSupabaseFunction('remove-from-shortlist', {
        horse_name: horseName,
        course: raceContext.course_name
      })
    },
    onSuccess: () => {
      console.log(`Removed ${horseName} from shortlist`)
      queryClient.invalidateQueries({ queryKey: ['userShortlist'] })
      onToggle?.(false)
      setIsLoading(false)
      setError(null)
    },
    onError: (error: Error) => {
      console.error('Error removing from shortlist:', error)
      setError(error.message)
      setIsLoading(false)
    }
  })

  const handleToggle = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      if (isInShortlist) {
        await removeFromShortlistMutation.mutateAsync()
      } else {
        await addToShortlistMutation.mutateAsync()
      }
    } catch (error: any) {
      console.error('Shortlist operation failed:', error)
      setError(error?.message || 'Operation failed')
      setIsLoading(false)
    }
  }

  const baseClasses = `flex items-center space-x-1 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`
  const sizeClasses = size === 'small' 
    ? 'px-2 py-1 text-xs' 
    : 'px-3 py-1.5 text-xs'
  const colorClasses = error 
    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
    : isInShortlist 
    ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30' 
    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`${baseClasses} ${sizeClasses} ${colorClasses}`}
        title={error || (isInShortlist ? 'Remove from shortlist' : 'Add to shortlist')}
      >
        {isLoading ? (
          <Loader2 className={`animate-spin ${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
        ) : error ? (
          <>
            <AlertCircle className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span>Error</span>}
          </>
        ) : isInShortlist ? (
          <>
            <Check className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span>Shortlisted</span>}
          </>
        ) : (
          <>
            <Heart className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span>Shortlist</span>}
          </>
        )}
      </button>
      
      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full left-0 mt-1 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  )
}