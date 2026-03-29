import React from 'react'
import type { ProfitableSignal } from '@/lib/confluenceScore'
import type { PatternMatch } from '@/hooks/useMastermind'

interface Props {
  signals?: ProfitableSignal[]
  mastermindPatterns?: PatternMatch[]
  compact?: boolean
}

const PATTERN_STYLES = {
  lifetime: 'text-green-400 bg-green-500/20 border-green-500/50',
  d21:      'text-cyan-400 bg-cyan-500/15 border-cyan-500/40',
}

export function ProfitableSignalBadges({ signals = [], mastermindPatterns = [], compact = false }: Props) {
  const hasAnything = signals.length > 0 || mastermindPatterns.length > 0
  if (!hasAnything) return null

  if (compact) {
    const allBadges: { key: string; label: string; color: string; title: string }[] = []

    for (const sig of signals) {
      allBadges.push({
        key: sig.key,
        label: sig.label,
        color: sig.color,
        title: `${sig.label}: ${sig.winRate} win rate, ${sig.totalBets} bets, £${sig.profit?.toFixed(2)} profit`,
      })
    }

    for (const p of mastermindPatterns) {
      const isD21 = p.pattern_type === '21DAY_PROFITABLE'
      const roiLabel = isD21 ? `${p.d21_roi_pct?.toFixed(0) ?? '?'}% 21d` : `${p.roi_pct?.toFixed(0) ?? '?'}%`
      allBadges.push({
        key: `mm-${p.pattern_id}`,
        label: p.pattern_label,
        color: isD21 ? PATTERN_STYLES.d21 : PATTERN_STYLES.lifetime,
        title: `${p.pattern_label}: ${(p.win_rate * 100).toFixed(0)}% WR, ${p.total_bets} bets, ${roiLabel} ROI [${isD21 ? '21-day' : 'lifetime'}]`,
      })
    }

    const unique = allBadges.filter((b, i, arr) => arr.findIndex(x => x.label === b.label) === i)

    return (
      <div className="flex flex-wrap gap-1">
        {unique.slice(0, 3).map(b => (
          <span
            key={b.key}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${b.color}`}
            title={b.title}
          >
            {b.label}
          </span>
        ))}
        {unique.length > 3 && (
          <span className="text-[10px] text-gray-500">+{unique.length - 3}</span>
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
      {mastermindPatterns.map(p => {
        const isD21 = p.pattern_type === '21DAY_PROFITABLE'
        const roi = isD21 ? (p.d21_roi_pct ?? p.roi_pct) : p.roi_pct
        return (
          <div
            key={`mm-${p.pattern_id}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${isD21 ? PATTERN_STYLES.d21 : PATTERN_STYLES.lifetime}`}
            title={`${p.total_bets} bets, stab=${p.stability_windows}/5 [${isD21 ? '21-day' : 'lifetime'}]`}
          >
            <span>{p.pattern_label}</span>
            <span className="opacity-60">·</span>
            <span>{(p.win_rate * 100).toFixed(0)}%</span>
            <span className="opacity-60">·</span>
            <span className={roi > 0 ? 'text-green-400' : 'text-red-400'}>
              {roi > 0 ? '+' : ''}{roi.toFixed(0)}% ROI
            </span>
          </div>
        )
      })}
    </div>
  )
}
