import React from 'react'
import { createPortal } from 'react-dom'
import {
  X, Brain, ShieldCheck, Shield, TrendingUp,
  AlertTriangle, Gauge,
} from 'lucide-react'
import type { PatternMatch } from '../hooks/useMastermind'

interface MastermindModalProps {
  horseName: string
  patterns: PatternMatch[]
  patternCount: number
  trustScore: number
  trustTier: string
  kellyStake?: number | null
  onClose: () => void
}

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Shield; label: string }> = {
  high:   { color: 'text-green-400',  bg: 'bg-green-500/20',  border: 'border-green-500/30',  icon: ShieldCheck,    label: 'Strong Signals' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Shield,         label: 'Some Signals' },
  low:    { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', icon: AlertTriangle,  label: 'Weak Signals' },
  none:   { color: 'text-gray-500',   bg: 'bg-gray-700/50',   border: 'border-gray-600',      icon: Brain,          label: 'No Signals' },
}

export function MastermindModal({
  horseName,
  patterns,
  patternCount,
  trustScore,
  trustTier,
  kellyStake,
  onClose,
}: MastermindModalProps) {
  const tierCfg = TIER_CONFIG[trustTier] ?? TIER_CONFIG.none
  const TierIcon = tierCfg.icon

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">AI Intelligence</h2>
              <p className="text-gray-400 text-sm">{horseName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Trust Score */}
          <div className={`${tierCfg.bg} border ${tierCfg.border} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TierIcon className={`w-5 h-5 ${tierCfg.color}`} />
                <span className={`font-semibold text-sm uppercase tracking-wider ${tierCfg.color}`}>
                  {tierCfg.label}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${tierCfg.color}`}>{trustScore}</span>
                <span className="text-gray-500 text-xs ml-1">/ 100</span>
              </div>
            </div>
            <TrustBar score={trustScore} />
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-gray-400">
                {patternCount} lifetime profitable {patternCount === 1 ? 'pattern' : 'patterns'} matched
              </span>
              {kellyStake != null && kellyStake > 0 && (
                <span className="text-yellow-400 font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  Kelly: {'\u00A3'}{kellyStake.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Matched Patterns */}
          {patterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-semibold text-sm uppercase tracking-wider">
                  Lifetime Profitable Patterns
                </span>
              </div>
              <div className="space-y-2">
                {patterns.map((pat, idx) => (
                  <PatternCard key={idx} pattern={pat} />
                ))}
              </div>
            </div>
          )}

          {patterns.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No lifetime profitable patterns matched</p>
              <p className="text-xs text-gray-600 mt-1">
                This runner doesn't match any proven signal combinations for its segment
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function TrustBar({ score }: { score: number }) {
  const segments = [
    { min: 0, max: 25, color: 'bg-gray-600' },
    { min: 25, max: 50, color: 'bg-orange-500' },
    { min: 50, max: 75, color: 'bg-yellow-500' },
    { min: 75, max: 100, color: 'bg-green-500' },
  ]

  return (
    <div className="relative">
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-gray-800">
        {segments.map((seg, i) => {
          const segWidth = seg.max - seg.min
          const filled = Math.max(0, Math.min(score - seg.min, segWidth))
          const pct = (filled / segWidth) * 100
          return (
            <div key={i} className="relative" style={{ width: `${segWidth}%` }}>
              <div className={`absolute inset-0 ${seg.color} opacity-20`} />
              <div
                className={`absolute inset-y-0 left-0 ${seg.color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-gray-600">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

function PatternCard({ pattern }: { pattern: PatternMatch }) {
  const roi = pattern.roi_pct
  const bets = pattern.total_bets
  const wins = pattern.wins
  const wr = bets > 0 ? (wins / bets) * 100 : 0
  const roiColor = roi > 0 ? 'text-green-400' : 'text-red-400'
  const wrColor = wr >= 30 ? 'text-green-400' : wr > 0 ? 'text-yellow-400' : 'text-gray-500'

  return (
    <div className="bg-green-900/15 border border-green-700/30 rounded-lg p-3">
      <p className="text-white text-sm font-medium mb-2">{pattern.pattern_label}</p>
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <span className={roiColor}>
          {roi > 0 ? '+' : ''}{roi.toFixed(1)}% ROI
        </span>
        <span className="text-gray-400">
          {bets} bets
        </span>
        <span className={wrColor}>
          {wins}W ({wr > 0 ? wr.toFixed(0) : '\u2014'}%)
        </span>
        <span className="text-gray-500">lifetime</span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
        <span>Stability: {pattern.stability_windows}/5</span>
        <span>Drawdown: {((pattern.drawdown_health ?? 0) * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}
