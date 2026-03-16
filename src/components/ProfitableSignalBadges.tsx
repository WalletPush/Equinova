import React from 'react'
import type { ProfitableSignal } from '@/lib/confluenceScore'
import type { DynamicCombo } from '@/hooks/useDynamicSignals'

interface Props {
  signals?: ProfitableSignal[]
  dynamicCombos?: DynamicCombo[]
  compact?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  proven:   'text-green-400 bg-green-500/20 border-green-500/50',
  strong:   'text-emerald-400 bg-emerald-500/15 border-emerald-500/40',
  emerging: 'text-amber-400 bg-amber-500/15 border-amber-500/40',
}

export function ProfitableSignalBadges({ signals = [], dynamicCombos = [], compact = false }: Props) {
  const hasAnything = signals.length > 0 || dynamicCombos.length > 0
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

    for (const dc of dynamicCombos) {
      allBadges.push({
        key: `dyn-${dc.combo_key}`,
        label: dc.combo_label,
        color: STATUS_STYLES[dc.status] || STATUS_STYLES.emerging,
        title: `${dc.combo_label}: ${dc.win_rate}% WR, ${dc.total_bets} bets, ${dc.roi_pct}% ROI, £${dc.profit.toFixed(2)} profit [${dc.status}]`,
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
      {dynamicCombos.map(dc => (
        <div
          key={`dyn-${dc.combo_key}`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_STYLES[dc.status] || STATUS_STYLES.emerging}`}
          title={`${dc.total_bets} bets, p=${dc.p_value?.toFixed(4) ?? '—'} [${dc.status}]`}
        >
          <span>{dc.combo_label}</span>
          <span className="opacity-60">·</span>
          <span>{dc.win_rate}%</span>
          <span className="opacity-60">·</span>
          <span className={dc.roi_pct > 0 ? 'text-green-400' : 'text-red-400'}>
            {dc.roi_pct > 0 ? '+' : ''}{dc.roi_pct}% ROI
          </span>
        </div>
      ))}
    </div>
  )
}
