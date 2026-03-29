import { useState, useMemo } from 'react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { PlaceBetButton } from '@/components/PlaceBetButton'
import { MastermindModal } from '@/components/MastermindModal'
import { AiChatModal } from '@/components/AiChatModal'
import { MarketMovementBadge } from '@/components/MarketMovement'
import { formatOdds } from '@/lib/odds'
import { computeKelly } from '@/lib/kelly'
import { EdgeGauge } from './EdgeGauge'
import { ProbBar } from './ProbBar'
import { TrustBadge } from './TrustBadge'
import type { TopPick } from './types'
import type { MastermindMatch } from '@/hooks/useMastermind'
import {
  CheckCircle,
  Target,
  Gauge,
  MessageSquare,
  Brain,
  Activity,
  TrendingUp,
  Eye,
  Plus,
  Minus,
} from 'lucide-react'

function fmtPos(p: number | null, outcome?: string | null) {
  if (p === null || p === undefined) return ''
  if (p === 0) return outcome || 'LOST'
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}

export function PickCard({ pick, bet, userBankroll, needsSetup, settled, inSlip, onToggleSlip, slipFull, mastermindMatch }: {
  pick: TopPick
  bet: any | null
  userBankroll: number
  needsSetup: boolean
  settled?: boolean
  inSlip?: boolean
  onToggleSlip?: () => void
  slipFull?: boolean
  mastermindMatch?: MastermindMatch
}) {
  const fp = pick.finishing_position
  const isSettled = fp != null && fp >= 0
  const isWinner = fp === 1
  const hasBet = !!bet
  const [showMastermind, setShowMastermind] = useState(false)
  const [showAiChat, setShowAiChat] = useState(false)

  const trustScore = mastermindMatch?.trust_score ?? 0
  const kellyInfo = useMemo(() => computeKelly(pick, userBankroll, trustScore), [pick, userBankroll, trustScore])

  const patternCount = mastermindMatch?.pattern_count ?? 0

  const borderColor = inSlip ? 'border-yellow-500/50' : isSettled && isWinner ? 'border-green-500/40' : isSettled ? 'border-gray-700/50' : patternCount > 0 ? 'border-purple-500/50' : 'border-purple-500/30'

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm border ${borderColor} rounded-2xl relative overflow-hidden ${isSettled && !isWinner ? 'opacity-75' : ''}`}>
      <div className={`px-4 py-3 border-b ${isSettled && isWinner ? 'bg-gradient-to-r from-green-500/15 via-emerald-500/10 to-transparent border-green-500/20' : 'bg-gradient-to-r from-purple-500/15 via-blue-500/10 to-transparent border-purple-500/20'}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Target className={`w-4 h-4 ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`} />
            <span className={`text-xs font-semibold uppercase tracking-wider ${isSettled && isWinner ? 'text-green-400' : 'text-purple-400'}`}>
              Benter Edge: +{(pick.edge * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isSettled && (
              <button
                onClick={() => setShowAiChat(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors"
              >
                <MessageSquare className="w-3 h-3" />
                Chat With AI
              </button>
            )}
            {isSettled && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                isWinner ? 'bg-green-500/20 text-green-400'
                : pick.outcome && ['FELL', 'PU', 'UR', 'BD'].includes(pick.outcome) ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-700 text-gray-400'
              }`}>
                {isWinner ? <><CheckCircle className="w-3 h-3" /> WON</> : fmtPos(fp, pick.outcome)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span>Benter: {(pick.ensemble_proba * 100).toFixed(1)}%</span>
          <span>Market: {(pick.implied_prob * 100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-300">{pick.course}</span>
          <span>·</span>
          <span>{pick.off_time?.substring(0, 5)}</span>
          <span>·</span>
          <span className="uppercase">{pick.race_type}</span>
        </div>

        <div className="flex gap-4">
          <EdgeGauge edge={pick.edge} impliedProb={pick.implied_prob} benterProba={pick.ensemble_proba} />

          <div className="flex-1 min-w-0">
            <HorseNameWithSilk
              horseName={pick.horse_name}
              silkUrl={pick.silk_url || undefined}
              className="text-white font-bold text-base"
            />

            <div className="text-xs text-gray-400 mt-1 space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <span>J: {pick.jockey}</span>
                {pick.jockey_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({pick.jockey_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span>T: {pick.trainer}</span>
                {pick.trainer_course_wr > 0 && (
                  <span className="text-[10px] text-purple-400">({pick.trainer_course_wr.toFixed(0)}% at course)</span>
                )}
                {pick.trainer_21d_wr >= 10 && (
                  <span className="text-[10px] text-green-400">({pick.trainer_21d_wr.toFixed(0)}% last 21d)</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-sm font-bold bg-gray-800 px-2 py-0.5 rounded ${
                pick.odds_movement === 'steaming' ? 'text-green-400' :
                pick.odds_movement === 'drifting' ? 'text-red-400' : 'text-white'
              }`}>
                {formatOdds(String(pick.current_odds))}
              </span>
              <MarketMovementBadge movement={pick.odds_movement} pct={pick.odds_movement_pct} size="md" />
              {kellyInfo && (
                <span className="text-xs text-yellow-400 font-medium flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  Kelly: £{kellyInfo.stake.toFixed(2)}
                </span>
              )}
              {isSettled && kellyInfo && isWinner && (
                <span className="text-xs font-bold text-green-400">
                  WON: +£{(kellyInfo.stake * pick.current_odds).toFixed(2)}
                </span>
              )}
              {isSettled && kellyInfo && !isWinner && fp !== null && (
                <span className="text-xs font-bold text-red-400">
                  LOST: -£{kellyInfo.stake.toFixed(2)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {pick.rpr > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  RPR {Math.round(pick.rpr)}
                </span>
              )}
              {pick.ts > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  TS {Math.round(pick.ts)}
                </span>
              )}
              {pick.best_speed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  SPD {Math.round(pick.best_speed)}
                </span>
              )}
              {pick.avg_fp > 0 && pick.avg_fp <= 4 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  Avg FP {Math.round(pick.avg_fp)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-800 space-y-1.5">
          <ProbBar label="Benter (main)" value={pick.ensemble_proba} color="text-purple-400" icon={Brain} />
          <ProbBar label="LightGBM" value={pick.benter_proba} color="text-orange-400" icon={Activity} />
          <ProbBar label="Random Forest" value={pick.rf_proba} color="text-green-400" icon={TrendingUp} />
          <ProbBar label="XGBoost" value={pick.xgboost_proba} color="text-blue-400" icon={Target} />
        </div>

        {(pick.spotlight || pick.comment) && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-300 leading-relaxed italic">{pick.spotlight || pick.comment}</p>
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {mastermindMatch && (
                <TrustBadge
                  score={mastermindMatch.trust_score}
                  tier={mastermindMatch.trust_tier}
                />
              )}
              {patternCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Brain className="w-3 h-3" />
                  {mastermindMatch?.lifetime_count ?? 0}L + {mastermindMatch?.d21_count ?? 0}D
                </span>
              )}
              {!mastermindMatch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700">
                  <Brain className="w-3 h-3" />
                  Scanning...
                </span>
              )}
            </div>
            <button
              onClick={() => setShowMastermind(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors"
            >
              <Eye className="w-3 h-3" />
              AI Intelligence
            </button>
          </div>
        </div>

        {showMastermind && (
          <MastermindModal
            horseName={pick.horse_name}
            lifetimePatterns={mastermindMatch?.lifetime_patterns ?? []}
            d21Patterns={mastermindMatch?.d21_patterns ?? []}
            patternCount={mastermindMatch?.pattern_count ?? 0}
            lifetimeCount={mastermindMatch?.lifetime_count ?? 0}
            d21Count={mastermindMatch?.d21_count ?? 0}
            trustScore={mastermindMatch?.trust_score ?? 0}
            trustTier={mastermindMatch?.trust_tier ?? 'none'}
            kellyMultiplier={mastermindMatch?.kelly_multiplier ?? 0}
            kellyStake={kellyInfo?.stake}
            fairProbability={mastermindMatch?.fair_probability ?? (pick.ensemble_proba * 100)}
            marketImplied={mastermindMatch?.market_implied ?? (pick.implied_prob * 100)}
            edgePct={mastermindMatch?.edge_pct ?? (pick.edge / pick.implied_prob * 100)}
            stakeFraction={mastermindMatch?.stake_fraction ?? 0}
            worthBetting={mastermindMatch?.worth_betting ?? false}
            onClose={() => setShowMastermind(false)}
          />
        )}

        {showAiChat && (
          <AiChatModal
            context={{
              race_id: pick.race_id,
              horse_name: pick.horse_name,
              course: pick.course,
              off_time: pick.off_time,
              race_type: pick.race_type,
              ensemble_proba: pick.ensemble_proba,
              implied_prob: pick.implied_prob,
              edge: pick.edge,
              current_odds: pick.current_odds,
              opening_odds: pick.opening_odds,
              jockey: pick.jockey,
              trainer: pick.trainer,
            }}
            silkUrl={pick.silk_url}
            horseNumber={pick.number}
            onClose={() => setShowAiChat(false)}
          />
        )}

        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
          <div>
            {onToggleSlip && !isSettled && !hasBet && (
              <button
                onClick={onToggleSlip}
                disabled={!inSlip && slipFull}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  inSlip
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : slipFull
                    ? 'bg-gray-800 text-gray-600 border border-gray-700 cursor-not-allowed'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-yellow-500/30 hover:text-yellow-400'
                }`}
                title={inSlip ? 'Remove from slip' : slipFull ? 'Slip full (max 4)' : 'Add to bet slip'}
              >
                {inSlip ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {inSlip ? 'In Slip' : 'Add to Slip'}
              </button>
            )}
          </div>

          <div>
          {isSettled && bet ? (
            <div className="text-right">
              <div className={`font-bold text-sm ${bet.status === 'won' ? 'text-green-400' : 'text-red-400'}`}>
                {bet.status === 'won' ? '+' : '-'}£{bet.status === 'won' ? Number(bet.potential_return).toFixed(2) : Number(bet.bet_amount).toFixed(2)}
              </div>
            </div>
          ) : isSettled ? (
            <span className="text-[10px] text-gray-500">SP: {formatOdds(String(pick.current_odds))}</span>
          ) : hasBet ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30">
              <CheckCircle className="w-4 h-4" />
              Bet Placed
            </span>
          ) : !needsSetup ? (
            <PlaceBetButton
              horseName={pick.horse_name}
              horseId={pick.horse_id}
              raceId={pick.race_id}
              raceContext={{ race_id: pick.race_id, course_name: pick.course, off_time: pick.off_time }}
              odds={pick.current_odds}
              jockeyName={pick.jockey}
              trainerName={pick.trainer}
              size="small"
              kellyStake={kellyInfo?.stake ?? null}
              trustTier={mastermindMatch?.trust_tier ?? null}
              trustScore={mastermindMatch?.trust_score ?? null}
              edgePct={pick.edge > 0 ? pick.edge : null}
              ensembleProba={pick.ensemble_proba}
            />
          ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
