import React from 'react'
import {
  Wallet,
  TrendingUp,
  Trophy,
  CheckCircle,
  XCircle,
  Target,
} from 'lucide-react'

interface UserBetsSummary {
  totalPL: number
  totalStaked: number
  wins: number
  settled: number
  totalBets: number
  roi: number
  winRate: number
}

interface TodayBankrollSummaryProps {
  bankroll: number
  userBetsSummary: UserBetsSummary
  todayBetsLength: number
  todayWins: number
  todayPending: number
  todayPL: number
}

export function TodayBankrollSummary({
  bankroll,
  userBetsSummary,
  todayBetsLength,
  todayWins,
  todayPending,
  todayPL,
}: TodayBankrollSummaryProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Wallet className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">My Bankroll</span>
        </div>
        <div className="text-lg font-bold text-white">£{bankroll.toFixed(2)}</div>
      </div>
      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          {(userBetsSummary.roi) >= 0
            ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            : <Target className="w-3.5 h-3.5 text-red-400" />}
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">My ROI</span>
        </div>
        <div className={`text-lg font-bold ${userBetsSummary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {userBetsSummary.totalStaked > 0 ? `${userBetsSummary.roi >= 0 ? '+' : ''}${userBetsSummary.roi.toFixed(1)}%` : '—'}
        </div>
      </div>
      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today</span>
        </div>
        <div className="text-lg font-bold text-white">
          {todayBetsLength > 0
            ? <>{todayWins}W / {todayBetsLength - todayWins - todayPending}L{todayPending > 0 && <span className="text-yellow-400 text-xs ml-1">({todayPending} pending)</span>}</>
            : <span className="text-gray-500">—</span>
          }
        </div>
      </div>
      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          {todayPL >= 0
            ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            : <XCircle className="w-3.5 h-3.5 text-red-400" />}
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today P/L</span>
        </div>
        <div className={`text-lg font-bold ${todayPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {todayBetsLength > 0 ? `${todayPL >= 0 ? '+' : '-'}£${Math.abs(todayPL).toFixed(2)}` : '—'}
        </div>
      </div>
    </div>
  )
}
