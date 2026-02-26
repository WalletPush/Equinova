import React, { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, Clock, Users, Trophy, AlertTriangle, Shield } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { formatNormalized } from '@/lib/normalize'
import { getVerdictConfig } from '@/lib/confluenceScore'
import type { RaceVerdict, ConfluenceResult } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

interface RaceVerdictCardProps {
  verdict: RaceVerdict
  modelPicks: Map<string, { label: string; color: string }[]>
  onHorseClick?: (entry: RaceEntry) => void
}

function CompactHorse({
  result,
  label,
  badges,
  onHorseClick,
}: {
  result: ConfluenceResult
  label: string
  badges: { label: string; color: string }[]
  onHorseClick?: (entry: RaceEntry) => void
}) {
  const { entry, score, normalizedEnsemble } = result
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider w-14 flex-shrink-0">{label}</span>
      <HorseNameWithSilk
        horseName={entry.horse_name}
        silkUrl={entry.silk_url}
        className="text-white font-medium text-sm"
        clickable={!!onHorseClick}
        onHorseClick={onHorseClick}
        horseEntry={entry}
      />
      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        <div className="flex items-center gap-1">
          {badges.map((b, i) => (
            <ModelBadge key={i} label={b.label} color={b.color} showCheck />
          ))}
        </div>
        <span className="text-xs font-bold text-white bg-gray-800 px-1.5 py-0.5 rounded">
          {formatOdds(entry.current_odds)}
        </span>
        <span className="text-xs text-green-400">{formatNormalized(normalizedEnsemble)}</span>
        <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{score}</span>
      </div>
    </div>
  )
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
    <div className={`bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden transition-all duration-200 ${
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
            <span className="text-xs text-gray-400 truncate max-w-[120px]">{verdict.topSelection.entry.horse_name}</span>
            <span className="text-xs font-bold text-white">{formatOdds(verdict.topSelection.entry.current_odds)}</span>
            <span className="text-xs text-gray-500 font-mono">{verdict.topSelection.score}</span>
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
          {verdict.topSelection && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              <CompactHorse
                result={verdict.topSelection}
                label="Pick"
                badges={modelPicks.get(verdict.topSelection.entry.horse_id) || []}
                onHorseClick={onHorseClick}
              />
              <div className="flex items-center gap-2 ml-14">
                <span className="text-[11px] text-gray-400">
                  J: {verdict.topSelection.entry.jockey_name} · T: {verdict.topSelection.entry.trainer_name}
                </span>
              </div>
              <div className="ml-14">
                <ShortlistButton
                  horseName={verdict.topSelection.entry.horse_name}
                  raceContext={{ race_id: verdict.raceId, course_name: verdict.courseName, off_time: verdict.offTime }}
                  odds={formatOdds(verdict.topSelection.entry.current_odds)}
                  jockeyName={verdict.topSelection.entry.jockey_name}
                  trainerName={verdict.topSelection.entry.trainer_name}
                  size="small"
                />
              </div>
            </div>
          )}

          {/* Danger horse */}
          {verdict.dangerHorse && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-[11px] text-amber-400 font-medium">Danger: </span>
                <span className="text-[11px] text-gray-300">
                  {verdict.dangerHorse.entry.horse_name} ({formatOdds(verdict.dangerHorse.entry.current_odds)}, score {verdict.dangerHorse.score})
                </span>
              </div>
            </div>
          )}

          {/* Rest of field */}
          {verdict.allScored.length > 2 && (
            <div className="space-y-1.5 pt-2 border-t border-gray-800">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Full Rankings</span>
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
                    <span className="text-gray-600 font-mono w-6 text-right">{r.score}</span>
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
          <h2 className="text-lg font-bold text-white">Race Verdicts</h2>
          <span className="text-xs text-gray-500 ml-1">Every race, one verdict</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {strongCount > 0 && (
            <span className="text-green-400">{strongCount} strong</span>
          )}
          {leanCount > 0 && (
            <span className="text-amber-400">{leanCount} lean</span>
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
