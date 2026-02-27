import React, { useState } from 'react'
import { TrendingUp, TrendingDown, ArrowRight, Minus, MapPin, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { MarketMovementBadge } from '@/components/MarketMovement'
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

function getScoreComment(score: number, isTopPick: boolean, pct: number, modelCount: number): string {
  if (score >= 50 && isTopPick) return 'AI rates highly & market agrees — standout'
  if (score >= 50) return 'AI rates this horse very highly'
  if (score >= 35 && isTopPick) return 'AI models like this one, market is backing it too'
  if (score >= 35) return 'Above average — some positive signals'
  if (isTopPick) return 'AI models rate it but overall score is mixed'
  if (modelCount === 0 && pct >= 15) return 'Heavy money coming but NO AI models pick this horse — the market knows something or it\'s hype'
  if (modelCount === 0 && pct >= 8) return 'Being backed but none of our AI models pick this horse — proceed with caution'
  if (pct >= 15) return 'Big market move but AI is less convinced'
  if (pct >= 8) return 'Notable odds movement, worth monitoring'
  return 'Minor market interest'
}

function MoverScoreBadge({ score }: { score: number }) {
  const color = score >= 50 ? 'text-green-400 border-green-500/40 bg-green-500/10'
    : score >= 35 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
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
  const comment = equinovaScore != null ? getScoreComment(equinovaScore, isTopMlPick, pct, modelBadges.length) : null
  const isNonMlBacked = modelBadges.length === 0 && isSteaming && pct >= 8

  return (
    <div className="p-3 sm:p-4">
      {/* Warning banner for non-ML horses being backed */}
      {isNonMlBacked && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 mb-2.5 ${
          pct >= 15
            ? 'bg-orange-500/15 border border-orange-500/30'
            : 'bg-amber-500/10 border border-amber-500/20'
        }`}>
          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${pct >= 15 ? 'text-orange-400' : 'text-amber-400'}`} />
          <p className={`text-[11px] leading-relaxed ${pct >= 15 ? 'text-orange-300' : 'text-amber-300'}`}>
            {pct >= 15
              ? `Heavily backed (${pct.toFixed(0)}% in) but not picked by any AI model. The market sees something our models don't — or this is hype. Worth investigating.`
              : `Being backed (${pct.toFixed(0)}% in) but not an AI pick. Market interest without AI support — keep an eye on it.`
            }
          </p>
        </div>
      )}

      {/* Top row: badge + movement pill + score */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          {/* Agreement badge + movement badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${mlConfig.bg} ${mlConfig.border} ${mlConfig.color}`}>
              {mlConfig.label}
            </span>
            <MarketMovementBadge movement={mover.odds_movement} pct={mover.odds_movement_pct} size="md" />
          </div>

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
        <p className={`text-[11px] italic mb-2 pl-0.5 ${isNonMlBacked ? 'text-amber-400/80' : 'text-gray-400'}`}>{comment}</p>
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
          {modelBadges.length > 0 ? (
            <>
              <div className="flex items-center gap-1">
                {modelBadges.map((b, i) => (
                  <ModelBadge key={i} label={b.label} color={b.color} showCheck />
                ))}
              </div>
              {normalizedEnsemble > 0 && (
                <span className="text-xs text-green-400/80">{formatNormalized(normalizedEnsemble)}</span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-gray-600 italic">No AI models pick this horse</span>
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

// ─── Collapsible race group ─────────────────────────────────────────

interface CollapsibleRaceGroupProps {
  courseName: string
  offTime: string
  moverCount: number
  hasWarning: boolean
  topMoverName?: string
  topMoverPct?: number
  children: React.ReactNode
}

function CollapsibleRaceGroup({ courseName, offTime, moverCount, hasWarning, topMoverName, topMoverPct, children }: CollapsibleRaceGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 bg-gray-800/40 text-left hover:bg-gray-800/60 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-sm font-medium text-white">{courseName}</span>
          <span className="text-xs text-gray-500">{formatTime(offTime)}</span>
          {hasWarning && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="w-2.5 h-2.5" />
              Non-AI backed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!open && topMoverName && (
            <span className="text-[10px] text-gray-500 truncate max-w-[120px] hidden sm:inline">{topMoverName}</span>
          )}
          <span className="text-[10px] text-gray-500">{moverCount} {moverCount === 1 ? 'mover' : 'movers'}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800">
          {children}
        </div>
      )}
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
        {classifiedByRace.map(({ group, movers }) => {
          const hasWarning = movers.some(m => m.modelBadges.length === 0 && Math.abs(m.mover.odds_movement_pct || 0) >= 8 && m.mover.odds_movement === 'steaming')
          return (
            <CollapsibleRaceGroup
              key={`${group.course_name}_${group.off_time}`}
              courseName={group.course_name}
              offTime={group.off_time}
              moverCount={movers.length}
              hasWarning={hasWarning}
              topMoverName={movers[0]?.mover.horse_name}
              topMoverPct={Math.abs(movers[0]?.mover.odds_movement_pct || 0)}
            >
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
            </CollapsibleRaceGroup>
          )
        })}
      </div>
    </div>
  )
}
