import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { callSupabaseFunction } from '@/lib/supabase'
import { Plus, Check, Loader2, AlertCircle } from 'lucide-react'

interface RaceContext {
  race_id: string
  course_name: string
  off_time: string
  race_time?: string // alias for compatibility
}

interface AddToSelectionsButtonProps {
  horseName: string
  raceContext: RaceContext
  odds?: string | number
  jockeyName?: string
  trainerName?: string
  size?: 'normal' | 'small'
  onSuccess?: () => void
  customRaceEntryId?: string // Allow custom ID for shortlist items
}

export function AddToSelectionsButton({ 
  horseName, 
  raceContext, 
  odds,
  jockeyName,
  trainerName,
  size = 'normal',
  onSuccess,
  customRaceEntryId
}: AddToSelectionsButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isAdded, setIsAdded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Add to selections mutation
  const addToSelectionsMutation = useMutation({
    mutationFn: async () => {
      console.log('Adding to selections:', { horseName, raceContext })
      
      // Create a unique race entry ID
      const raceTime = raceContext.race_time || raceContext.off_time
      const raceEntryId = customRaceEntryId || `selection_${horseName.replace(/\s+/g, '_')}_${raceContext.course_name.replace(/\s+/g, '_')}_${raceTime.replace(/:/g, '')}`
      
      const payload = {
        race_entry_id: raceEntryId,
        horse_name: horseName,
        horse_id: horseName.toLowerCase().replace(/\s+/g, '_'),
        race_id: raceContext.race_id || `race_${raceContext.course_name.replace(/\s+/g, '_')}_${raceTime.replace(/:/g, '')}`,
        race_time: raceTime,
        course_name: raceContext.course_name,
        jockey_name: jockeyName || null,
        trainer_name: trainerName || null,
        current_odds: odds ? String(odds) : null,
        notes: 'Added from shortlist'
      }
      
      console.log('Selections payload:', payload)
      return await callSupabaseFunction('add-to-selections', payload)
    },
    onSuccess: () => {
      console.log(`Added ${horseName} to selections successfully`)
      queryClient.invalidateQueries({ queryKey: ['user-selections'] })
      setIsAdded(true)
      setError(null)
      onSuccess?.()
      
      // Reset after showing success feedback
      setTimeout(() => {
        setIsLoading(false)
        setIsAdded(false)
      }, 2000)
    },
    onError: (error: Error) => {
      console.error('Error adding to selections:', error)
      setError(error.message)
      setIsLoading(false)
      setIsAdded(false)
    }
  })

  const handleAddToSelections = async () => {
    setIsLoading(true)
    setError(null)
    setIsAdded(false)
    
    try {
      await addToSelectionsMutation.mutateAsync()
    } catch (error: any) {
      console.error('Add to selections operation failed:', error)
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
    : isAdded 
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'  // Changed to red when added
    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30'

  return (
    <div className="relative">
      <button
        onClick={handleAddToSelections}
        disabled={isLoading || isAdded}
        className={`${baseClasses} ${sizeClasses} ${colorClasses}`}
        title={error || (isAdded ? 'Selection added to selections' : 'Add to selections')}
      >
        {isLoading ? (
          <Loader2 className={`animate-spin ${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
        ) : error ? (
          <>
            <AlertCircle className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span>Error</span>}
          </>
        ) : isAdded ? (
          <>
            <Check className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span>Selection Added</span>}
          </>
        ) : (
          <>
            <Plus className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
            {size === 'normal' && <span className="hidden sm:inline">Add to Selections</span>}
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