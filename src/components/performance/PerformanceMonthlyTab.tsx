import { fmtPL } from '@/lib/performanceUtils'
import type { MonthSummary } from './types'

interface PerformanceMonthlyTabProps {
  monthSummaries: MonthSummary[]
}

export function PerformanceMonthlyTab({ monthSummaries }: PerformanceMonthlyTabProps) {
  return (
    <div className="space-y-3">
      {monthSummaries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No data for this period</div>
      ) : monthSummaries.map(m => (
        <div key={m.month} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">{m.label}</span>
            <span className={`text-sm font-bold ${m.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtPL(m.pl)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
            <div>
              <div className="text-gray-500 mb-0.5">Settled</div>
              <div className="text-white font-medium">{m.settled}{m.pending > 0 && <span className="text-yellow-500"> +{m.pending}P</span>}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Win Rate</div>
              <div className="text-white font-medium">{m.winRate.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Staked</div>
              <div className="text-white font-medium">£{m.settledStaked.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Betting ROI</div>
              <div className={`font-medium ${m.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {m.roi >= 0 ? '+' : ''}{m.roi.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
            <div className="h-full bg-green-500/60 rounded-full transition-all" style={{ width: `${Math.min(m.winRate, 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
            <span className="text-green-500">{m.wins} won</span>
            <span className="text-red-500">{m.losses} lost</span>
          </div>
        </div>
      ))}
    </div>
  )
}
