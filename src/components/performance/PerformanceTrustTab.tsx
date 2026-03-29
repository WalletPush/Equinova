import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { ShieldCheck } from 'lucide-react'
import { fmtPL } from '@/lib/performanceUtils'
import type { TrustTierSummary } from './types'

function TrustTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-gray-400 mb-1">{d.name} Trust</div>
      <div className={`font-bold ${d.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        ROI: {d.roi >= 0 ? '+' : ''}{d.roi}%
      </div>
      <div className="text-gray-500 mt-0.5">Win Rate: {d.winRate}%</div>
    </div>
  )
}

interface PerformanceTrustTabProps {
  trustTierSummaries: TrustTierSummary[]
}

export function PerformanceTrustTab({ trustTierSummaries }: PerformanceTrustTabProps) {
  return (
    <div className="space-y-4">
      {trustTierSummaries.length === 0 ? (
        <div className="text-center py-12">
          <ShieldCheck className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <h3 className="text-gray-400 font-medium mb-1">Trust Tier Analytics Coming Soon</h3>
          <p className="text-gray-600 text-sm max-w-sm mx-auto">
            Future bets placed through AI Top Picks will be tagged with confidence tiers,
            enabling detailed performance analysis by trust level.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Betting ROI by Trust Tier</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trustTierSummaries.map(t => ({
                name: t.key, roi: Number(t.roi.toFixed(1)), winRate: Number(t.winRate.toFixed(1)),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${v}%`} width={40} />
                <Tooltip content={<TrustTooltip />} />
                <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                  {trustTierSummaries.map((t, i) => (
                    <Cell key={i} fill={t.barColor} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {trustTierSummaries.map(t => (
            <div key={t.key} className={`border rounded-xl p-4 ${t.bgClass}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 ${t.textClass}`} />
                  <span className={`text-sm font-semibold ${t.textClass}`}>{t.key} Trust</span>
                </div>
                <span className={`text-sm font-bold ${t.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtPL(t.pl)}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                <div>
                  <div className="text-gray-500 mb-0.5">Bets</div>
                  <div className="text-white font-medium">{t.totalBets}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">Win Rate</div>
                  <div className="text-white font-medium">{t.winRate.toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">Avg Stake</div>
                  <div className="text-white font-medium">£{t.avgStake.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">Betting ROI</div>
                  <div className={`font-medium ${t.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.roi >= 0 ? '+' : ''}{t.roi.toFixed(1)}%
                  </div>
                </div>
              </div>
              {t.avgEdge > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700/30 text-[10px] text-gray-500">
                  Avg edge: <span className="text-cyan-400">{t.avgEdge.toFixed(1)}%</span>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
