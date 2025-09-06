import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { callSupabaseFunction } from '@/lib/supabase'
import { PoundSterling, CheckCircle, Loader2, AlertCircle, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface RaceContext {
  race_id: string
  course_name: string
  off_time: string
  race_time?: string
}

interface PlaceBetButtonProps {
  horseName: string
  raceContext: RaceContext
  odds?: string | number
  jockeyName?: string
  trainerName?: string
  size?: 'normal' | 'small'
  onSuccess?: () => void
  customRaceEntryId?: string
  raceId?: string
  horseId?: string
}

export function PlaceBetButton({ 
  horseName, 
  raceContext, 
  odds,
  jockeyName,
  trainerName,
  size = 'normal',
  onSuccess,
  customRaceEntryId,
  raceId,
  horseId
}: PlaceBetButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isBetPlaced, setIsBetPlaced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBettingModal, setShowBettingModal] = useState(false)
  const [betAmount, setBetAmount] = useState('')
  const queryClient = useQueryClient()

  // Place bet mutation
  const placeBetMutation = useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      console.log('Placing bet:', { horseName, raceContext, amount })
      
      const raceTime = raceContext.race_time || raceContext.off_time
      
      // Convert odds string to number (e.g., "5/2" to 2.5, "7/1" to 7)
      let oddsValue = 1
      if (odds) {
        // Allow decimal points in odds (e.g., 7.5/1)
        const oddsStr = String(odds).replace(/[^\d\/.]/g, '')
        if (oddsStr.includes('/')) {
          const [numerator, denominator] = oddsStr.split('/').map(Number)
          oddsValue = numerator / denominator
        } else {
          oddsValue = parseFloat(oddsStr) || 1
        }
      }

      const payload = {
        horse_name: horseName,
        horse_id: horseId || null,
        race_id: raceId || null,
        course: raceContext.course_name,
        off_time: raceTime,
        trainer_name: trainerName || null,
        jockey_name: jockeyName || null,
        current_odds: odds ? String(odds) : null,
        bet_amount: amount,
        odds: oddsValue
      }
      
      console.log('Bet payload:', payload)
      return await callSupabaseFunction('place-bet', payload)
    },
    onSuccess: () => {
      console.log(`Bet placed on ${horseName} successfully`)
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
      setIsBetPlaced(true)
      setIsLoading(false)
      setError(null)
      setShowBettingModal(false)
      setBetAmount('')
      onSuccess?.()
    },
    onError: (error: Error) => {
      console.error('Error placing bet:', error)
      const msg = String(error.message || '')
      // Map common edge-function messages to friendly UI messages
      if (msg.includes('No bankroll found') || msg.includes('Failed to get bankroll')) {
        setError('Your bankroll needs topping up. Please add funds in Settings.')
      } else if (msg.includes('Missing required parameters')) {
        setError('Invalid bet request. Please try again.')
      } else if (msg.includes('Failed to create bet')) {
        setError('Could not place bet. Please try again later.')
      } else {
        setError(msg)
      }
      setIsLoading(false)
      setIsBetPlaced(false)
    }
  })

  const handlePlaceBet = () => {
    if (!horseId) {
      setError('Cannot place bet: missing race_entries.horse_id. Please shortlist from AI Insider or use a selection with a valid horse_id.')
      return
    }
    setShowBettingModal(true)
    setError(null)
  }

  const handleConfirmBet = async () => {
    if (!betAmount || parseFloat(betAmount) <= 0) {
      setError('Please enter a valid bet amount')
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      await placeBetMutation.mutateAsync({ amount: parseFloat(betAmount) })
    } catch (error: any) {
      console.error('Place bet operation failed:', error)
      setError(error?.message || 'Operation failed')
      setIsLoading(false)
    }
  }

  const closeBettingModal = () => {
    setShowBettingModal(false)
    setBetAmount('')
    setError(null)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount)
  }

  const baseClasses = `flex items-center justify-center space-x-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full`
  const sizeClasses = size === 'small' 
    ? 'px-4 py-2 text-sm' 
    : 'px-4 py-3 text-sm'
  const colorClasses = error 
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
    : isBetPlaced 
    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
    : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'

  const modalContent = showBettingModal && (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full z-[10000]">
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
              <h4 className="font-semibold text-white mb-2">{horseName}</h4>
              <div className="space-y-1 text-sm text-gray-400">
                <div className="flex items-center justify-between">
                  <span>Course:</span>
                  <span className="text-white">{raceContext.course_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Time:</span>
                  <span className="text-white">{raceContext.off_time}</span>
                </div>
                {odds && (
                  <div className="flex items-center justify-between">
                    <span>Odds:</span>
                    <span className="text-yellow-400 font-medium">{odds}</span>
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
            {betAmount && parseFloat(betAmount) > 0 && odds && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Potential Winnings:</span>
                  <span className="text-green-400 font-medium">
                    {(() => {
                      const amount = parseFloat(betAmount)
                      // Allow decimal points in odds (e.g., 7.5/1)
                      const oddsStr = String(odds).replace(/[^\d\/.]/g, '')
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
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
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
  )

  return (
    <>
      <div className="relative">
        <button
          onClick={handlePlaceBet}
          disabled={isLoading || isBetPlaced}
          className={`${baseClasses} ${sizeClasses} ${colorClasses}`}
          title={error || (isBetPlaced ? 'Bet placed' : 'Place bet')}
        >
          {isLoading ? (
            <Loader2 className={`animate-spin ${size === 'small' ? 'w-4 h-4' : 'w-4 h-4'}`} />
          ) : error ? (
            <>
              <AlertCircle className={`${size === 'small' ? 'w-3 h-3' : 'w-3 h-3'}`} />
              {size === 'normal' && <span>Error</span>}
            </>
          ) : isBetPlaced ? (
            <>
              <CheckCircle className={`${size === 'small' ? 'w-4 h-4' : 'w-4 h-4'}`} />
              <span>Bet Placed</span>
            </>
          ) : (
            <>
              <PoundSterling className={`${size === 'small' ? 'w-4 h-4' : 'w-4 h-4'}`} />
              <span>Place Bet</span>
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

      {/* Portal the modal to document.body */}
      {typeof document !== 'undefined' && showBettingModal && createPortal(modalContent, document.body)}
    </>
  )
}