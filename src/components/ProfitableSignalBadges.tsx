import React from 'react'
import type { ProfitableSignal } from '@/lib/confluenceScore'

interface Props {
  signals: ProfitableSignal[]
  compact?: boolean
}

export function ProfitableSignalBadges({ signals, compact = false }: Props) {
  if (signals.length === 0) return null

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {signals.slice(0, 3).map(sig => (
          <span
            key={sig.key}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${sig.color}`}
            title={`${sig.label}: ${sig.winRate} win rate, ${sig.totalBets} bets, £${sig.profit?.toFixed(2)} profit`}
          >
            {sig.label}
          </span>
        ))}
        {signals.length > 3 && (
          <span className="text-[10px] text-gray-500">+{signals.length - 3}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map(sig => (
        <div
          key={sig.key}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${sig.color}`}
        >
          <span>{sig.label}</span>
          <span className="opacity-60">·</span>
          <span>{sig.winRate}</span>
          {sig.profit != null && sig.profit > 0 && (
            <>
              <span className="opacity-60">·</span>
              <span className="text-green-400">+£{sig.profit.toFixed(2)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
