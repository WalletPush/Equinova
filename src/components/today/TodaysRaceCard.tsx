import React from 'react'
import {
  Clock,
  MapPin,
  Trophy,
  Users,
  TrendingUp,
  Star,
  ChevronDown,
  Bot,
} from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ProfitableSignalBadges } from '@/components/ProfitableSignalBadges'
import { ModelBadge } from '@/components/ModelBadge'
import { MarketMovementBadge, buildMarketComment, getRaceMarketSummary } from '@/components/MarketMovement'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { normalizeField, getNormalizedColor, getNormalizedStars, formatNormalized } from '@/lib/normalize'
import { detectProfitableSignals } from '@/lib/confluenceScore'
import { getModelPicksByHorseId } from '@/lib/modelPicksByHorse'
import type { Race, RaceEntry } from '@/lib/supabase'
import type { SmartSignal, PatternAlert } from '@/types/signals'

interface TodaysRaceCardProps {
  race: Race
  isExpanded: boolean
  onToggleExpand: () => void
  openHorseDetail: (entry: any, raceContext: any, signals: any) => void
  allPatternAlerts: PatternAlert[]
  allSmartSignals: SmartSignal[]
  lifetimeSignalStats: any
  mastermindByHorse: Map<string, any>
  signalHorseIds: Set<string>
}

export function TodaysRaceCard({
  race,
  isExpanded,
  onToggleExpand,
  openHorseDetail,
  allPatternAlerts,
  allSmartSignals,
  lifetimeSignalStats,
  mastermindByHorse,
  signalHorseIds,
}: TodaysRaceCardProps) {
  const normMap = race.topEntries?.length
    ? normalizeField(race.topEntries, 'ensemble_proba', 'horse_id')
    : new Map<string, number>()

  const aiPredictions = race.topEntries?.filter(entry => entry.ensemble_proba > 0) || []
  const topPrediction = aiPredictions.length > 0 ? aiPredictions[0] : null
  const hasAI = topPrediction && topPrediction.ensemble_proba > 0

  const modelPicksMap = getModelPicksByHorseId(race.topEntries)

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }

  return (
    <div
      id={`race-${race.race_id}`}
      className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 hover:border-yellow-400/30 rounded-lg transition-all duration-200 scroll-mt-[200px]"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-2">
              <h3 className="text-lg font-semibold text-white">
                {race.course_name}
              </h3>
              <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs font-medium">
                {race.race_class}
              </span>
              <div className="flex items-center space-x-1 text-yellow-400">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{formatTime(race.off_time)}</span>
              </div>
            </div>
            
            <div className="flex items-center flex-wrap gap-3 text-sm text-gray-400">
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{race.distance}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{race.field_size}</span>
              </div>
              {race.prize && (
                <div className="flex items-center space-x-1">
                  <Trophy className="w-4 h-4" />
                  <span className="text-green-400 font-medium">£{formatPrize(race.prize)}</span>
                </div>
              )}
              {race.topEntries && (() => {
                const mkt = getRaceMarketSummary(race.topEntries)
                if (mkt.steamCount === 0 && mkt.driftCount === 0) return null
                return (
                  <div className="flex items-center gap-1.5">
                    {mkt.topSteamer && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
                        <TrendingUp className="w-3 h-3" />
                        {mkt.steamCount} backed
                      </span>
                    )}
                    {mkt.topDrifter && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                        <ChevronDown className="w-3 h-3" />
                        {mkt.driftCount} drifting
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
          
          <div className="flex-shrink-0">
            <button
              onClick={onToggleExpand}
              className={`border px-4 py-1.5 rounded-md text-sm font-medium transition-colors text-center ${
                isExpanded
                  ? 'bg-gray-700 border-yellow-500/50 text-yellow-400'
                  : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
              }`}
            >
              Runners
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {hasAI && topPrediction && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">AI Top Pick</span>
                </div>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star 
                      key={i}
                      className={`w-3 h-3 ${
                        i < getNormalizedStars(normMap.get(String(topPrediction.horse_id)) ?? 0) 
                          ? 'text-yellow-400 fill-current' 
                          : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <HorseNameWithSilk 
                    horseName={topPrediction.horse_name}
                    silkUrl={topPrediction.silk_url}
                    className="text-white font-medium"
                    showNumber={true}
                    number={topPrediction.number}
                    clickable={true}
                    onHorseClick={() => openHorseDetail(topPrediction, {
                      course_name: race.course_name,
                      off_time: race.off_time,
                      race_id: race.race_id
                    }, {
                      patternAlerts: allPatternAlerts,
                      smartSignals: allSmartSignals,
                    })}
                    horseEntry={topPrediction}
                  />
                  <div className="text-sm text-gray-400 mt-1">
                    {topPrediction.jockey_name}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold ${getNormalizedColor(normMap.get(String(topPrediction.horse_id)) ?? 0)}`}>
                    {formatNormalized(normMap.get(String(topPrediction.horse_id)) ?? 0)}
                  </div>
                  <div className="text-sm text-gray-400">
                    Win Prob
                  </div>
                </div>
              </div>
            </div>
          )}

          {race.topEntries && race.topEntries.length > 0 && (() => {
            const marketComment = buildMarketComment({
              entries: race.topEntries,
              modelPicksMap,
            })
            if (!marketComment) return null
            return (
              <div className="flex items-start gap-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2.5">
                <TrendingUp className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-cyan-300 leading-relaxed">{marketComment}</p>
              </div>
            )
          })()}

          {race.topEntries && race.topEntries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-300">All Runners</h4>
                <span className="text-[10px] text-gray-500 italic">Tap horse name to explore form</span>
              </div>
              <div className="space-y-1.5">
                {race.topEntries.map((entry) => {
                  const hasSignal = signalHorseIds.has(entry.horse_id)
                  const entryModelPicks = modelPicksMap.get(entry.horse_id) || []

                  const profSignals = lifetimeSignalStats
                    ? detectProfitableSignals(entry, race.topEntries!, entryModelPicks, undefined, lifetimeSignalStats, 'lifetime')
                    : []
                  const mmMatch = mastermindByHorse.get(`${race.race_id}:${entry.horse_id}`)
                  const mmPatterns = [...(mmMatch?.lifetime_patterns ?? []), ...(mmMatch?.d21_patterns ?? [])]
                  const hasProfSignal = profSignals.length > 0 || mmPatterns.length > 0

                  return (
                  <div key={entry.id} className={`py-2.5 px-3 rounded-lg ${
                    hasProfSignal ? 'bg-green-500/5 border border-green-500/20' :
                    hasSignal ? 'bg-yellow-500/5 border border-yellow-500/20' : 'bg-gray-700/30'
                  }`}>
                    <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="relative flex-shrink-0">
                        <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white">
                          {entry.number}
                        </div>
                        {(hasSignal || hasProfSignal) && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hasProfSignal ? 'bg-green-400' : 'bg-yellow-400'}`} />
                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasProfSignal ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <HorseNameWithSilk 
                            horseName={entry.horse_name}
                            silkUrl={entry.silk_url}
                            className="text-white text-sm font-medium"
                            clickable={true}
                            onHorseClick={() => openHorseDetail(entry, {
                              course_name: race.course_name,
                              off_time: race.off_time,
                              race_id: race.race_id
                            }, {
                              patternAlerts: allPatternAlerts,
                              smartSignals: allSmartSignals,
                            })}
                            horseEntry={entry}
                          />
                          {entryModelPicks.length > 0 && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              {entryModelPicks.map(mp => (
                                <ModelBadge
                                  key={mp.label}
                                  label={mp.label}
                                  color={mp.color}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {entry.jockey_name}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {entry.ensemble_proba > 0 && (() => {
                        const np = normMap.get(String(entry.horse_id)) ?? 0
                        const odds = Number(entry.current_odds)
                        const vs = odds > 1 ? np * odds : 0
                        return (
                          <div className="text-right">
                            <div className={`text-sm font-medium ${getNormalizedColor(np)}`}>
                              {formatNormalized(np)}
                            </div>
                            {vs > 1.05 && (
                              <div className={`text-[10px] font-bold ${
                                vs >= 1.3 ? 'text-green-400' : vs >= 1.15 ? 'text-emerald-400' : 'text-yellow-400'
                              }`}>
                                {vs.toFixed(2)}x value
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {entry.current_odds && (
                        <div className="flex items-center gap-1.5">
                          <MarketMovementBadge
                            movement={entry.odds_movement}
                            pct={entry.odds_movement_pct}
                          />
                          <div className={`text-sm font-mono font-medium ${
                            entry.odds_movement === 'steaming' ? 'text-green-400' :
                            entry.odds_movement === 'drifting' ? 'text-red-400' :
                            'text-gray-300'
                          }`}>
                            {formatOdds(entry.current_odds)}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => openHorseDetail(entry, {
                          course_name: race.course_name,
                          off_time: race.off_time,
                          race_id: race.race_id
                        }, {
                          patternAlerts: allPatternAlerts,
                          smartSignals: allSmartSignals,
                        })}
                        className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Form
                      </button>
                    </div>
                    </div>
                    {hasProfSignal && (
                      <div className="mt-1.5 ml-9">
                        <ProfitableSignalBadges signals={profSignals} mastermindPatterns={mmPatterns} compact />
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-4 pt-3 border-t border-gray-700 text-sm">
            <div className="text-gray-400">
              <span className="text-gray-300">Going:</span> {race.going}
            </div>
            <div className="text-gray-400">
              <span className="text-gray-300">Age:</span> {race.age_band}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
