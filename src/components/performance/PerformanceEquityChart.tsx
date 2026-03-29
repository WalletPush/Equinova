import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Line,
} from 'recharts'
import { fmtPL } from '@/lib/performanceUtils'
import type { ChartDataPoint, MaxDrawdownPoint, TotalStats, SystemBenchmark } from './types'

function PLTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-gray-400 mb-1">{d.label}</div>
      <div className={`font-bold ${d.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>You: {fmtPL(d.pl)}</div>
      {d.systemPL != null && (
        <div className="text-cyan-400 mt-0.5">System: {fmtPL(d.systemPL)}</div>
      )}
      <div className="text-gray-500 mt-0.5">Bankroll: £{d.bankroll.toFixed(2)}</div>
    </div>
  )
}

interface PerformanceEquityChartProps {
  chartData: ChartDataPoint[]
  gradientOffset: number
  maxDrawdownPoint: MaxDrawdownPoint | null
  totalStats: TotalStats
  systemBenchmark: SystemBenchmark | null
}

export function PerformanceEquityChart({ chartData, gradientOffset, maxDrawdownPoint, totalStats, systemBenchmark }: PerformanceEquityChartProps) {
  if (chartData.length <= 1) return null

  return (
    <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Settled P/L Curve</h2>
        {systemBenchmark && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block rounded" /> You</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-400 inline-block rounded border-dashed" style={{ borderTop: '1px dashed #06b6d4', height: 0, background: 'none' }} /> System</span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset={`${gradientOffset * 100}%`} stopColor="#22c55e" stopOpacity={0.05} />
              <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id="plStroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={`${gradientOffset * 100}%`} stopColor="#22c55e" stopOpacity={1} />
              <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `£${v}`} width={45} />
          <Tooltip content={<PLTooltip />} cursor={{ stroke: '#4b5563', strokeDasharray: '4 4' }} />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="pl" stroke="url(#plStroke)" fill="url(#plFill)" strokeWidth={2} name="Your P/L"
            dot={false} activeDot={{ r: 4, fill: '#fbbf24', stroke: '#1f2937', strokeWidth: 2 }} />
          {systemBenchmark && (
            <Line type="monotone" dataKey="systemPL" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="5 3"
              dot={false} activeDot={{ r: 3, fill: '#06b6d4' }} name="System" connectNulls />
          )}
          {maxDrawdownPoint && (
            <ReferenceDot x={maxDrawdownPoint.label} y={maxDrawdownPoint.pl} r={5}
              fill="#ef4444" stroke="#7f1d1d" strokeWidth={2}>
            </ReferenceDot>
          )}
        </AreaChart>
      </ResponsiveContainer>
      {maxDrawdownPoint && totalStats.maxDrawdown > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          Max drawdown: <span className="text-red-400 font-medium">-£{totalStats.maxDrawdown.toFixed(2)}</span>
          <span className="text-gray-600">({totalStats.maxDrawdownPct.toFixed(1)}% of peak)</span>
        </div>
      )}
    </div>
  )
}
