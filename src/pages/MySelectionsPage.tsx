import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Trophy, 
  Star,
  Trash2,
  Plus,
  TrendingUp,
  TrendingDown,
  Heart,
  Filter,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle,
  PoundSterling,
  X
} from 'lucide-react'

interface UserSelection {
  id: string
  user_id: string
  horse_name: string
  horse_id?: string
  race_id?: string
  race_time: string
  course_name: string
  jockey_name?: string
  trainer_name?: string
  current_odds?: string
  notes?: string
  created_at: string
  updated_at: string
}

interface SelectionCounts {
  upcoming: number
  past: number
  total: number
}

export function MySelectionsPage() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bettingSelection, setBettingSelection] = useState<UserSelection | null>(null)
  const [betAmount, setBetAmount] = useState('')
  const [betsPlaced, setBetsPlaced] = useState<Set<string>>(new Set())
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Fetch user selections
  const { data: selectionsData, isLoading, error, refetch } = useQuery({
    queryKey: ['user-selections', activeTab],
    queryFn: async () => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const data = await callSupabaseFunction('get-user-selections', {
        status: activeTab,
        sortBy: activeTab === 'upcoming' ? 'race_time' : 'created_at',
        sortOrder: activeTab === 'upcoming' ? 'asc' : 'desc'
      })
      
      console.log(`MySelectionsPage - Tab: ${activeTab}, Data:`, data)
      
      return {
        selections: data.data || [],
        counts: data.counts || { upcoming: 0, past: 0, total: 0 }
      }
    },
    enabled: !!user,
    staleTime: 0, // Force refetch every time
    retry: 3
  })

  // Remove selection mutation
  const removeSelectionMutation = useMutation({
    mutationFn: async (selectionId: string) => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const data = await callSupabaseFunction('remove-from-selections', { id: selectionId })
      
      return data
    },
    onSuccess: () => {
      // Invalidate both upcoming and past queries
      queryClient.invalidateQueries({ queryKey: ['user-selections', 'upcoming'] })
      queryClient.invalidateQueries({ queryKey: ['user-selections', 'past'] })
      setDeletingId(null)
    },
    onError: (error) => {
      console.error('Error removing selection:', error)
      setDeletingId(null)
    }
  })

  // Place bet mutation
  const placeBetMutation = useMutation({
    mutationFn: async ({ selection, amount }: { selection: UserSelection; amount: number }) => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Convert odds string to number (e.g., "5/2" to 2.5, "7/1" to 7)
      let oddsValue = 1
      if (selection.current_odds) {
        const oddsStr = selection.current_odds.replace(/[^\d\/]/g, '')
        if (oddsStr.includes('/')) {
          const [numerator, denominator] = oddsStr.split('/').map(Number)
          oddsValue = numerator / denominator
        } else {
          oddsValue = parseFloat(oddsStr) || 1
        }
      }

      // CORRECTED: Pass all available data for database lookup
      const data = await callSupabaseFunction('place-bet', {
        horse_name: selection.horse_name,
        horse_id: selection.horse_id,
        race_id: selection.race_id,
        course: selection.course_name,
        off_time: selection.race_time,
        trainer_name: selection.trainer_name,
        jockey_name: selection.jockey_name,
        current_odds: selection.current_odds,
        bet_amount: amount,
        odds: oddsValue
      })
      
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
      setBettingSelection(null)
      setBetAmount('')
      // Add the selection to bets placed
      const selectionKey = `${variables.selection.horse_name}-${variables.selection.course_name}-${variables.selection.race_time}`
      setBetsPlaced(prev => new Set([...prev, selectionKey]))
    },
    onError: (error) => {
      console.error('Error placing bet:', error)
    }
  })

  const handleRemoveSelection = async (selectionId: string) => {
    setDeletingId(selectionId)
    try {
      await removeSelectionMutation.mutateAsync(selectionId)
    } catch (error) {
      console.error('Failed to remove selection:', error)
    }
  }

  const handlePlaceBet = (selection: UserSelection) => {
    setBettingSelection(selection)
    setBetAmount('')
  }

  const handleConfirmBet = async () => {
    if (!bettingSelection || !betAmount || parseFloat(betAmount) <= 0) {
      return
    }
    
    try {
      await placeBetMutation.mutateAsync({
        selection: bettingSelection,
        amount: parseFloat(betAmount)
      })
    } catch (error) {
      console.error('Failed to place bet:', error)
    }
  }

  const closeBettingModal = () => {
    setBettingSelection(null)
    setBetAmount('')
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return ''
    return timeString.substring(0, 5)
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount)
  }

  const isToday = (dateString: string) => {
    const selectionDate = new Date(dateString).toDateString()
    const today = new Date().toDateString()
    return selectionDate === today
  }

  // Client-side filtering function
  const isRaceFinished = (selection: UserSelection): boolean => {
    try {
      // Check if it's from yesterday
      const selectionDate = new Date(selection.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const yesterdayDate = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      
      if (selectionDate === yesterdayDate) {
        return true; // Yesterday's races are definitely finished
      }
      
      if (selectionDate !== currentDate) {
        return false; // Future dates are not finished
      }
      
      // For today's races, compare time
      const currentTime = new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'Europe/London',
        hour12: false
      });
      
      const raceTimeFormatted = selection.race_time.substring(0, 5);
      const [hours, minutes] = raceTimeFormatted.split(':').map(Number);
      
      // Convert 12-hour to 24-hour format
      let adjustedHours = hours;
      if (hours >= 1 && hours <= 11) {
        adjustedHours = hours + 12;
      }
      
      const adjustedRaceTime = `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      return adjustedRaceTime <= currentTime;
    } catch (error) {
      console.error('Error checking race finish time:', error);
      return false; // Default to not finished if we can't parse
    }
  }

  const selections = selectionsData?.selections || []
  const counts = selectionsData?.counts || { upcoming: 0, past: 0, total: 0 }

  // Filter selections based on active tab
  const filteredSelections = selections.filter((selection: UserSelection) => {
    const isFinished = isRaceFinished(selection);
    return activeTab === 'upcoming' ? !isFinished : isFinished;
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-yellow-400 mb-2">Login Required</h3>
            <p className="text-gray-400">Please log in to view your selections.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-400 mb-2">Error Loading Selections</h3>
            <p className="text-gray-400 mb-4">Failed to load your selections. Please try again.</p>
            <button
              onClick={() => refetch()}
              className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 px-4 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-white">My Selections</h1>
            <p className="text-gray-400 text-sm">Track your race selections and results</p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-gray-700">
              <div className="text-lg font-bold text-white">{counts.total}</div>
              <div className="text-xs text-gray-400">Total</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 text-center border border-yellow-500/20">
              <div className="text-lg font-bold text-yellow-400">{counts.upcoming}</div>
              <div className="text-xs text-gray-400">Upcoming</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3 text-center border border-blue-500/20">
              <div className="text-lg font-bold text-blue-400">{counts.past}</div>
              <div className="text-xs text-gray-400">Past</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-yellow-400 text-gray-900 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Upcoming ({counts.upcoming})</span>
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'past'
                ? 'bg-yellow-400 text-gray-900 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Past ({counts.past})</span>
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
              <span className="text-gray-400">Loading selections...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredSelections.length === 0 && (
          <div className="text-center py-12">
            <Heart className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {activeTab === 'upcoming' ? 'No upcoming selections' : 'No past selections'}
            </h3>
            <p className="text-gray-500">
              {activeTab === 'upcoming' 
                ? 'Add horses to your selections from race pages'
                : 'Your completed selections will appear here'
              }
            </p>
          </div>
        )}

        {/* Selections List */}
        <div className="space-y-3">
          {filteredSelections.map((selection: UserSelection) => (
            <div
              key={selection.id}
              className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-4 hover:border-yellow-400/30 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Horse Name & Course */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {selection.horse_name}
                      </h3>
                      <div className="flex items-center space-x-3 text-sm text-gray-400">
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-4 h-4" />
                          <span>{selection.course_name}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(selection.race_time)}</span>
                        </div>
                        {selection.current_odds && (
                          <div className="flex items-center space-x-1">
                            <Trophy className="w-4 h-4" />
                            <span className="text-yellow-400 font-medium">{selection.current_odds}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons - Remove Button Only */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRemoveSelection(selection.id)}
                        disabled={deletingId === selection.id}
                        className="p-2 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove selection"
                      >
                        {deletingId === selection.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Connections */}
                  {(selection.jockey_name || selection.trainer_name) && (
                    <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
                      {selection.jockey_name && (
                        <div>
                          <span className="text-gray-300">Jockey:</span> {selection.jockey_name}
                        </div>
                      )}
                      {selection.trainer_name && (
                        <div>
                          <span className="text-gray-300">Trainer:</span> {selection.trainer_name}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selection Date & Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-xs text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>Selected {formatDate(selection.created_at)}</span>
                      </div>
                      {isToday(selection.created_at) && (
                        <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs font-medium">
                          Today
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                      !isRaceFinished(selection)
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {!isRaceFinished(selection) ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <CheckCircle className="w-3 h-3" />
                      )}
                      <span className="capitalize">{!isRaceFinished(selection) ? 'upcoming' : 'finished'}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {selection.notes && (
                    <div className="mt-2 p-2 bg-gray-700/30 rounded text-sm text-gray-300 border-l-2 border-yellow-400/30">
                      {selection.notes}
                    </div>
                  )}

                  {/* Place Bet Button - Moved to Bottom */}
                  {!isRaceFinished(selection) && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      {(() => {
                        const selectionKey = `${selection.horse_name}-${selection.course_name}-${selection.race_time}`
                        const hasBetPlaced = betsPlaced.has(selectionKey)
                        
                        if (hasBetPlaced) {
                          return (
                            <div className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg text-sm font-semibold">
                              <CheckCircle className="w-4 h-4" />
                              <span>Bet Placed</span>
                            </div>
                          )
                        }
                        
                        return (
                          <button
                            onClick={() => handlePlaceBet(selection)}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-500/20 text-green-300 border border-green-500/40 rounded-lg hover:bg-green-500/30 hover:border-green-500/60 transition-all duration-200 text-sm font-semibold"
                            title="Place bet on this selection"
                          >
                            <PoundSterling className="w-4 h-4" />
                            <span>Place Bet</span>
                          </button>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Betting Modal */}
      {bettingSelection && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Place Bet</h3>
                <button
                  onClick={closeBettingModal}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Horse Info */}
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h4 className="font-semibold text-white mb-2">{bettingSelection.horse_name}</h4>
                  <div className="space-y-1 text-sm text-gray-400">
                    <div className="flex items-center justify-between">
                      <span>Course:</span>
                      <span className="text-white">{bettingSelection.course_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Time:</span>
                      <span className="text-white">{formatTime(bettingSelection.race_time)}</span>
                    </div>
                    {bettingSelection.current_odds && (
                      <div className="flex items-center justify-between">
                        <span>Odds:</span>
                        <span className="text-yellow-400 font-medium">{bettingSelection.current_odds}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Bet Amount Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Bet Amount (GBP)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                    placeholder="Enter bet amount"
                    autoFocus
                  />
                </div>
                
                {/* Potential Winnings */}
                {betAmount && parseFloat(betAmount) > 0 && bettingSelection.current_odds && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Potential Winnings:</span>
                      <span className="text-green-400 font-medium">
                        {(() => {
                          const amount = parseFloat(betAmount)
                          const oddsStr = bettingSelection.current_odds.replace(/[^\d\/]/g, '')
                          let multiplier = 1
                          if (oddsStr.includes('/')) {
                            const [num, den] = oddsStr.split('/').map(Number)
                            multiplier = num / den
                          } else {
                            multiplier = parseFloat(oddsStr) || 1
                          }
                          return formatCurrency(amount * multiplier)
                        })()}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Error Display */}
                {placeBetMutation.error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p className="text-red-400 text-sm">
                      {placeBetMutation.error instanceof Error 
                        ? placeBetMutation.error.message 
                        : 'Failed to place bet'
                      }
                    </p>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={handleConfirmBet}
                    disabled={placeBetMutation.isPending || !betAmount || parseFloat(betAmount) <= 0}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {placeBetMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PoundSterling className="w-4 h-4" />
                    )}
                    <span>Place Bet</span>
                  </button>
                  <button
                    onClick={closeBettingModal}
                    className="px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}