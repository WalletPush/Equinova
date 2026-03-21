import React from 'react'
import { createPortal } from 'react-dom'
import { X, Brain, ShieldAlert, TrendingUp, BarChart3 } from 'lucide-react'
import type { PatternMatch } from '../hooks/useMastermind'

interface MastermindModalProps {
  horseName: string
  patterns: PatternMatch[]
  antiPatterns: PatternMatch[]
  isVetoed: boolean
  vetoReason: string | null
  kellyStake?: number | null
  onClose: () => void
}

export function MastermindModal({
  horseName,
  patterns,
  antiPatterns,
  isVetoed,
  vetoReason,
  kellyStake,
  onClose,
}: MastermindModalProps) {
  const activePatterns = patterns.filter(p => p.status === 'ACTIVE')
  const monitoringPatterns = patterns.filter(p => p.status === 'MONITORING')

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
          {/* Veto Warning */}
          {isVetoed && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span className="text-red-400 font-semibold text-sm uppercase tracking-wider">
                  Vetoed — Auto-bet Suppressed
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
                  {activePatterns.length} Active Pattern{activePatterns.length !== 1 ? 's' : ''} Match
                </span>
                <span className="text-gray-500 text-xs">(last 21 days)</span>
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
                  {monitoringPatterns.length} Monitoring Pattern{monitoringPatterns.length !== 1 ? 's' : ''}
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
                {antiPatterns.map((pat, idx) => (
                  <PatternCard key={idx} pattern={pat} variant="anti" />
                ))}
              </div>
            </div>
          )}

          {patterns.length === 0 && antiPatterns.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No pattern matches for this runner</p>
            </div>
          )}

          {/* Auto-bet Summary */}
          {activePatterns.length > 0 && !isVetoed && (
            <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-purple-300 text-sm font-medium">Auto-bet: </span>
                  <span className="text-green-400 text-sm font-semibold">
                    QUALIFIED ({activePatterns.length} active pattern{activePatterns.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {kellyStake != null && kellyStake > 0 && (
                  <span className="text-white text-sm font-mono font-semibold">
                    Kelly: £{kellyStake.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function PatternCard({ pattern, variant }: { pattern: PatternMatch; variant: 'active' | 'monitoring' | 'anti' }) {
  const borderColor = variant === 'active' ? 'border-green-700/30' : variant === 'monitoring' ? 'border-yellow-700/30' : 'border-red-700/30'
  const bgColor = variant === 'active' ? 'bg-green-900/15' : variant === 'monitoring' ? 'bg-yellow-900/10' : 'bg-red-900/15'
  const roiColor = pattern.d21_roi_pct > 0 ? 'text-green-400' : 'text-red-400'
  const wrColor = pattern.d21_bets > 0
    ? (pattern.d21_wins / pattern.d21_bets) * 100 >= 30
      ? 'text-green-400'
      : 'text-yellow-400'
    : 'text-gray-500'
  const d21WR = pattern.d21_bets > 0 ? ((pattern.d21_wins / pattern.d21_bets) * 100).toFixed(0) : '—'

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <p className="text-white text-sm font-medium mb-2">{pattern.pattern_label}</p>
      <div className="flex items-center gap-4 text-xs">
        <span className={roiColor}>
          {pattern.d21_roi_pct > 0 ? '+' : ''}{pattern.d21_roi_pct.toFixed(1)}% ROI
        </span>
        <span className="text-gray-400">
          {pattern.d21_bets} bets
        </span>
        <span className={wrColor}>
          {pattern.d21_wins}W ({d21WR}%)
        </span>
        <span className="text-gray-500">
          last 21d
        </span>
      </div>
    </div>
  )
}
