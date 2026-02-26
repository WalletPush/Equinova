import React from 'react'
import { TrendingUp, TrendingDown, ArrowRight, Minus } from 'lucide-react'
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
  onHorseClick?: (entry: RaceEntry) => void
  raceEntry?: RaceEntry
}

export function MarketIntelCard({
  mover,
  isTopMlPick,
  normalizedEnsemble,
  modelBadges,
  onHorseClick,
  raceEntry,
}: MarketIntelCardProps) {
  const agreement = classifyMarketMl(mover.odds_movement, mover.odds_movement_pct, isTopMlPick)
  const mlConfig = getMarketMlConfig(agreement)
  const displayTime = formatTime(mover.off_time)
  const pct = Math.abs(mover.odds_movement_pct || 0)
  const isSteaming = mover.odds_movement === 'steaming'
  const isDrifting = mover.odds_movement === 'drifting'

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 sm:p-4">
      {/* Top row: agreement badge + race context */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${mlConfig.bg} ${mlConfig.border} ${mlConfig.color}`}>
          {mlConfig.label}
        </span>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{mover.course}</span>
          <span>{displayTime}</span>
        </div>
      </div>

      {/* Horse info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
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
  onHorseClick?: (entry: RaceEntry) => void
}

export function MarketIntelSection({ raceGroups, raceEntriesMap, modelPicksMap, onHorseClick }: MarketIntelSectionProps) {
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

  // Flatten, classify, and sort: smart money first, then agree, then market leading
  const classified = raceGroups.flatMap(group => {
    const entries = raceEntriesMap[group.movers[0]?.race_id] || []
    const modelPicks = modelPicksMap[group.movers[0]?.race_id] || new Map()

    return group.movers.map(mover => {
      const raceEntry = entries.find(e => e.horse_id === mover.horse_id)
      const isTopPick = modelPicks.has(mover.horse_id) && (modelPicks.get(mover.horse_id)?.length || 0) >= 2
      const normalizedEnsemble = raceEntry
        ? (raceEntry.ensemble_proba || 0) / entries.reduce((s, e) => s + (e.ensemble_proba || 0), 0) || 0
        : 0
      const agreement = classifyMarketMl(mover.odds_movement, mover.odds_movement_pct, isTopPick)

      return { mover, raceEntry, isTopPick, normalizedEnsemble, modelBadges: modelPicks.get(mover.horse_id) || [], agreement }
    })
  })

  const priority: Record<string, number> = { smart_money: 0, agree: 1, market_leading: 2, false_move: 3, neutral: 4 }
  classified.sort((a, b) => {
    const pa = priority[a.agreement] ?? 5
    const pb = priority[b.agreement] ?? 5
    if (pa !== pb) return pa - pb
    return Math.abs(b.mover.odds_movement_pct || 0) - Math.abs(a.mover.odds_movement_pct || 0)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Market Intelligence</h2>
          <span className="text-xs text-gray-500 ml-1">Odds movement + ML cross-reference</span>
        </div>
        <span className="text-xs text-gray-500">{totalMovers} movers across {raceGroups.length} races</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {classified.map(({ mover, raceEntry, isTopPick, normalizedEnsemble, modelBadges }) => (
          <MarketIntelCard
            key={`${mover.horse_id}-${mover.bookmaker}`}
            mover={mover}
            isTopMlPick={isTopPick}
            normalizedEnsemble={normalizedEnsemble}
            modelBadges={modelBadges}
            onHorseClick={onHorseClick}
            raceEntry={raceEntry}
          />
        ))}
      </div>
    </div>
  )
}
