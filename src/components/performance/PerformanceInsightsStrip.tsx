import { Brain } from 'lucide-react'
import { fmtPL, formatDateShort } from '@/lib/performanceUtils'
import type { TotalStats, Insight } from './types'

interface PerformanceInsightsStripProps {
  totalStats: TotalStats
  insights: Insight[]
  riskLevel: string
  riskColor: string
}

export function PerformanceInsightsStrip({ totalStats, insights, riskLevel, riskColor }: PerformanceInsightsStripProps) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <div className="text-[10px] text-gray-500 uppercase">Avg Stake</div>
          <div className="text-sm font-semibold text-white">{totalStats.avgStakePct.toFixed(1)}%</div>
          <div className={`text-[10px] ${riskColor}`}>{riskLevel}</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <div className="text-[10px] text-gray-500 uppercase">Best Day</div>
          <div className="text-sm font-semibold text-green-400">
            {totalStats.bestDay ? fmtPL(totalStats.bestDay.dayPL) : '-'}
          </div>
          <div className="text-[10px] text-gray-600">
            {totalStats.bestDay ? formatDateShort(totalStats.bestDay.date) : ''}
          </div>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <div className="text-[10px] text-gray-500 uppercase">Worst Day</div>
          <div className="text-sm font-semibold text-red-400">
            {totalStats.worstDay ? fmtPL(totalStats.worstDay.dayPL) : '-'}
          </div>
          <div className="text-[10px] text-gray-600">
            {totalStats.worstDay ? formatDateShort(totalStats.worstDay.date) : ''}
          </div>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2">
          <div className="text-[10px] text-gray-500 uppercase">Drawdown</div>
          <div className="text-sm font-semibold text-red-400">
            {totalStats.maxDrawdown > 0 ? `-£${totalStats.maxDrawdown.toFixed(0)}` : '£0'}
          </div>
          <div className="text-[10px] text-gray-600">
            {totalStats.maxDrawdownPct.toFixed(1)}% of peak
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Brain className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">AI Insights</span>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 ${insight.color}`}>&#x2022;</span>
                <span className="text-gray-300 leading-relaxed">{insight.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
