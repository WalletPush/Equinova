import React from 'react'
import { createPortal } from 'react-dom'
import {
  X, Brain, ShieldAlert, ShieldCheck, Shield, TrendingUp,
  BarChart3, AlertTriangle, CheckCircle, XCircle, Gauge,
} from 'lucide-react'
import type { PatternMatch, BetQuestions } from '../hooks/useMastermind'

interface MastermindModalProps {
  horseName: string
  patterns: PatternMatch[]
  antiPatterns: PatternMatch[]
  isVetoed: boolean
  vetoReason: string | null
  kellyStake?: number | null
  edgeTrustScore: number
  trustTier: string
  kellyMultiplier: number
  failureModes: string[]
  betQuestions: BetQuestions | null
  onClose: () => void
}

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof Shield; label: string }> = {
  high:    { color: 'text-green-400',  bg: 'bg-green-500/20',  border: 'border-green-500/30',  icon: ShieldCheck, label: 'High Trust' },
  medium:  { color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', icon: Shield,      label: 'Medium Trust' },
  low:     { color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', icon: AlertTriangle, label: 'Low Trust' },
  blocked: { color: 'text-gray-500',   bg: 'bg-gray-700/50',   border: 'border-gray-600',      icon: ShieldAlert,   label: 'Blocked' },
}

export function MastermindModal({
  horseName,
  patterns,
  antiPatterns,
  isVetoed,
  vetoReason,
  kellyStake,
  edgeTrustScore,
  trustTier,
  kellyMultiplier,
  failureModes,
  betQuestions,
  onClose,
}: MastermindModalProps) {
  const activePatterns = patterns.filter(p => p.status === 'ACTIVE')
  const monitoringPatterns = patterns.filter(p => p.status === 'MONITORING')
  const tierCfg = TIER_CONFIG[trustTier] ?? TIER_CONFIG.blocked
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
          {/* Edge Trust Score */}
          <div className={`${tierCfg.bg} border ${tierCfg.border} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TierIcon className={`w-5 h-5 ${tierCfg.color}`} />
                <span className={`font-semibold text-sm uppercase tracking-wider ${tierCfg.color}`}>
                  {tierCfg.label}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${tierCfg.color}`}>{edgeTrustScore}</span>
                <span className="text-gray-500 text-xs ml-1">/ 100</span>
              </div>
            </div>
            <ETSBar score={edgeTrustScore} />
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-gray-400">
                Kelly multiplier: <span className="text-white font-semibold">{kellyMultiplier}x</span>
              </span>
              {kellyStake != null && kellyStake > 0 && (
                <span className="text-yellow-400 font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  £{kellyStake.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Bet Decision Summary */}
          {betQuestions && (
            <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-2.5">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Bet Decision</h3>
              <BetRow label="Fair probability" value={`${betQuestions.fair_probability}%`} />
              <BetRow label="Market implied" value={`${betQuestions.market_implied}%`} />
              <BetRow
                label="Edge"
                value={`${betQuestions.edge_pct > 0 ? '+' : ''}${betQuestions.edge_pct}%`}
                highlight={betQuestions.edge_pct >= 5 ? 'green' : betQuestions.edge_pct > 0 ? 'yellow' : 'red'}
              />
              <BetRow label="Evidence strength" value={`${betQuestions.evidence_strength}`} />
              <BetRow label="Trust tier" value={betQuestions.trust_tier} />
              <BetRow
                label="Worth betting?"
                value={betQuestions.worth_betting ? 'YES' : 'NO'}
                highlight={betQuestions.worth_betting ? 'green' : 'red'}
                icon={betQuestions.worth_betting ? CheckCircle : XCircle}
              />
              <BetRow label="Stake fraction" value={`${betQuestions.stake_fraction}x quarter-Kelly`} />
            </div>
          )}

          {/* Failure Modes */}
          {failureModes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {failureModes.map((fm, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {fm}
                </span>
              ))}
            </div>
          )}

          {/* Veto Warning */}
          {isVetoed && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span className="text-red-400 font-semibold text-sm uppercase tracking-wider">
                  Vetoed
                </span>
              </div>
              <p className="text-red-300 text-sm">{vetoReason}</p>
            </div>
          )}

          {/* Active Patterns */}
          {activePatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-semibold text-sm uppercase tracking-wider">
                  {activePatterns.length} Active Pattern{activePatterns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {activePatterns.map((pat, idx) => (
                  <PatternCard key={idx} pattern={pat} variant="active" />
                ))}
              </div>
            </div>
          )}

          {/* Monitoring Patterns */}
          {monitoringPatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-semibold text-sm uppercase tracking-wider">
                  {monitoringPatterns.length} Monitoring
                </span>
              </div>
              <div className="space-y-2">
                {monitoringPatterns.map((pat, idx) => (
                  <PatternCard key={idx} pattern={pat} variant="monitoring" />
                ))}
              </div>
            </div>
          )}

          {/* Anti-Patterns */}
          {antiPatterns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-semibold text-sm uppercase tracking-wider">
                  {antiPatterns.length} Anti-Pattern{antiPatterns.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {antiPatterns.slice(0, 5).map((pat, idx) => (
                  <PatternCard key={idx} pattern={pat} variant="anti" />
                ))}
                {antiPatterns.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">+{antiPatterns.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {patterns.length === 0 && antiPatterns.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No pattern matches for this runner</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function ETSBar({ score }: { score: number }) {
  const segments = [
    { min: 0, max: 20, color: 'bg-gray-600', label: '' },
    { min: 20, max: 40, color: 'bg-orange-500', label: '' },
    { min: 40, max: 70, color: 'bg-yellow-500', label: '' },
    { min: 70, max: 100, color: 'bg-green-500', label: '' },
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

function BetRow({ label, value, highlight, icon: Icon }: {
  label: string
  value: string
  highlight?: 'green' | 'yellow' | 'red'
  icon?: React.ElementType
}) {
  const valueColor = highlight === 'green' ? 'text-green-400'
    : highlight === 'red' ? 'text-red-400'
    : highlight === 'yellow' ? 'text-yellow-400'
    : 'text-white'

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-semibold ${valueColor} flex items-center gap-1`}>
        {Icon && <Icon className="w-3 h-3" />}
        {value}
      </span>
    </div>
  )
}

function PatternCard({ pattern, variant }: { pattern: PatternMatch; variant: 'active' | 'monitoring' | 'anti' }) {
  const borderColor = variant === 'active' ? 'border-green-700/30' : variant === 'monitoring' ? 'border-yellow-700/30' : 'border-red-700/30'
  const bgColor = variant === 'active' ? 'bg-green-900/15' : variant === 'monitoring' ? 'bg-yellow-900/10' : 'bg-red-900/15'

  const has21d = pattern.d21_bets > 0
  const roi = has21d ? pattern.d21_roi_pct : pattern.roi_pct
  const bets = has21d ? pattern.d21_bets : pattern.total_bets
  const wins = has21d ? pattern.d21_wins : pattern.wins
  const wr = bets > 0 ? (wins / bets) * 100 : 0
  const period = has21d ? 'last 21d' : 'historical'

  const roiColor = roi > 0 ? 'text-green-400' : 'text-red-400'
  const wrColor = wr >= 30 ? 'text-green-400' : wr > 0 ? 'text-yellow-400' : 'text-gray-500'

  const pqs = pattern.pqs ?? 0
  const showQuality = variant === 'active' && pqs > 0

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-sm font-medium">{pattern.pattern_label}</p>
        {showQuality && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            pqs >= 70 ? 'bg-green-500/20 text-green-400' :
            pqs >= 40 ? 'bg-yellow-500/15 text-yellow-400' :
            'bg-gray-700 text-gray-400'
          }`}>
            PQS {pqs}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <span className={roiColor}>
          {roi > 0 ? '+' : ''}{roi.toFixed(1)}% ROI
        </span>
        <span className="text-gray-400">
          {bets} bets
        </span>
        <span className={wrColor}>
          {wins}W ({wr > 0 ? wr.toFixed(0) : '—'}%)
        </span>
        <span className="text-gray-500">
          {period}
        </span>
      </div>
      {showQuality && (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
          <span>Stability: {pattern.stability_windows}/5</span>
          <span>Drawdown: {((pattern.drawdown_health ?? 0) * 100).toFixed(0)}%</span>
          {pattern.failure_modes?.length > 0 && (
            <span className="text-amber-500">{pattern.failure_modes[0]}</span>
          )}
        </div>
      )}
    </div>
  )
}
