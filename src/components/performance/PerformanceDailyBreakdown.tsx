import { ChevronDown, ChevronUp } from 'lucide-react'
import { fmtPL, formatDateShort } from '@/lib/performanceUtils'
import { BetRow } from './BetRow'
import type { DaySummary, TotalStats, UserBet } from './types'

interface PerformanceDailyBreakdownProps {
  dailySummaries: DaySummary[]
  expandedDay: string | null
  onToggleDay: (date: string) => void
  totalStats: TotalStats
  bankroll: number
  activeView: 'daily' | 'all'
  filteredBets: UserBet[]
  onSetActiveView: (view: 'daily' | 'all') => void
}

export function PerformanceDailyBreakdown({
  dailySummaries, expandedDay, onToggleDay, totalStats, bankroll,
  activeView, filteredBets, onSetActiveView,
}: PerformanceDailyBreakdownProps) {
  return (
    <>
      <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-0.5">
        <button onClick={() => onSetActiveView('daily')}
          className={`flex-1 px-3 py-1 text-[11px] font-medium rounded transition-all ${
            activeView === 'daily' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}>
          Daily Breakdown
        </button>
        <button onClick={() => onSetActiveView('all')}
          className={`flex-1 px-3 py-1 text-[11px] font-medium rounded transition-all ${
            activeView === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
          }`}>
          All Bets ({totalStats.totalBets})
        </button>
      </div>

      {activeView === 'daily' && (
        <div className="space-y-2">
          {[...dailySummaries].reverse().map(day => {
            const isExpanded = expandedDay === day.date
            const dayColor = day.dayPL >= 20 ? 'bg-green-500/10 border-green-500/25'
              : day.dayPL > 0 ? 'bg-green-500/5 border-green-500/15'
              : day.dayPL <= -20 ? 'bg-red-500/10 border-red-500/25'
              : day.dayPL < 0 ? 'bg-red-500/5 border-red-500/15'
              : 'bg-gray-800/40 border-gray-700/50'
            return (
              <div key={day.date} className={`rounded-xl overflow-hidden border transition-colors ${
                isExpanded ? 'bg-gray-800/60 border-yellow-500/30' : dayColor
              }`}>
                <button onClick={() => onToggleDay(day.date)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/60 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-white">{formatDateShort(day.date)}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        day.dayPL > 0 ? 'bg-green-500/15 text-green-400'
                          : day.dayPL < 0 ? 'bg-red-500/15 text-red-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}>{fmtPL(day.dayPL)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                      <span>{day.bets.length} bets</span>
                      <span className="text-green-500">{day.wins}W</span>
                      <span className="text-red-500">{day.losses}L</span>
                      {day.pending > 0 && <span className="text-yellow-500">{day.pending}P</span>}
                      <span className="text-gray-600">|</span>
                      <span className={day.runningBettingROI >= 0 ? 'text-green-500' : 'text-red-500'}>
                        ROI: {day.runningBettingROI >= 0 ? '+' : ''}{day.runningBettingROI.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-yellow-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-700/50 px-3 py-2 space-y-1">
                    {day.bets.map(bet => <BetRow key={bet.id} bet={bet} />)}
                  </div>
                )}
              </div>
            )
          })}

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mt-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-[10px] text-gray-500 uppercase mb-1">Settled P/L</div>
                <div className={`text-lg font-bold ${totalStats.settledPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtPL(totalStats.settledPL)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase mb-1">Bankroll</div>
                <div className="text-lg font-bold text-white">£{bankroll.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase mb-1">Betting ROI</div>
                <div className={`text-lg font-bold ${totalStats.bettingROI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalStats.bettingROI >= 0 ? '+' : ''}{totalStats.bettingROI.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'all' && (
        <div className="space-y-1.5">
          {[...filteredBets].reverse().map(bet => <BetRow key={bet.id} bet={bet} showDate />)}
        </div>
      )}
    </>
  )
}
