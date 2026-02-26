import React, { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, Clock, Users, Trophy, AlertTriangle, Shield, Zap, MessageSquare } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { formatNormalized } from '@/lib/normalize'
import { getVerdictConfig } from '@/lib/confluenceScore'
import type { RaceVerdict, ConfluenceResult, ProfitableSignal } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

function ScoreBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 65 ? 'text-green-400 border-green-500/40 bg-green-500/10'
    : score >= 45 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
    : 'text-red-400 border-red-500/40 bg-red-500/10'
  const sizeClass = size === 'md'
    ? 'text-base font-bold px-2.5 py-1'
    : 'text-xs font-bold px-1.5 py-0.5'
  return (
    <span className={`${sizeClass} rounded border ${color} tabular-nums`}>{score}</span>
  )
}

function buildDetailedComment(
  entry: RaceEntry,
  raceEntries: RaceEntry[],
  badges: { label: string; color: string }[],
  score: number,
  normalizedEnsemble: number,
  signals: ProfitableSignal[],
): string {
  const parts: string[] = []

  // AI models
  if (badges.length >= 3) {
    parts.push(`${badges.length} out of 5 AI models pick this horse to win — that's very strong agreement`)
  } else if (badges.length === 2) {
    parts.push(`Picked by ${badges.length} AI models as the most likely winner`)
  } else if (badges.length === 1) {
    parts.push(`Selected as top pick by the ${badges.map(b => b.label).join(', ')} model`)
  }

  // RPR
  const rprs = raceEntries.map(e => e.rpr || 0).filter(v => v > 0)
  const maxRpr = rprs.length > 0 ? Math.max(...rprs) : 0
  if ((entry.rpr || 0) > 0) {
    if ((entry.rpr || 0) >= maxRpr && maxRpr > 0) {
      parts.push(`Has the highest Racing Post Rating in the field (RPR ${entry.rpr})`)
    } else if (maxRpr > 0) {
      parts.push(`RPR of ${entry.rpr} (field best: ${maxRpr})`)
    }
  }

  // Topspeed
  const tss = raceEntries.map(e => e.ts || 0).filter(v => v > 0)
  const maxTs = tss.length > 0 ? Math.max(...tss) : 0
  if ((entry.ts || 0) > 0) {
    if ((entry.ts || 0) >= maxTs && maxTs > 0) {
      parts.push(`Top-rated on Topspeed (TS ${entry.ts})`)
    } else if (maxTs > 0 && (entry.ts || 0) >= maxTs - 3) {
      parts.push(`Close to the best Topspeed in the race (TS ${entry.ts} vs ${maxTs})`)
    }
  }

  // Jockey
  const jockeyWinDist = entry.jockey_win_percentage_at_distance || 0
  if (jockeyWinDist >= 15) {
    parts.push(`Jockey ${entry.jockey_name} has a ${jockeyWinDist.toFixed(0)}% win rate at this distance`)
  }

  // Trainer
  const trainerCourse = entry.trainer_win_percentage_at_course || 0
  const t21 = entry.trainer_21_days_win_percentage || 0
  if (trainerCourse >= 15 && t21 >= 15) {
    parts.push(`Trainer ${entry.trainer_name} is in strong recent form (${t21.toFixed(0)}% last 21 days) and has a ${trainerCourse.toFixed(0)}% strike rate at this course`)
  } else if (trainerCourse >= 15) {
    parts.push(`Trainer has a ${trainerCourse.toFixed(0)}% win rate at this course`)
  } else if (t21 >= 15) {
    parts.push(`Trainer is in good recent form (${t21.toFixed(0)}% win rate last 21 days)`)
  }

  // Speed figures
  const speedFig = entry.best_speed_figure_at_distance || entry.last_speed_figure || 0
  if (speedFig > 0) {
    const fieldFigs = raceEntries
      .map(e => e.best_speed_figure_at_distance || e.last_speed_figure || 0)
      .filter(v => v > 0)
    const fieldAvg = fieldFigs.length > 0 ? fieldFigs.reduce((a, b) => a + b, 0) / fieldFigs.length : 0
    if (fieldAvg > 0 && speedFig > fieldAvg * 1.05) {
      parts.push(`Speed figures are ${((speedFig / fieldAvg - 1) * 100).toFixed(0)}% above the field average`)
    }
  }

  // Market movement
  if (entry.odds_movement === 'steaming' && (entry.odds_movement_pct || 0) !== 0) {
    parts.push(`Odds have shortened ${Math.abs(entry.odds_movement_pct || 0).toFixed(0)}% — money is coming for this horse`)
  }

  // Course/distance specialist
  const horseWinDist = entry.horse_win_percentage_at_distance || 0
  if (horseWinDist >= 20) {
    parts.push(`Proven at this distance with a ${horseWinDist.toFixed(0)}% win rate`)
  }

  // Profitable signals summary
  if (signals.length > 0) {
    const topSig = signals[0]
    const pct = parseInt(topSig.winRate)
    if (signals.length >= 2) {
      parts.push(`Matches ${signals.length} historically profitable patterns — the strongest being "${topSig.label}" which has a ${topSig.winRate} win rate`)
    } else {
      parts.push(`Matches the "${topSig.label}" pattern which historically wins ${topSig.winRate} of the time`)
    }
  }

  if (parts.length === 0) {
    return 'Limited data available for this runner. Score is based on the available signals.'
  }

  return parts.join('. ') + '.'
}

interface RaceVerdictCardProps {
  verdict: RaceVerdict
  modelPicks: Map<string, { label: string; color: string }[]>
  onHorseClick?: (entry: RaceEntry) => void
}

export function RaceVerdictCard({ verdict, modelPicks, onHorseClick }: RaceVerdictCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = getVerdictConfig(verdict.verdict)
  const displayTime = formatTime(verdict.offTime)

  const top3Scores = verdict.allScored.slice(0, 3).map(s => s.score)
  const competitivenessLabel =
    verdict.competitiveness <= 5 ? 'Very tight field' :
    verdict.competitiveness <= 12 ? 'Competitive' :
    'Clear standout'

  return (
    <div className={`bg-gray-900/60 border border-gray-800 rounded-xl transition-all duration-200 ${
      expanded ? 'ring-1 ring-gray-700' : ''
    }`}>
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        {/* Verdict dot + badge */}
        <div className={`flex items-center gap-2 flex-shrink-0`}>
          <div className={`w-2.5 h-2.5 rounded-full ${config.dotColor} ${verdict.verdict === 'strong' ? 'animate-pulse' : ''}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.bg} ${config.border} ${config.text}`}>
            {config.label}
          </span>
        </div>

        {/* Race info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium text-white truncate">{verdict.courseName}</span>
          <span className="text-xs text-gray-500">{displayTime}</span>
          <span className="text-[10px] text-gray-600">{verdict.raceClass}</span>
          <span className="text-[10px] text-gray-600 hidden sm:inline">{verdict.distance}</span>
          <span className="text-[10px] text-gray-600 hidden sm:inline">{verdict.fieldSize} runners</span>
        </div>

        {/* Top pick preview */}
        {verdict.topSelection && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            {verdict.topPickSignals.length > 0 && (
              <span className="text-[9px] font-bold text-yellow-400 bg-yellow-500/15 border border-yellow-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" />
                {verdict.topPickSignals.length}
              </span>
            )}
            <span className="text-xs text-gray-400 truncate max-w-[120px]">{verdict.topSelection.entry.horse_name}</span>
            <span className="text-xs font-bold text-white">{formatOdds(verdict.topSelection.entry.current_odds)}</span>
            <ScoreBadge score={verdict.topSelection.score} />
          </div>
        )}

        <div className="flex-shrink-0 text-gray-500">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 p-3 sm:p-4 space-y-3">
          {/* Race metadata */}
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{verdict.courseName}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{displayTime}</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{verdict.fieldSize} runners</span>
            <span>{verdict.distance} · {verdict.going} · {verdict.surface}</span>
            {verdict.prize && <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />{verdict.prize}</span>}
          </div>

          {/* Competitiveness */}
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-[11px] text-gray-400">{competitivenessLabel}</span>
            <span className="text-[10px] text-gray-600">
              (top 3 spread: {top3Scores.join(' / ')})
            </span>
          </div>

          {/* Top selection */}
          {verdict.topSelection && (() => {
            const topEntry = verdict.topSelection.entry
            const topBadges = modelPicks.get(topEntry.horse_id) || []
            const topScore = verdict.topSelection.score
            const topEnsemble = verdict.topSelection.normalizedEnsemble
            const detailedComment = buildDetailedComment(
              topEntry, verdict.entries, topBadges, topScore, topEnsemble, verdict.topPickSignals,
            )

            return (
              <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-3">
                {/* Horse name + score */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Our Pick</span>
                    </div>
                    <HorseNameWithSilk
                      horseName={topEntry.horse_name}
                      silkUrl={topEntry.silk_url}
                      className="text-white font-bold text-base"
                      clickable={!!onHorseClick}
                      onHorseClick={onHorseClick}
                      horseEntry={topEntry}
                    />
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      J: {topEntry.jockey_name} · T: {topEntry.trainer_name}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <ScoreBadge score={topScore} size="md" />
                    <span className="text-[8px] text-gray-500 uppercase tracking-wider">Equinova</span>
                  </div>
                </div>

                {/* Key stats row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    {topBadges.map((b, i) => (
                      <ModelBadge key={i} label={b.label} color={b.color} showCheck />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-white bg-gray-700 px-1.5 py-0.5 rounded">
                    {formatOdds(topEntry.current_odds)}
                  </span>
                  <span className="text-[10px] text-gray-500">odds</span>
                  <span className="text-xs text-green-400 font-medium">
                    {formatNormalized(topEnsemble)}
                  </span>
                  <span className="text-[10px] text-gray-500">AI win prob</span>
                  {(topEntry.rpr || 0) > 0 && (
                    <>
                      <span className="text-xs text-gray-300">{topEntry.rpr}</span>
                      <span className="text-[10px] text-gray-500">RPR</span>
                    </>
                  )}
                  {(topEntry.ts || 0) > 0 && (
                    <>
                      <span className="text-xs text-gray-300">{topEntry.ts}</span>
                      <span className="text-[10px] text-gray-500">TS</span>
                    </>
                  )}
                </div>

                {/* Profitable signal tags */}
                {verdict.topPickSignals.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    {verdict.topPickSignals.slice(0, 3).map(sig => (
                      <span
                        key={sig.key}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${sig.color}`}
                      >
                        {sig.label} ({sig.winRate} win)
                      </span>
                    ))}
                  </div>
                )}

                {/* Detailed AI comment */}
                <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-gray-300 leading-relaxed">{detailedComment}</p>
                  </div>
                </div>

                <ShortlistButton
                  horseName={topEntry.horse_name}
                  raceContext={{ race_id: verdict.raceId, course_name: verdict.courseName, off_time: verdict.offTime }}
                  odds={formatOdds(topEntry.current_odds)}
                  jockeyName={topEntry.jockey_name}
                  trainerName={topEntry.trainer_name}
                  size="small"
                />
              </div>
            )
          })()}

          {/* Danger horse */}
          {verdict.dangerHorse && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[11px] text-amber-400 font-medium">One to watch: </span>
                <span className="text-[11px] text-gray-300">
                  {verdict.dangerHorse.entry.horse_name} ({formatOdds(verdict.dangerHorse.entry.current_odds)})
                </span>
                <ScoreBadge score={verdict.dangerHorse.score} />
              </div>
            </div>
          )}

          {/* Rest of field */}
          {verdict.allScored.length > 2 && (
            <div className="space-y-1.5 pt-2 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Full Rankings</span>
                <div className="flex items-center gap-3 text-[9px] text-gray-600">
                  <span>Odds</span>
                  <span>Win Prob</span>
                  <span>Score</span>
                </div>
              </div>
              {verdict.allScored.slice(0, 6).map((r, i) => (
                <div key={r.horseId} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 w-4 text-right font-mono">{i + 1}</span>
                  <HorseNameWithSilk
                    horseName={r.entry.horse_name}
                    silkUrl={r.entry.silk_url}
                    className="text-gray-300 text-xs"
                    clickable={!!onHorseClick}
                    onHorseClick={onHorseClick}
                    horseEntry={r.entry}
                  />
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {(modelPicks.get(r.entry.horse_id) || []).map((b, j) => (
                        <ModelBadge key={j} label={b.label} color={b.color} />
                      ))}
                    </div>
                    <span className="text-gray-400 font-medium">{formatOdds(r.entry.current_odds)}</span>
                    <span className="text-green-400/70 w-12 text-right">{formatNormalized(r.normalizedEnsemble)}</span>
                    <ScoreBadge score={r.score} />
                  </div>
                </div>
              ))}
              {verdict.allScored.length > 6 && (
                <span className="text-[10px] text-gray-600 block text-center mt-1">
                  + {verdict.allScored.length - 6} more runners
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface RaceVerdictsSectionProps {
  verdicts: RaceVerdict[]
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

export function RaceVerdictsSection({ verdicts, modelPicksMap, onHorseClick }: RaceVerdictsSectionProps) {
  const strongCount = verdicts.filter(v => v.verdict === 'strong').length
  const leanCount = verdicts.filter(v => v.verdict === 'lean').length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Race by Race</h2>
          <span className="text-xs text-gray-500 ml-1">Our pick for every race</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {strongCount > 0 && (
            <span className="text-green-400">{strongCount} top {strongCount === 1 ? 'pick' : 'picks'}</span>
          )}
          {leanCount > 0 && (
            <span className="text-amber-400">{leanCount} worth a look</span>
          )}
          <span className="text-gray-600">{verdicts.length} races</span>
        </div>
      </div>

      <div className="space-y-2">
        {verdicts.map(v => (
          <RaceVerdictCard
            key={v.raceId}
            verdict={v}
            modelPicks={modelPicksMap[v.raceId] || new Map()}
            onHorseClick={onHorseClick}
          />
        ))}
      </div>
    </div>
  )
}
