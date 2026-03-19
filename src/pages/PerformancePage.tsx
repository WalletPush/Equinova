import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Plus,
} from 'lucide-react'

interface UserBet {
  id: number
  user_id: string
  race_id: string
  race_date: string
  course: string
  off_time: string
  horse_name: string
  horse_id: string
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

interface DaySummary {
  date: string
  bets: UserBet[]
  wins: number
  losses: number
  pending: number
  dayPL: number
  dayStaked: number
  runningPL: number
  runningStaked: number
  runningROI: number
}

function fmtPL(v: number) {
  return `${v >= 0 ? '+' : '-'}£${Math.abs(v).toFixed(2)}`
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function PerformancePage() {
  const { user } = useAuth()
  const { bankroll, needsSetup, isLoading: bankrollLoading, addFunds, isAddingFunds } = useBankroll()
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'daily' | 'all'>('daily')
  const [showAddFunds, setShowAddFunds] = useState(false)
  const [addAmount, setAddAmount] = useState('')

  const { data: betsData, isLoading: betsLoading } = useQuery({
    queryKey: ['user-bets-all'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bets', {
        limit: 500,
        offset: 0,
        order_by: 'created_at',
        order_dir: 'asc',
      })
      return res?.data as { bets: UserBet[]; summary: any }
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const bets = betsData?.bets ?? []

  const { dailySummaries, totalStats } = useMemo(() => {
    if (!bets.length) return { dailySummaries: [], totalStats: null }

    const byDay = new Map<string, UserBet[]>()
    for (const b of bets) {
      const date = b.race_date || b.created_at?.split('T')[0] || 'unknown'
      const arr = byDay.get(date) || []
      arr.push(b)
      byDay.set(date, arr)
    }

    let runningPL = 0
    let runningStaked = 0
    const summaries: DaySummary[] = []

    const sortedDays = [...byDay.keys()].sort()
    for (const date of sortedDays) {
      const dayBets = byDay.get(date)!
      const wins = dayBets.filter(b => b.status === 'won').length
      const losses = dayBets.filter(b => b.status === 'lost').length
      const pending = dayBets.filter(b => b.status === 'pending').length
      const dayStaked = dayBets.reduce((s, b) => s + Number(b.bet_amount), 0)

      let dayPL = 0
      for (const b of dayBets) {
        if (b.status === 'won') dayPL += Number(b.potential_return)
        else if (b.status === 'lost') dayPL -= Number(b.bet_amount)
      }

      runningPL += dayPL
      runningStaked += dayStaked
      const runningROI = runningStaked > 0 ? (runningPL / runningStaked) * 100 : 0

      summaries.push({ date, bets: dayBets, wins, losses, pending, dayPL, dayStaked, runningPL, runningStaked, runningROI })
    }

    const totalWins = bets.filter(b => b.status === 'won').length
    const totalLosses = bets.filter(b => b.status === 'lost').length
    const totalPending = bets.filter(b => b.status === 'pending').length
    const totalStaked = bets.reduce((s, b) => s + Number(b.bet_amount), 0)
    let totalPL = 0
    for (const b of bets) {
      if (b.status === 'won') totalPL += Number(b.potential_return)
      else if (b.status === 'lost') totalPL -= Number(b.bet_amount)
    }
    const roi = totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0
    const winRate = (totalWins + totalLosses) > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0
    const winningDays = summaries.filter(d => d.dayPL > 0).length
    const losingDays = summaries.filter(d => d.dayPL < 0).length

    return {
      dailySummaries: summaries,
      totalStats: {
        totalBets: bets.length,
        totalWins,
        totalLosses,
        totalPending,
        totalPL,
        totalStaked,
        roi,
        winRate,
        winningDays,
        losingDays,
        totalDays: summaries.length,
      },
    }
  }, [bets])

  const equityCurvePoints = useMemo(() => {
    if (!dailySummaries.length) return []
    let running = 0
    const points = [{ label: 'Start', value: 0 }]
    for (const d of dailySummaries) {
      running += d.dayPL
      points.push({ label: formatDateShort(d.date), value: running })
    }
    return points
  }, [dailySummaries])

  const isLoading = bankrollLoading || betsLoading

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mr-3" />
          <span className="text-gray-400">Loading your performance...</span>
        </div>
      </AppLayout>
    )
  }

  const handleAddFunds = async () => {
    const val = parseFloat(addAmount)
    if (!val || val <= 0) return
    await addFunds(val)
    setAddAmount('')
    setShowAddFunds(false)
  }

  return (
    <AppLayout>
      {needsSetup && <BankrollSetupModal onSetup={addFunds} isSubmitting={isAddingFunds} />}

      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">My Performance</h1>
              <p className="text-xs text-gray-500">Track your betting results</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddFunds(!showAddFunds)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-yellow-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Funds
          </button>
        </div>

        {/* Add funds inline */}
        {showAddFunds && (
          <div className="bg-gray-800/80 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3">
            <input
              type="number"
              step="1"
              min="1"
              value={addAmount}
              onChange={e => setAddAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              placeholder="Amount (£)"
              autoFocus
            />
            <button
              onClick={handleAddFunds}
              disabled={isAddingFunds || !addAmount}
              className="px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg text-sm font-bold hover:bg-yellow-400 disabled:opacity-50"
            >
              {isAddingFunds ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddFunds(false); setAddAmount('') }}
              className="px-3 py-2 text-gray-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bankroll</span>
            </div>
            <div className="text-xl font-bold text-white">£{bankroll.toFixed(2)}</div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              {(totalStats?.roi ?? 0) >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">ROI</span>
            </div>
            <div className={`text-xl font-bold ${(totalStats?.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(totalStats?.roi ?? 0) >= 0 ? '+' : ''}{(totalStats?.roi ?? 0).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              £{(totalStats?.totalStaked ?? 0).toFixed(0)} staked
            </div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
            </div>
            <div className="text-xl font-bold text-white">{(totalStats?.winRate ?? 0).toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalStats?.totalWins ?? 0}W / {totalStats?.totalLosses ?? 0}L
              {(totalStats?.totalPending ?? 0) > 0 && ` / ${totalStats?.totalPending}P`}
            </div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">P/L</span>
            </div>
            <div className={`text-xl font-bold ${(totalStats?.totalPL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtPL(totalStats?.totalPL ?? 0)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalStats?.totalBets ?? 0} bets over {totalStats?.totalDays ?? 0} days
            </div>
          </div>
        </div>

        {/* Empty state */}
        {bets.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No bets placed yet</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
              Head to Top Picks to find pattern-matched selections and place your first bet
            </p>
            <Link
              to="/auto-bets"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-gray-900 rounded-xl font-bold text-sm hover:bg-yellow-400 transition-colors"
            >
              <Zap className="w-4 h-4" />
              View Top Picks
            </Link>
          </div>
        )}

        {/* Equity Curve */}
        {equityCurvePoints.length > 1 && (
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">P/L Curve</h2>
            <div className="relative h-32">
              {(() => {
                const vals = equityCurvePoints.map(p => p.value)
                const eqMin = Math.min(...vals) - 5
                const eqMax = Math.max(...vals) + 5
                const eqRange = eqMax - eqMin || 1
                return (
                  <>
                    <div className="absolute left-0 top-0 text-[9px] text-gray-600 font-mono">{fmtPL(eqMax)}</div>
                    <div className="absolute left-0 bottom-0 text-[9px] text-gray-600 font-mono">{fmtPL(eqMin)}</div>
                    <div
                      className="absolute left-10 right-0 border-t border-dashed border-gray-700"
                      style={{ bottom: `${((0 - eqMin) / eqRange) * 100}%` }}
                    >
                      <span className="absolute -top-3 right-0 text-[8px] text-gray-600">£0</span>
                    </div>
                    <div className="absolute left-10 right-0 bottom-0 top-0 flex items-end gap-[2px]">
                      {equityCurvePoints.map((p, i) => {
                        const height = ((p.value - eqMin) / eqRange) * 100
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                            <div
                              className={`w-full rounded-t-sm transition-all ${p.value >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'} group-hover:opacity-80`}
                              style={{ height: `${Math.max(height, 1)}%` }}
                            />
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[8px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {p.label}: {fmtPL(p.value)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {/* View Toggle */}
        {bets.length > 0 && (
          <>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setActiveView('daily')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                  activeView === 'daily' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Daily Breakdown
              </button>
              <button
                onClick={() => setActiveView('all')}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                  activeView === 'all' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                All Bets ({totalStats?.totalBets ?? 0})
              </button>
            </div>

            {activeView === 'daily' && (
              <div className="space-y-2">
                {dailySummaries.map(day => {
                  const isExpanded = expandedDay === day.date
                  return (
                    <div key={day.date} className={`rounded-xl overflow-hidden border transition-colors ${
                      isExpanded ? 'bg-gray-800/60 border-yellow-500/30' : 'bg-gray-800/40 border-gray-700/50'
                    }`}>
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-white">{formatDateShort(day.date)}</span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              day.dayPL > 0 ? 'bg-green-500/15 text-green-400' : day.dayPL < 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-700 text-gray-400'
                            }`}>
                              {fmtPL(day.dayPL)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span>{day.bets.length} bets</span>
                            <span className="text-green-500">{day.wins}W</span>
                            <span className="text-red-500">{day.losses}L</span>
                            {day.pending > 0 && <span className="text-yellow-500">{day.pending}P</span>}
                            <span className="text-gray-600">|</span>
                            <span className={day.runningROI >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ROI: {day.runningROI >= 0 ? '+' : ''}{day.runningROI.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-yellow-400" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-700/50 px-3 py-2 space-y-1">
                          {day.bets.map(bet => (
                            <BetRow key={bet.id} bet={bet} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {totalStats && (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mt-3">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase mb-1">Total P/L</div>
                        <div className={`text-lg font-bold ${totalStats.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtPL(totalStats.totalPL)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase mb-1">Bankroll</div>
                        <div className="text-lg font-bold text-white">£{bankroll.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-500 uppercase mb-1">ROI</div>
                        <div className={`text-lg font-bold ${totalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeView === 'all' && (
              <div className="space-y-1.5">
                {[...bets].reverse().map(bet => (
                  <BetRow key={bet.id} bet={bet} showDate />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

function BetRow({ bet, showDate = false }: { bet: UserBet; showDate?: boolean }) {
  const odds = bet.current_odds
  const amount = Number(bet.bet_amount)
  const potentialReturn = Number(bet.potential_return)

  let pl = 0
  if (bet.status === 'won') pl = potentialReturn
  else if (bet.status === 'lost') pl = -amount

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs ${
      bet.status === 'won' ? 'bg-green-500/5 border border-green-500/15' :
      bet.status === 'pending' ? 'bg-yellow-500/5 border border-yellow-500/15' :
      'bg-gray-800/30 border border-gray-700/30'
    }`}>
      <div className="flex-shrink-0">
        {bet.status === 'won' && <CheckCircle className="w-4 h-4 text-green-400" />}
        {bet.status === 'lost' && <XCircle className="w-4 h-4 text-gray-600" />}
        {bet.status === 'pending' && <Clock className="w-4 h-4 text-yellow-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <span className={`font-semibold truncate block ${
          bet.status === 'won' ? 'text-green-300' : bet.status === 'pending' ? 'text-white' : 'text-gray-300'
        }`}>
          {bet.horse_name}
        </span>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
          {showDate && <span>{formatDateShort(bet.race_date || bet.created_at?.split('T')[0])}</span>}
          {showDate && <span className="text-gray-700">&middot;</span>}
          <span>{bet.off_time?.substring(0, 5)}</span>
          <span className="text-gray-700">&middot;</span>
          <span>{bet.course}</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0 w-12">
        <div className="text-gray-300 font-mono text-[11px]">{formatOdds(odds)}</div>
      </div>

      <div className="text-right flex-shrink-0 w-14">
        <div className="text-gray-300 text-[11px]">£{amount.toFixed(2)}</div>
        <div className="text-[8px] text-gray-600">stake</div>
      </div>

      <div className="text-right flex-shrink-0 w-16">
        {bet.status === 'pending' ? (
          <div className="text-yellow-400 font-semibold text-[11px]">Pending</div>
        ) : (
          <div className={`font-bold text-[11px] ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtPL(pl)}
          </div>
        )}
      </div>
    </div>
  )
}
