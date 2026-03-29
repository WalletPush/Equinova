import { Users } from 'lucide-react'
import type { TotalStats, SystemBenchmark } from './types'

interface PerformanceYouVsSystemProps {
  totalStats: TotalStats
  systemBenchmark: SystemBenchmark
}

export function PerformanceYouVsSystem({ totalStats, systemBenchmark }: PerformanceYouVsSystemProps) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">You vs System</span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center text-[11px]">
        <div>
          <div className="text-gray-500 mb-1.5">Win Rate</div>
          <div className="flex items-center justify-center gap-2">
            <div>
              <div className={`text-base font-bold ${totalStats.winRate > systemBenchmark.winRate ? 'text-green-400' : 'text-white'}`}>
                {totalStats.winRate.toFixed(0)}%
              </div>
              <div className="text-[9px] text-gray-600">You</div>
            </div>
            <div className="text-gray-600 text-[10px]">vs</div>
            <div>
              <div className={`text-base font-bold ${systemBenchmark.winRate > totalStats.winRate ? 'text-cyan-400' : 'text-white'}`}>
                {systemBenchmark.winRate.toFixed(0)}%
              </div>
              <div className="text-[9px] text-gray-600">System</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-gray-500 mb-1.5">Betting ROI</div>
          <div className="flex items-center justify-center gap-2">
            <div>
              <div className={`text-base font-bold ${totalStats.bettingROI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalStats.bettingROI >= 0 ? '+' : ''}{totalStats.bettingROI.toFixed(0)}%
              </div>
              <div className="text-[9px] text-gray-600">You</div>
            </div>
            <div className="text-gray-600 text-[10px]">vs</div>
            <div>
              <div className={`text-base font-bold ${systemBenchmark.roi >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                {systemBenchmark.roi >= 0 ? '+' : ''}{systemBenchmark.roi.toFixed(0)}%
              </div>
              <div className="text-[9px] text-gray-600">System</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-gray-500 mb-1.5">Settled</div>
          <div className="flex items-center justify-center gap-2">
            <div>
              <div className="text-base font-bold text-white">{totalStats.settledCount}</div>
              <div className="text-[9px] text-gray-600">You</div>
            </div>
            <div className="text-gray-600 text-[10px]">vs</div>
            <div>
              <div className="text-base font-bold text-white">{systemBenchmark.totalPicks}</div>
              <div className="text-[9px] text-gray-600">System</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
