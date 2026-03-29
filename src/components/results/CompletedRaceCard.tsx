import React from 'react'
import { Link } from 'react-router-dom'
import type { HistoricalSignalStats } from '@/lib/confluenceScore'
import { detectProfitableSignals, type ProfitableSignal } from '@/lib/confluenceScore'
import { ModelBadge } from '@/components/ModelBadge'
import { ProfitableSignalBadges } from '@/components/ProfitableSignalBadges'
import { bareHorseName, positionBadge, parseNonFinishOutcome } from '@/lib/raceRunnerUtils'
import { getModelPicksMap, getMlPredictedWinner } from '@/lib/modelPicksMap'
import { formatTime } from '@/lib/dateUtils'
import type { ResultsRace } from './types'
import {
  Clock,
  MapPin,
  Users,
  Trophy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface Props {
  race: ResultsRace
  isExpanded: boolean
  onToggleExpand: () => void
  lifetimeSignalStats: Record<string, HistoricalSignalStats> | undefined
}

export function CompletedRaceCard({ race, isExpanded, onToggleExpand, lifetimeSignalStats }: Props) {
  const runners = (race.runners || []).slice().sort((a, b) => {
    if (a.position == null && b.position == null) return 0
    if (a.position == null) return 1
    if (b.position == null) return -1
    return a.position - b.position
  })
  const top3 = runners.filter(r => r.position != null && r.position <= 3)
  const rest = runners.filter(r => r.position == null || r.position > 3)
  const mlPick = getMlPredictedWinner(race)
  const winner = runners.find(r => r.position === 1)
  const modelPicksMapData = getModelPicksMap(race.topEntries, race.runners)

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl">
      <Link to={`/race/${race.race_id}`} className="block p-4 hover:bg-gray-800/90 transition-colors">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-1">
              <h3 className="text-base font-semibold text-white">{race.course_name}</h3>
              <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-medium">{race.race_class}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTime(race.off_time)}</span>
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{race.distance}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{race.field_size} ran</span>
              {race.prize && <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />&pound;{race.prize.replace(/[£,]/g, '')}</span>}
              <span className="text-gray-500">Going: {race.going}</span>
            </div>
          </div>
          <span className="text-xs bg-green-500/15 text-green-400 px-2 py-1 rounded font-medium">Result</span>
        </div>
      </Link>

      <div className="px-4 pb-2 space-y-1.5">
        {top3.map(runner => {
          const badge = positionBadge(runner.position)
          const bn = bareHorseName(runner.horse)
          const modelPicks = modelPicksMapData.get(bn) || []

          let runnerSignals: ProfitableSignal[] = []
          if (lifetimeSignalStats && race.topEntries) {
            const entry = race.topEntries.find(e => bareHorseName(e.horse_name) === bn)
            if (entry) {
              const badges = modelPicksMapData.get(bn) || []
              runnerSignals = detectProfitableSignals(entry, race.topEntries, badges, undefined, lifetimeSignalStats, 'lifetime')
            }
          }

          return (
            <div key={runner.id} className="py-1.5 px-3 bg-gray-700/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${badge.bg} ${badge.text}`}>
                    {runner.position}
                  </div>
                  {runner.number > 0 && (
                    <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                      {runner.number}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">{runner.horse}</span>
                      {modelPicks.length > 0 && (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          {modelPicks.map(mp => (
                            <ModelBadge
                              key={mp.label}
                              label={mp.label}
                              color={mp.color}
                              showCheck={runner.position === 1}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4 text-right flex-shrink-0">
                  {runner.btn != null && runner.position !== 1 && (
                    <span className="text-xs text-gray-400">{runner.btn} len</span>
                  )}
                  {runner.sp && (
                    <span className="text-sm text-gray-200 font-mono min-w-[48px] text-right">{runner.sp}</span>
                  )}
                </div>
              </div>
              {runnerSignals.length > 0 && (
                <div className="mt-1 ml-10">
                  <ProfitableSignalBadges signals={runnerSignals} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {race.topEntries && race.topEntries.length > 0 && (() => {
        const winnerBn = winner ? bareHorseName(winner.horse) : null
        const winnerModels = winnerBn ? (modelPicksMapData.get(winnerBn) || []) : []
        const anyModelCorrect = winnerModels.length > 0

        if (!anyModelCorrect && mlPick) {
          const matched = runners.find(r => bareHorseName(r.horse) === bareHorseName(mlPick.horse_name))
          const pos = matched?.position
          const outcome = pos
            ? `Finished: ${pos}${pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}`
            : parseNonFinishOutcome(matched)
          return (
            <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg text-xs bg-gray-700/40 text-gray-400">
              <span className="font-medium">No model predicted the winner</span>
              <span className="ml-1">— Ensemble pick {mlPick.horse_name} {outcome}</span>
            </div>
          )
        }

        if (anyModelCorrect) {
          return (
            <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg text-xs bg-green-500/10 border border-green-500/20 text-green-400">
              <span className="font-medium">
                {winnerModels.length === 5 ? 'All models' : winnerModels.map(m => m.label).join(', ')}
              </span>
              {' '}predicted the winner {winner!.horse}
              {winner!.sp && <span className="text-gray-500 ml-1">({winner!.sp})</span>}
              <span className="ml-1 font-semibold">✓</span>
            </div>
          )
        }

        return null
      })()}

      {rest.length > 0 && (
        <button
          onClick={onToggleExpand}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700/50 transition-colors"
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {isExpanded ? 'Hide full order' : `Show all ${runners.length} finishers`}
        </button>
      )}

      {isExpanded && rest.length > 0 && (
        <div className="px-4 pb-3 space-y-1 border-t border-gray-700/50 pt-2">
          {rest.map(runner => {
            const badge = positionBadge(runner.position)
            return (
              <div key={runner.id} className="flex items-center justify-between py-1 px-3 bg-gray-700/20 rounded">
                <div className="flex items-center space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                    {runner.position ?? '-'}
                  </div>
                  {runner.number > 0 && (
                    <span className="text-xs text-gray-500 w-5 text-center">{runner.number}</span>
                  )}
                  <span className="text-gray-300 text-sm">{runner.horse}</span>
                </div>
                <div className="flex items-center space-x-4 text-right">
                  {runner.ovr_btn != null && (
                    <span className="text-xs text-gray-500">{runner.ovr_btn} btn</span>
                  )}
                  {runner.sp && (
                    <span className="text-xs text-gray-400 font-mono">{runner.sp}</span>
                  )}
                </div>
              </div>
            )
          })}
          {runners[0]?.time && (
            <div className="text-xs text-gray-500 text-center mt-2">
              Winning time: {runners[0].time}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
