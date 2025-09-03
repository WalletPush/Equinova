import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'
import {
  Wallet,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Clock,
  Trophy,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  BarChart3
} from 'lucide-react'

interface UserBankroll {
  user_id: string
  total_amount: number
  created_at: string
  updated_at: string
  has_bankroll: boolean
}

interface UserBet {
  id: number
  user_id: string
  race_id: string
  race_date: string
  course: string
  off_time: string
  horse_name: string
  trainer_name: string
  jockey_name: string
  current_odds: string
  bet_amount: number
  bet_type: string
  status: 'pending' | 'won' | 'lost'
  potential_return: number
  created_at: string
  updated_at: string
}

interface BetsSummary {
  total_bets: number
  total_amount_wagered: number
  total_potential_winnings: number
  won_bets_count: number
  lost_bets_count: number
  pending_bets_count: number
  total_winnings: number
  total_losses: number
  net_profit: number
}

interface BetsData {
  bets: UserBet[]
  summary: BetsSummary
  pagination: {
    limit: number
    offset: number
    total: number
    has_more: boolean
  }
}

export function BankrollPage() {
  const [activeTab, setActiveTab] = useState<'bankroll' | 'betting_history'>('bankroll')
  const [addAmountInput, setAddAmountInput] = useState('')
  const [isAddingFunds, setIsAddingFunds] = useState(false)
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Fetch user's bankroll
  const { data: bankrollData, isLoading: bankrollLoading, error: bankrollError, refetch: refetchBankroll } = useQuery({
    queryKey: ['user-bankroll'],
    queryFn: async () => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const data = await callSupabaseFunction('get-user-bankroll', {})
      
      return data?.data as UserBankroll
    },
    enabled: !!user,
    staleTime: 1000 * 30 // 30 seconds
  })

  // Fetch user's betting history
  const { data: betsData, isLoading: betsLoading, error: betsError } = useQuery({
    queryKey: ['user-bets'],
    queryFn: async () => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const data = await callSupabaseFunction('get-user-bets', {
        limit: 20,
        offset: 0,
        order_by: 'created_at',
        order_dir: 'desc'
      })
      
      return data?.data as BetsData
    },
    enabled: !!user && activeTab === 'betting_history',
    staleTime: 1000 * 60 // 1 minute
  })

  // Add bankroll amount mutation
  const addBankrollMutation = useMutation({
    mutationFn: async (amount: number) => {
      if (!user) {
        throw new Error('User not authenticated')
      }

      const data = await callSupabaseFunction('add-bankroll-amount', { amount })
      
      return data?.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
      setAddAmountInput('')
      setIsAddingFunds(false)
    },
    onError: (error) => {
      console.error('Error adding bankroll amount:', error)
    }
  })

  const handleAddFunds = async () => {
    const amount = parseFloat(addAmountInput)
    if (isNaN(amount) || amount <= 0) {
      return
    }
    
    try {
      await addBankrollMutation.mutateAsync(amount)
    } catch (error) {
      console.error('Failed to add funds:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-yellow-400 mb-2">Login Required</h3>
            <p className="text-gray-400">Please log in to manage your bankroll.</p>
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
            <h1 className="text-2xl font-bold text-white">Bankroll Management</h1>
            <p className="text-gray-400 text-sm">Manage your betting funds and track results</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('bankroll')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'bankroll'
                ? 'bg-yellow-400 text-gray-900 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>My Bankroll</span>
          </button>
          <button
            onClick={() => setActiveTab('betting_history')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition-colors ${
              activeTab === 'betting_history'
                ? 'bg-yellow-400 text-gray-900 font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Betting History</span>
          </button>
        </div>

        {/* My Bankroll Tab */}
        {activeTab === 'bankroll' && (
          <div className="space-y-6">
            {/* Current Bankroll */}
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Current Balance</h2>
                <Wallet className="w-6 h-6 text-yellow-400" />
              </div>
              
              {bankrollLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
                </div>
              ) : bankrollError ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                  <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-red-400">Failed to load bankroll</p>
                  <button
                    onClick={() => refetchBankroll()}
                    className="mt-2 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white mb-2">
                      {formatCurrency(bankrollData?.total_amount || 0)}
                    </div>
                    {bankrollData?.updated_at && (
                      <p className="text-sm text-gray-400">
                        Last updated: {formatDate(bankrollData.updated_at)}
                      </p>
                    )}
                  </div>
                  
                  {!bankrollData?.has_bankroll && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-center">
                      <AlertCircle className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                      <p className="text-yellow-400 text-sm">Set up your bankroll to start betting</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add Funds Section */}
            <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Add Funds</h2>
                <Plus className="w-6 h-6 text-green-400" />
              </div>
              
              {isAddingFunds ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Amount (GBP)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={addAmountInput}
                      onChange={(e) => setAddAmountInput(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddFunds}
                      disabled={addBankrollMutation.isPending || !addAmountInput || parseFloat(addAmountInput) <= 0}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addBankrollMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>Add Funds</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingFunds(false)
                        setAddAmountInput('')
                      }}
                      className="px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {addBankrollMutation.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <p className="text-red-400 text-sm">
                        {addBankrollMutation.error instanceof Error 
                          ? addBankrollMutation.error.message 
                          : 'Failed to add funds'
                        }
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingFunds(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 border-2 border-dashed border-gray-600 text-gray-300 rounded-lg hover:border-green-400 hover:text-green-400 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Funds to Bankroll</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Betting History Tab */}
        {activeTab === 'betting_history' && (
          <div className="space-y-6">
            {betsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
                  <span className="text-gray-400">Loading betting history...</span>
                </div>
              </div>
            ) : betsError ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-red-400 mb-2">Error Loading Betting History</h3>
                <p className="text-gray-400">Failed to load your betting history. Please try again.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                {betsData?.summary && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <BarChart3 className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-gray-400">Total Bets</span>
                      </div>
                      <div className="text-xl font-bold text-white">{betsData.summary.total_bets}</div>
                      <div className="text-xs text-gray-500">
                        {formatCurrency(betsData.summary.total_amount_wagered)} wagered
                      </div>
                    </div>
                    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-gray-400">Net Profit</span>
                      </div>
                      <div className={`text-xl font-bold ${
                        betsData.summary.net_profit >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(betsData.summary.net_profit)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {betsData.summary.won_bets_count}W / {betsData.summary.lost_bets_count}L
                      </div>
                    </div>
                  </div>
                )}

                {/* Betting History */}
                {betsData?.bets && betsData.bets.length > 0 ? (
                  <div className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">Recent Bets</h2>
                    {betsData.bets.map((bet) => (
                      <div
                        key={bet.id}
                        className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-lg p-5 hover:border-yellow-400/30 transition-all duration-200"
                      >
                        {/* Header Section */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-1">{bet.horse_name}</h3>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="text-sm text-gray-400">{bet.course}</span>
                              <span className="text-gray-600">•</span>
                              <span className="text-sm text-gray-400">
                                {bet.race_date ? new Date(bet.race_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric'
                                }) : 'Date TBC'}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Clock className="w-3 h-3 text-gray-500" />
                              <span className="text-sm text-gray-400">
                                {bet.off_time ? bet.off_time.substring(0, 5) : 'Time TBC'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium mb-2 ${
                              bet.status === 'won'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : bet.status === 'lost'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            }`}>
                              {bet.status === 'won' ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : bet.status === 'lost' ? (
                                <XCircle className="w-3 h-3" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              <span className="capitalize">{bet.status}</span>
                            </div>
                            <div className="text-2xl font-bold text-white">
                              £{bet.bet_amount.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="space-y-1">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Jockey</span>
                            <div className="text-sm font-medium text-white">{bet.jockey_name || 'TBC'}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Trainer</span>
                            <div className="text-sm font-medium text-white">{bet.trainer_name || 'TBC'}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Odds</span>
                            <div className="text-sm font-bold text-yellow-400">{bet.current_odds || 'TBC'}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Potential Return</span>
                            <div className="text-sm font-bold text-green-400">
                              £{bet.potential_return ? bet.potential_return.toFixed(2) : '0.00'}
                            </div>
                          </div>
                        </div>
                        
                        {/* Footer */}
                        <div className="pt-3 border-t border-gray-700/50">
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>
                              Bet placed: {bet.created_at ? new Date(bet.created_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Unknown'}
                            </span>
                            <span>Race ID: {bet.race_id}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-300 mb-2">No betting history</h3>
                    <p className="text-gray-500">Your placed bets will appear here</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}