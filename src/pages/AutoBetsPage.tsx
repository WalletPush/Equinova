import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import {
  Zap,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Wallet,
  ChevronRight,
  CalendarDays,
} from 'lucide-react'

export function AutoBetsPage() {
  const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  const { data: todayBets, isLoading: loadingToday } = useQuery({
    queryKey: ['auto-bets-today', todayUK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_bet_ledger')
        .select('*')
        .eq('bet_date', todayUK)
        .order('id', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })

  const { data: bankrollSummary } = useQuery({
    queryKey: ['auto-bet-summary'],
    queryFn: async () => {
      const { data: lastBet } = await supabase
        .from('auto_bet_ledger')
        .select('bankroll_after')
        .order('id', { ascending: false })
        .limit(1)
      const { data: allBets } = await supabase
        .from('auto_bet_ledger')
        .select('profit,stake,won')
      const totalPL = allBets?.reduce((s, b) => s + Number(b.profit), 0) || 0
      const totalStaked = allBets?.reduce((s, b) => s + Number(b.stake), 0) || 0
      const totalWins = allBets?.filter(b => b.won).length || 0
      const totalBets = allBets?.length || 0
      return {
        bankroll: lastBet?.[0] ? Number(lastBet[0].bankroll_after) : 200,
        totalPL,
        roi: totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0,
        winRate: totalBets > 0 ? (totalWins / totalBets) * 100 : 0,
        totalBets,
        totalWins,
      }
    },
    staleTime: 60_000,
  })

  const plays = todayBets || []
  const todayPL = plays.reduce((s, b) => s + Number(b.profit), 0)
  const todayWins = plays.filter(b => b.won).length
  const todayPending = plays.filter(b => Number(b.finishing_position) === 0).length
  const todayLosses = plays.length - todayWins - todayPending

  const { upcoming, settled } = useMemo(() => {
    const up: typeof plays = []
    const done: typeof plays = []
    for (const b of plays) {
      if (Number(b.finishing_position) === 0) up.push(b)
      else done.push(b)
    }
    return { upcoming: up, settled: done }
  }, [plays])

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Auto Bets
          </h1>
          <p className="text-gray-400 text-sm mt-1">AI-selected value bets placed automatically</p>
        </div>

        {/* Bankroll Summary Cards */}
        {bankrollSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Bankroll</span>
              </div>
              <div className="text-lg font-bold text-white">£{bankrollSummary.bankroll.toFixed(2)}</div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {bankrollSummary.roi >= 0
                  ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  : <Target className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">ROI</span>
              </div>
              <div className={`text-lg font-bold ${bankrollSummary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bankrollSummary.roi >= 0 ? '+' : ''}{bankrollSummary.roi.toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Win Rate</span>
              </div>
              <div className="text-lg font-bold text-white">
                {bankrollSummary.winRate.toFixed(0)}%
              </div>
              <div className="text-[10px] text-gray-500">{bankrollSummary.totalWins}W / {bankrollSummary.totalBets}R</div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {todayPL >= 0
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today P/L</span>
              </div>
              <div className={`text-lg font-bold ${todayPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {todayPL >= 0 ? '+' : '-'}£{Math.abs(todayPL).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loadingToday && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
              <span className="text-gray-400">Loading selections...</span>
            </div>
          </div>
        )}

        {/* No Bets Today */}
        {!loadingToday && plays.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No selections today</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              Auto bets are placed when the AI identifies value opportunities meeting the criteria
            </p>
          </div>
        )}

        {/* Today's Upcoming Selections */}
        {upcoming.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Upcoming</h2>
              <span className="text-xs text-gray-500">{upcoming.length} pending</span>
            </div>
            <div className="space-y-3">
              {upcoming.map((bet: any) => (
                <SelectionCard key={bet.id} bet={bet} status="pending" />
              ))}
            </div>
          </div>
        )}

        {/* Today's Settled Selections */}
        {settled.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Settled</h2>
              <span className="text-xs text-gray-500">
                {todayWins}W {todayLosses}L
              </span>
            </div>
            <div className="space-y-3">
              {settled.map((bet: any) => (
                <SelectionCard key={bet.id} bet={bet} status={bet.won ? 'won' : 'lost'} />
              ))}
            </div>
          </div>
        )}

        {/* Link to full performance */}
        {plays.length > 0 && (
          <Link
            to="/performance"
            className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-xl p-4 hover:border-yellow-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-gray-500 group-hover:text-yellow-400 transition-colors" />
              <div>
                <span className="text-white font-medium text-sm">Full Performance History</span>
                <p className="text-gray-500 text-xs">Equity curve, daily breakdown, all bets</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-yellow-400 transition-colors" />
          </Link>
        )}
      </div>
    </AppLayout>
  )
}


function SelectionCard({ bet, status }: { bet: any; status: 'pending' | 'won' | 'lost' }) {
  const odds = Number(bet.current_odds)
  const valueScore = Number(bet.value_score)
  const stake = Number(bet.stake)
  const profit = Number(bet.profit)
  const consensus = Number(bet.model_consensus || 0)

  const borderColor = status === 'won'
    ? 'border-green-500/30'
    : status === 'lost'
    ? 'border-gray-700'
    : 'border-yellow-500/20'

  const bgColor = status === 'won'
    ? 'bg-green-500/5'
    : status === 'pending'
    ? 'bg-yellow-500/5'
    : 'bg-gray-800/60'

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Top bar: status + time + course */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/30">
        <div className="flex items-center gap-2">
          {status === 'pending' && <Clock className="w-3.5 h-3.5 text-yellow-400" />}
          {status === 'won' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
          {status === 'lost' && <XCircle className="w-3.5 h-3.5 text-gray-500" />}
          <span className="text-xs text-gray-400">
            {bet.off_time?.substring(0, 5)}
          </span>
          <span className="text-xs text-gray-500">·</span>
          <span className="text-xs text-gray-300 font-medium">{bet.course}</span>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          status === 'won' ? 'bg-green-500/20 text-green-400' :
          status === 'lost' ? 'bg-gray-700 text-gray-500' :
          'bg-yellow-500/20 text-yellow-400'
        }`}>
          {status === 'won' ? 'WON' : status === 'lost' ? 'LOST' : 'PENDING'}
        </div>
      </div>

      {/* Main card body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Horse info */}
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-base truncate ${
              status === 'won' ? 'text-green-300' :
              status === 'pending' ? 'text-white' :
              'text-gray-400'
            }`}>
              {bet.horse_name}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              {bet.jockey && <span>{bet.jockey}</span>}
              {bet.trainer && (
                <>
                  <span>·</span>
                  <span>{bet.trainer}</span>
                </>
              )}
            </div>
          </div>

          {/* Profit / Pending */}
          <div className="text-right flex-shrink-0">
            {status === 'pending' ? (
              <div className="text-yellow-400 font-bold text-lg">pending</div>
            ) : (
              <div className={`font-bold text-lg ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profit >= 0 ? '+' : '-'}£{Math.abs(profit).toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700/30">
          <div className="flex-1">
            <div className="text-[10px] text-gray-500 uppercase">Odds</div>
            <div className="text-white font-mono font-bold text-sm">{formatOdds(String(odds))}</div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-gray-500 uppercase">Value</div>
            <div className={`font-bold text-sm ${
              valueScore >= 1.3 ? 'text-green-400' :
              valueScore >= 1.15 ? 'text-emerald-400' :
              'text-yellow-400'
            }`}>
              {valueScore.toFixed(2)}x
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-gray-500 uppercase">Stake</div>
            <div className="text-white font-medium text-sm">£{stake.toFixed(2)}</div>
          </div>
          {consensus > 0 && (
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 uppercase">Models</div>
              <div className="text-white font-medium text-sm">{consensus}/4</div>
            </div>
          )}
          {bet.race_id && (
            <Link
              to={`/race/${bet.race_id}`}
              className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
            >
              Race
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
