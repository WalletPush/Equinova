import React from 'react'
import { createPortal } from 'react-dom'
import {
  X, Brain, ShieldCheck, Shield, TrendingUp,
  AlertTriangle, Gauge, CheckCircle, Clock,
} from 'lucide-react'
import type { PatternMatch } from '../hooks/useMastermind'

interface MastermindModalProps {
  horseName: string
  lifetimePatterns: PatternMatch[]
  d21Patterns: PatternMatch[]
  patternCount: number
  lifetimeCount: number
  d21Count: number
  trustScore: number
  trustTier: string
  kellyMultiplier: number
  kellyStake?: number | null
  fairProbability: number
  marketImplied: number
  edgePct: number
  stakeFraction: number
  worthBetting: boolean
  onClose: () => void
}

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Shield; label: string }> = {
  high:   { color: 'text-green-400',  bg: 'bg-green-500/20',  border: 'border-green-500/30',  icon: ShieldCheck,    label: 'HIGH TRUST' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Shield,         label: 'MEDIUM TRUST' },
  low:    { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', icon: AlertTriangle,  label: 'LOW TRUST' },
  none:   { color: 'text-gray-500',   bg: 'bg-gray-700/50',   border: 'border-gray-600',      icon: Brain,          label: 'NO SIGNALS' },
}

export function MastermindModal({
  horseName,
  lifetimePatterns,
  d21Patterns,
  patternCount,
  lifetimeCount,
  d21Count,
  trustScore,
  trustTier,
  kellyMultiplier,
  kellyStake,
  fairProbability,
  marketImplied,
  edgePct,
  stakeFraction,
  worthBetting,
  onClose,
}: MastermindModalProps) {
  const tierCfg = TIER_CONFIG[trustTier] ?? TIER_CONFIG.none
  const TierIcon = tierCfg.icon

  const stakeLabel = stakeFraction > 0
    ? `${stakeFraction.toFixed(1)}% ${kellyMultiplier >= 1 ? 'half' : kellyMultiplier >= 0.5 ? 'quarter' : 'eighth'}-Kelly`
    : 'N/A'

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
              <h2 className="text-white font-semibold text-lg">Mastermind Intelligence</h2>
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
                <span className={`text-3xl font-bold ${tierCfg.color}`}>{trustScore}</span>
                <span className="text-gray-500 text-sm ml-1">/ 100</span>
              </div>
            </div>
            <TrustBar score={trustScore} />
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-gray-400">
                Kelly multiplier: <span className="text-white font-medium">{kellyMultiplier.toFixed(1)}x</span>
              </span>
              {kellyStake != null && kellyStake > 0 && (
                <span className="text-yellow-400 font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  {'\u00A3'}{kellyStake.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Bet Decision */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <h3 className="text-white text-sm font-semibold mb-3 uppercase tracking-wider">Bet Decision</h3>
            <div className="space-y-2">
              <BetRow label="Fair probability" value={`${fairProbability.toFixed(1)}%`} />
              <BetRow label="Market implied" value={`${marketImplied.toFixed(1)}%`} />
              <BetRow
                label="Edge"
                value={`${edgePct >= 0 ? '+' : ''}${edgePct.toFixed(1)}%`}
                valueColor={edgePct >= 5 ? 'text-green-400' : edgePct > 0 ? 'text-yellow-400' : 'text-red-400'}
              />
              <BetRow label="Evidence strength" value={`${trustScore}`} />
              <BetRow label="Trust tier" value={trustTier} />
              <BetRow
                label="Worth betting?"
                value={worthBetting ? 'YES' : 'NO'}
                valueColor={worthBetting ? 'text-green-400' : 'text-red-400'}
                icon={worthBetting ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : undefined}
              />
              <BetRow label="Stake fraction" value={stakeLabel} />
            </div>
          </div>

          {/* Edge warning if negative */}
          {edgePct < 5 && patternCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>edge absent in OOS validation</span>
            </div>
          )}

          {/* Lifetime Patterns */}
          {lifetimePatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-semibold text-sm uppercase tracking-wider">
                  {lifetimeCount} {lifetimeCount === 1 ? 'Lifetime Pattern' : 'Lifetime Patterns'}
                </span>
              </div>
              <div className="space-y-2">
                {lifetimePatterns.map((pat, idx) => (
                  <PatternCard key={`lt-${idx}`} pattern={pat} variant="lifetime" />
                ))}
              </div>
            </div>
          )}

          {/* 21-Day Patterns */}
          {d21Patterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-blue-400 font-semibold text-sm uppercase tracking-wider">
                  {d21Count} {d21Count === 1 ? '21-Day Pattern' : '21-Day Patterns'}
                </span>
              </div>
              <div className="space-y-2">
                {d21Patterns.map((pat, idx) => (
                  <PatternCard key={`d21-${idx}`} pattern={pat} variant="21day" />
                ))}
              </div>
            </div>
          )}

          {/* Also show 21-day stats on lifetime patterns if they have them */}
          {lifetimePatterns.length > 0 && lifetimePatterns.some(p => p.d21_bets > 0) && d21Patterns.length === 0 && (
            <div className="text-xs text-gray-500 text-center">
              21-day rolling stats shown on lifetime patterns above
            </div>
          )}

          {patternCount === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No profitable patterns matched</p>
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

function BetRow({
  label,
  value,
  valueColor = 'text-white',
  icon,
}: {
  label: string
  value: string
  valueColor?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`text-sm font-medium ${valueColor} flex items-center gap-1`}>
        {icon}
        {value}
      </span>
    </div>
  )
}

function TrustBar({ score }: { score: number }) {
  const segments = [
    { min: 0, max: 20, color: 'bg-gray-600' },
    { min: 20, max: 40, color: 'bg-red-500' },
    { min: 40, max: 60, color: 'bg-yellow-500' },
    { min: 60, max: 80, color: 'bg-green-500' },
    { min: 80, max: 100, color: 'bg-green-400' },
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
        <span>20</span>
        <span>40</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  )
}

function PatternCard({ pattern, variant }: { pattern: PatternMatch; variant: 'lifetime' | '21day' }) {
  const isLifetime = variant === 'lifetime'

  const roi = isLifetime ? pattern.roi_pct : pattern.d21_roi_pct
  const bets = isLifetime ? pattern.total_bets : pattern.d21_bets
  const wins = isLifetime ? pattern.wins : pattern.d21_wins
  const wr = bets > 0 ? (wins / bets) * 100 : 0
  const roiColor = roi > 0 ? 'text-green-400' : 'text-red-400'
  const wrColor = wr >= 30 ? 'text-green-400' : wr > 0 ? 'text-yellow-400' : 'text-gray-500'

  const borderColor = isLifetime ? 'border-green-700/30' : 'border-blue-700/30'
  const bgColor = isLifetime ? 'bg-green-900/15' : 'bg-blue-900/15'

  const pqs = computePqs(pattern)

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-white text-sm font-medium flex-1">{pattern.pattern_label}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ml-2 ${
          pqs >= 60 ? 'bg-green-500/20 text-green-400' :
          pqs >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
          'bg-gray-600/20 text-gray-400'
        }`}>
          PQS {pqs.toFixed(1)}
        </span>
      </div>
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
        <span className="text-gray-500">{isLifetime ? 'historical' : '21-day'}</span>
      </div>
      {isLifetime && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
          <span>Stability: {pattern.stability_windows}/5</span>
          <span>Drawdown: {((pattern.drawdown_health ?? 0) * 100).toFixed(0)}%</span>
          {pattern.d21_bets > 0 && (
            <span className={pattern.d21_roi_pct > 0 ? 'text-blue-400' : 'text-orange-400'}>
              21d: {pattern.d21_roi_pct > 0 ? '+' : ''}{pattern.d21_roi_pct.toFixed(1)}% ROI
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function computePqs(p: PatternMatch): number {
  const bets = p.total_bets || p.d21_bets || 0
  const sampleScore = Math.min(25, (Math.log2(Math.max(bets, 1)) / Math.log2(500)) * 25)
  const wr = p.win_rate || (p.d21_bets > 0 ? (p.d21_wins / p.d21_bets) * 100 : 0)
  const winScore = Math.min(25, (wr / 40) * 25)
  const roi = p.roi_pct || p.d21_roi_pct || 0
  const roiScore = Math.min(25, Math.max(0, (roi / 50) * 25))
  const sw = p.stability_windows || 0
  const stabilityScore = Math.min(15, (sw / 5) * 15)
  const dh = p.drawdown_health || 0
  const drawdownScore = dh * 10
  return sampleScore + winScore + roiScore + stabilityScore + drawdownScore
}
