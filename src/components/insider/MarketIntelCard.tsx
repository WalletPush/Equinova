import React from 'react'
import { TrendingUp, TrendingDown, ArrowRight, Minus, MapPin } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { formatNormalized } from '@/lib/normalize'
import { classifyMarketMl, getMarketMlConfig } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

interface MarketMover {
  horse_id: string
  race_id: string
  horse_name: string
  course: string
  off_time: string
  jockey_name: string | null
  trainer_name: string | null
  silk_url: string | null
  bookmaker: string
  initial_odds: string
  current_odds: string
  decimal_odds: number
  odds_movement: string
  odds_movement_pct: number
  last_updated: string
  total_movements?: number
}

interface MarketIntelCardProps {
  mover: MarketMover
  isTopMlPick: boolean
  normalizedEnsemble: number
  modelBadges: { label: string; color: string }[]
  equinovaScore: number | null
  onHorseClick?: (entry: RaceEntry) => void
  raceEntry?: RaceEntry
}

function getScoreComment(score: number, isTopPick: boolean, pct: number): string {
  if (score >= 65 && isTopPick) return 'AI rates highly & market agrees — standout'
  if (score >= 65) return 'AI rates this horse very highly'
  if (score >= 45 && isTopPick) return 'AI models like this one, market backing it too'
  if (score >= 45) return 'Above average — some positive signals'
  if (isTopPick) return 'AI models rate it but score is mixed'
  if (pct >= 15) return 'Big market move but AI is less convinced'
  if (pct >= 8) return 'Notable odds movement, worth monitoring'
  return 'Minor market interest'
}

function MoverScoreBadge({ score }: { score: number }) {
  const color = score >= 65 ? 'text-green-400 border-green-500/40 bg-green-500/10'
    : score >= 45 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
    : 'text-red-400 border-red-500/40 bg-red-500/10'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-lg font-bold px-2.5 py-0.5 rounded border ${color} tabular-nums leading-tight`}>{score}</span>
      <span className="text-[8px] text-gray-500 uppercase tracking-wider">Equinova</span>
    </div>
  )
}

export function MarketIntelCard({
  mover,
  isTopMlPick,
  normalizedEnsemble,
  modelBadges,
  equinovaScore,
  onHorseClick,
  raceEntry,
}: MarketIntelCardProps) {
  const agreement = classifyMarketMl(mover.odds_movement, mover.odds_movement_pct, isTopMlPick)
  const mlConfig = getMarketMlConfig(agreement)
  const pct = Math.abs(mover.odds_movement_pct || 0)
  const isSteaming = mover.odds_movement === 'steaming'
  const isDrifting = mover.odds_movement === 'drifting'
  const comment = equinovaScore != null ? getScoreComment(equinovaScore, isTopMlPick, pct) : null

  return (
    <div className="p-3 sm:p-4">
      {/* Top row: badge + score */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          {/* Agreement badge */}
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${mlConfig.bg} ${mlConfig.border} ${mlConfig.color}`}>
            {mlConfig.label}
          </span>

          {/* Horse info */}
          <div className="mt-2">
            <HorseNameWithSilk
              horseName={mover.horse_name}
              silkUrl={mover.silk_url || undefined}
              className="text-white font-medium text-sm"
              clickable={!!onHorseClick && !!raceEntry}
              onHorseClick={onHorseClick}
              horseEntry={raceEntry}
            />
            <div className="text-[11px] text-gray-500 mt-0.5">
              {mover.jockey_name && <span>J: {mover.jockey_name}</span>}
              {mover.jockey_name && mover.trainer_name && <span> · </span>}
              {mover.trainer_name && <span>T: {mover.trainer_name}</span>}
            </div>
          </div>
        </div>

        {/* Equinova Score - prominent on the right */}
        {equinovaScore != null && (
          <div className="flex-shrink-0 ml-3">
            <MoverScoreBadge score={equinovaScore} />
          </div>
        )}
      </div>

      {/* AI Comment */}
      {comment && (
        <p className="text-[11px] text-gray-400 italic mb-2 pl-0.5">{comment}</p>
      )}

      {/* Odds movement visual */}
      <div className="flex items-center gap-3 mb-2 bg-gray-800/50 rounded-lg px-3 py-2">
        <div className="text-center">
          <span className="text-[10px] text-gray-500 block">Open</span>
          <span className="text-sm font-medium text-gray-400">{mover.initial_odds}</span>
        </div>

        <div className="flex items-center gap-1 flex-1 justify-center">
          {isSteaming ? (
            <TrendingUp className="w-4 h-4 text-green-400" />
          ) : isDrifting ? (
            <TrendingDown className="w-4 h-4 text-red-400" />
          ) : (
            <Minus className="w-4 h-4 text-gray-500" />
          )}
          <ArrowRight className="w-3 h-3 text-gray-600" />
          <span className={`text-xs font-bold ${isSteaming ? 'text-green-400' : isDrifting ? 'text-red-400' : 'text-gray-400'}`}>
            {pct.toFixed(1)}%
          </span>
        </div>

        <div className="text-center">
          <span className="text-[10px] text-gray-500 block">Now</span>
          <span className={`text-sm font-bold ${isSteaming ? 'text-green-400' : isDrifting ? 'text-red-400' : 'text-white'}`}>
            {formatOdds(mover.decimal_odds)}
          </span>
        </div>
      </div>

      {/* ML data + badges row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {modelBadges.map((b, i) => (
              <ModelBadge key={i} label={b.label} color={b.color} showCheck />
            ))}
          </div>
          {normalizedEnsemble > 0 && (
            <span className="text-xs text-green-400/80">{formatNormalized(normalizedEnsemble)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">{mover.bookmaker}</span>
          {mover.total_movements && mover.total_movements > 1 && (
            <span className="text-[10px] text-gray-600">{mover.total_movements} moves</span>
          )}
          {raceEntry && (
            <ShortlistButton
              horseName={mover.horse_name}
              raceContext={{ race_id: mover.race_id, course_name: mover.course, off_time: mover.off_time }}
              odds={formatOdds(mover.decimal_odds)}
              jockeyName={mover.jockey_name || undefined}
              trainerName={mover.trainer_name || undefined}
              size="small"
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface MarketIntelRaceGroup {
  race_id: string
  course_name: string
  off_time: string
  movers: MarketMover[]
}

interface MarketIntelSectionProps {
  raceGroups: MarketIntelRaceGroup[]
  raceEntriesMap: Record<string, RaceEntry[]>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  equinovaScoreMap: Record<string, number>
  onHorseClick?: (entry: RaceEntry) => void
}

export function MarketIntelSection({ raceGroups, raceEntriesMap, modelPicksMap, equinovaScoreMap, onHorseClick }: MarketIntelSectionProps) {
  const totalMovers = raceGroups.reduce((sum, g) => sum + g.movers.length, 0)

  if (totalMovers === 0) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center">
        <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-400 mb-1">No Significant Market Moves</h3>
        <p className="text-sm text-gray-500">Markets are quiet. Check back closer to race time for movement signals.</p>
      </div>
    )
  }

  // Build classified movers grouped by race, sorted by Equinova Score
  const classifiedByRace = raceGroups.map(group => {
    const movers = group.movers.map(mover => {
      const entries = raceEntriesMap[mover.race_id] || []
      const modelPicks = modelPicksMap[mover.race_id] || new Map()
      const raceEntry = entries.find(e => e.horse_id === mover.horse_id)
      const isTopPick = modelPicks.has(mover.horse_id) && (modelPicks.get(mover.horse_id)?.length || 0) >= 2
      const normalizedEnsemble = raceEntry
        ? (raceEntry.ensemble_proba || 0) / entries.reduce((s, e) => s + (e.ensemble_proba || 0), 0) || 0
        : 0
      const equinovaScore = equinovaScoreMap[mover.horse_id] ?? null

      const enrichedMover = {
        ...mover,
        horse_name: (mover.horse_name && mover.horse_name !== 'Unknown') ? mover.horse_name : raceEntry?.horse_name || mover.horse_name,
        silk_url: mover.silk_url || raceEntry?.silk_url || null,
        jockey_name: mover.jockey_name || raceEntry?.jockey_name || null,
        trainer_name: mover.trainer_name || raceEntry?.trainer_name || null,
      }

      return { mover: enrichedMover, raceEntry, isTopPick, normalizedEnsemble, modelBadges: modelPicks.get(mover.horse_id) || [], equinovaScore }
    })

    movers.sort((a, b) => (b.equinovaScore ?? 0) - (a.equinovaScore ?? 0))

    return { group, movers }
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Market Movers</h2>
          <span className="text-xs text-gray-500 ml-1">Horses with shortening odds, ranked by Equinova Score</span>
        </div>
        <span className="text-xs text-gray-500">{totalMovers} movers across {raceGroups.length} races</span>
      </div>

      <div className="space-y-3">
        {classifiedByRace.map(({ group, movers }) => (
          <div key={`${group.course_name}_${group.off_time}`} className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
            {/* Race header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-gray-800/40 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-sm font-medium text-white">{group.course_name}</span>
                <span className="text-xs text-gray-500">{formatTime(group.off_time)}</span>
              </div>
              <span className="text-[10px] text-gray-500">{movers.length} {movers.length === 1 ? 'mover' : 'movers'}</span>
            </div>

            {/* Movers within this race */}
            <div className="divide-y divide-gray-800/60">
              {movers.map(({ mover, raceEntry, isTopPick, normalizedEnsemble, modelBadges, equinovaScore }) => (
                <MarketIntelCard
                  key={`${mover.horse_id}-${mover.bookmaker}`}
                  mover={mover}
                  isTopMlPick={isTopPick}
                  normalizedEnsemble={normalizedEnsemble}
                  modelBadges={modelBadges}
                  equinovaScore={equinovaScore}
                  onHorseClick={onHorseClick}
                  raceEntry={raceEntry}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
