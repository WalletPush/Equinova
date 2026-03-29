import {
  Wallet, Trophy, Target, TrendingUp, TrendingDown,
  Activity, ArrowDownRight,
} from 'lucide-react'
import { fmtPL } from '@/lib/performanceUtils'
import type { TotalStats } from './types'

interface PerformanceKPIGridProps {
  bankroll: number
  bankrollGrowth: number
  totalStats: TotalStats
  startingBankroll: number
}

export function PerformanceKPIGrid({ bankroll, bankrollGrowth, totalStats, startingBankroll }: PerformanceKPIGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-yellow-400" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bankroll</span>
        </div>
        <div className="text-xl font-bold text-white">£{bankroll.toFixed(2)}</div>
        <div className={`text-xs mt-0.5 ${bankrollGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {bankrollGrowth >= 0 ? '+' : ''}{bankrollGrowth.toFixed(1)}% all-time
        </div>
      </div>

      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Settled P/L</span>
        </div>
        <div className={`text-xl font-bold ${(totalStats.settledPL) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {fmtPL(totalStats.settledPL)}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {totalStats.settledCount} settled
          {(totalStats.totalPending) > 0 && (
            <span className="text-yellow-500"> · {totalStats.totalPending}P (£{(totalStats.pendingExposure).toFixed(0)} at risk)</span>
          )}
        </div>
      </div>

      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-blue-400" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
        </div>
        <div className="text-xl font-bold text-white">{(totalStats.winRate).toFixed(1)}%</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {totalStats.totalWins}W / {totalStats.totalLosses}L
        </div>
      </div>

      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          {(totalStats.bankrollReturn) >= 0
            ? <TrendingUp className="w-4 h-4 text-green-400" />
            : <TrendingDown className="w-4 h-4 text-red-400" />}
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bankroll Return</span>
        </div>
        <div className={`text-xl font-bold ${(totalStats.bankrollReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {(totalStats.bankrollReturn) >= 0 ? '+' : ''}{(totalStats.bankrollReturn).toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 mt-0.5">from £{startingBankroll.toFixed(0)} bankroll</div>
      </div>

      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Betting ROI</span>
        </div>
        <div className={`text-xl font-bold ${(totalStats.bettingROI) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {(totalStats.bettingROI) >= 0 ? '+' : ''}{(totalStats.bettingROI).toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500 mt-0.5">£{(totalStats.totalSettledStaked).toFixed(0)} staked</div>
      </div>

      <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <ArrowDownRight className="w-4 h-4 text-purple-400" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Expectancy</span>
        </div>
        <div className={`text-xl font-bold ${(totalStats.expectancy) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {fmtPL(totalStats.expectancy)}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          per settled bet · PF: {totalStats.profitFactor >= 99 ? '∞' : totalStats.profitFactor.toFixed(2)}
        </div>
      </div>
    </div>
  )
}
