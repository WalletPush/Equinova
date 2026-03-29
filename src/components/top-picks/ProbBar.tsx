import React from 'react'

export function ProbBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const pct = Math.round(value * 100)
  const barColor = value >= 0.3 ? 'bg-green-500' : value >= 0.15 ? 'bg-amber-500' : value > 0 ? 'bg-gray-500' : 'bg-gray-800'
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
      <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }} />
      </div>
      <span className="text-[11px] text-gray-300 w-8 text-right font-mono">{pct > 0 ? `${pct}%` : '—'}</span>
    </div>
  )
}
