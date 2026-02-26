import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Gauge, MapPin, Users, RotateCcw } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import type { SpeedStandout, TrainerHotspot, CourseDistanceSpecialist } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

interface CollapsibleAngleProps {
  title: string
  icon: React.ElementType
  iconColor: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleAngle({ title, icon: Icon, iconColor, count, children, defaultOpen = false }: CollapsibleAngleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 sm:p-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{count}</span>
        <div className="ml-auto text-gray-500">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-800 p-3 sm:p-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Speed Standouts ────────────────────────────────────────────────

interface SpeedStandoutsProps {
  standouts: SpeedStandout[]
  raceMap: Record<string, { course_name: string; off_time: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

function SpeedStandoutsList({ standouts, raceMap, modelPicksMap, onHorseClick }: SpeedStandoutsProps) {
  if (standouts.length === 0) {
    return <p className="text-xs text-gray-500">No speed figure standouts found in today's races.</p>
  }

  return (
    <div className="space-y-2">
      {standouts.slice(0, 8).map((s, i) => {
        const race = raceMap[s.raceId] || { course_name: '', off_time: '' }
        const badges = modelPicksMap[s.raceId]?.get(s.entry.horse_id) || []
        return (
          <div key={`${s.entry.horse_id}-${i}`} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <HorseNameWithSilk
                  horseName={s.entry.horse_name}
                  silkUrl={s.entry.silk_url}
                  className="text-white font-medium text-sm"
                  clickable={!!onHorseClick}
                  onHorseClick={onHorseClick}
                  horseEntry={s.entry}
                />
                <div className="flex gap-0.5">
                  {badges.map((b, j) => (
                    <ModelBadge key={j} label={b.label} color={b.color} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{race.course_name} {formatTime(race.off_time)}</span>
                <span>·</span>
                <span>{s.figureType}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <span className="text-sm font-bold text-orange-400 block">{s.bestFigure.toFixed(0)}</span>
                <span className="text-[10px] text-gray-500">vs {s.fieldAvg.toFixed(0)} avg</span>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold ${s.advantage >= 15 ? 'text-green-400' : 'text-amber-400'}`}>
                  +{s.advantage.toFixed(0)}%
                </span>
              </div>
              <span className="text-xs font-medium text-white bg-gray-800 px-1.5 py-0.5 rounded">
                {formatOdds(s.entry.current_odds)}
              </span>
              <ShortlistButton
                horseName={s.entry.horse_name}
                raceContext={{ race_id: s.raceId, course_name: race.course_name, off_time: race.off_time }}
                odds={formatOdds(s.entry.current_odds)}
                jockeyName={s.entry.jockey_name}
                trainerName={s.entry.trainer_name}
                size="small"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Course & Distance Specialists ──────────────────────────────────

interface SpecialistsProps {
  specialists: CourseDistanceSpecialist[]
  raceMap: Record<string, { course_name: string; off_time: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

function SpecialistsList({ specialists, raceMap, modelPicksMap, onHorseClick }: SpecialistsProps) {
  if (specialists.length === 0) {
    return <p className="text-xs text-gray-500">No course/distance specialists found in today's races.</p>
  }

  return (
    <div className="space-y-2">
      {specialists.slice(0, 8).map((s, i) => {
        const race = raceMap[s.raceId] || { course_name: '', off_time: '' }
        const badges = modelPicksMap[s.raceId]?.get(s.entry.horse_id) || []
        return (
          <div key={`${s.entry.horse_id}-${i}`} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <HorseNameWithSilk
                  horseName={s.entry.horse_name}
                  silkUrl={s.entry.silk_url}
                  className="text-white font-medium text-sm"
                  clickable={!!onHorseClick}
                  onHorseClick={onHorseClick}
                  horseEntry={s.entry}
                />
                <div className="flex gap-0.5">
                  {badges.map((b, j) => (
                    <ModelBadge key={j} label={b.label} color={b.color} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{race.course_name} {formatTime(race.off_time)}</span>
                <span>·</span>
                <span>J: {s.entry.jockey_name} · T: {s.entry.trainer_name}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <span className="text-xs text-purple-400 font-medium">{s.horseWinPctAtDistance.toFixed(0)}% at dist</span>
              </div>
              {s.trainerWinPctAtCourse > 0 && (
                <div className="text-right">
                  <span className="text-xs text-blue-400">{s.trainerWinPctAtCourse.toFixed(0)}% T@C</span>
                </div>
              )}
              <span className="text-xs font-medium text-white bg-gray-800 px-1.5 py-0.5 rounded">
                {formatOdds(s.entry.current_odds)}
              </span>
              <ShortlistButton
                horseName={s.entry.horse_name}
                raceContext={{ race_id: s.raceId, course_name: race.course_name, off_time: race.off_time }}
                odds={formatOdds(s.entry.current_odds)}
                jockeyName={s.entry.jockey_name}
                trainerName={s.entry.trainer_name}
                size="small"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Trainer Hotspots ───────────────────────────────────────────────

interface TrainerHotspotsProps {
  hotspots: TrainerHotspot[]
  raceMap: Record<string, { course_name: string; off_time: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

function TrainerHotspotsList({ hotspots, raceMap, modelPicksMap, onHorseClick }: TrainerHotspotsProps) {
  if (hotspots.length === 0) {
    return <p className="text-xs text-gray-500">No trainer hotspots found in today's races.</p>
  }

  return (
    <div className="space-y-2">
      {hotspots.slice(0, 8).map((h, i) => {
        const race = raceMap[h.raceId] || { course_name: '', off_time: '' }
        const badges = modelPicksMap[h.raceId]?.get(h.entry.horse_id) || []
        return (
          <div key={`${h.entry.horse_id}-${i}`} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <HorseNameWithSilk
                  horseName={h.entry.horse_name}
                  silkUrl={h.entry.silk_url}
                  className="text-white font-medium text-sm"
                  clickable={!!onHorseClick}
                  onHorseClick={onHorseClick}
                  horseEntry={h.entry}
                />
                {h.isSingleRunner && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    SINGLE ENTRY
                  </span>
                )}
                <div className="flex gap-0.5">
                  {badges.map((b, j) => (
                    <ModelBadge key={j} label={b.label} color={b.color} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{race.course_name} {formatTime(race.off_time)}</span>
                <span>·</span>
                <span>T: {h.entry.trainer_name}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {h.courseWinPct > 0 && (
                <div className="text-right">
                  <span className="text-xs text-green-400 font-medium">{h.courseWinPct.toFixed(0)}% at course</span>
                </div>
              )}
              {h.trainer21DayPct > 0 && (
                <div className="text-right">
                  <span className="text-xs text-blue-400">{h.trainer21DayPct.toFixed(0)}% 21d</span>
                </div>
              )}
              <span className="text-xs font-medium text-white bg-gray-800 px-1.5 py-0.5 rounded">
                {formatOdds(h.entry.current_odds)}
              </span>
              <ShortlistButton
                horseName={h.entry.horse_name}
                raceContext={{ race_id: h.raceId, course_name: race.course_name, off_time: race.off_time }}
                odds={formatOdds(h.entry.current_odds)}
                jockeyName={h.entry.jockey_name}
                trainerName={h.entry.trainer_name}
                size="small"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Returning Improvers ────────────────────────────────────────────

interface ReturningImprover {
  entry: RaceEntry
  raceId: string
  lastSpeedFig: number
  bestSpeedFig: number
  lastRunDays: number
  improving: boolean
}

export function findReturningImprovers(allEntries: RaceEntry[]): ReturningImprover[] {
  const improvers: ReturningImprover[] = []

  for (const entry of allEntries) {
    const lastFig = entry.last_speed_figure || 0
    const bestFig = entry.best_speed_figure_at_distance || 0
    const lastRun = entry.last_run || 0

    if (lastFig <= 0 || bestFig <= 0) continue

    // Recent speed figure is within 10% of personal best AND coming off 14-60 day layoff
    const ratio = lastFig / bestFig
    if (ratio >= 0.90 && lastRun >= 14 && lastRun <= 60) {
      improvers.push({
        entry,
        raceId: entry.race_id,
        lastSpeedFig: lastFig,
        bestSpeedFig: bestFig,
        lastRunDays: lastRun,
        improving: ratio >= 0.95,
      })
    }
  }

  return improvers.sort((a, b) => {
    const aRatio = a.lastSpeedFig / a.bestSpeedFig
    const bRatio = b.lastSpeedFig / b.bestSpeedFig
    return bRatio - aRatio
  })
}

interface ReturningImproversProps {
  improvers: ReturningImprover[]
  raceMap: Record<string, { course_name: string; off_time: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

function ReturningImproversList({ improvers, raceMap, modelPicksMap, onHorseClick }: ReturningImproversProps) {
  if (improvers.length === 0) {
    return <p className="text-xs text-gray-500">No returning improvers found in today's races.</p>
  }

  return (
    <div className="space-y-2">
      {improvers.slice(0, 8).map((imp, i) => {
        const race = raceMap[imp.raceId] || { course_name: '', off_time: '' }
        const badges = modelPicksMap[imp.raceId]?.get(imp.entry.horse_id) || []
        const ratio = ((imp.lastSpeedFig / imp.bestSpeedFig) * 100).toFixed(0)
        return (
          <div key={`${imp.entry.horse_id}-${i}`} className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <HorseNameWithSilk
                  horseName={imp.entry.horse_name}
                  silkUrl={imp.entry.silk_url}
                  className="text-white font-medium text-sm"
                  clickable={!!onHorseClick}
                  onHorseClick={onHorseClick}
                  horseEntry={imp.entry}
                />
                {imp.improving && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-green-500/15 text-green-400 border-green-500/30">
                    NEAR PEAK
                  </span>
                )}
                <div className="flex gap-0.5">
                  {badges.map((b, j) => (
                    <ModelBadge key={j} label={b.label} color={b.color} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span>{race.course_name} {formatTime(race.off_time)}</span>
                <span>·</span>
                <span>{imp.lastRunDays} days since last run</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <span className="text-xs text-orange-400 font-medium">
                  {imp.lastSpeedFig.toFixed(0)} / {imp.bestSpeedFig.toFixed(0)}
                </span>
                <span className="text-[10px] text-gray-500 block">{ratio}% of best</span>
              </div>
              <span className="text-xs font-medium text-white bg-gray-800 px-1.5 py-0.5 rounded">
                {formatOdds(imp.entry.current_odds)}
              </span>
              <ShortlistButton
                horseName={imp.entry.horse_name}
                raceContext={{ race_id: imp.raceId, course_name: race.course_name, off_time: race.off_time }}
                odds={formatOdds(imp.entry.current_odds)}
                jockeyName={imp.entry.jockey_name}
                trainerName={imp.entry.trainer_name}
                size="small"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main DataAngles Section ────────────────────────────────────────

interface DataAnglesSectionProps {
  speedStandouts: SpeedStandout[]
  specialists: CourseDistanceSpecialist[]
  trainerHotspots: TrainerHotspot[]
  returningImprovers: ReturningImprover[]
  raceMap: Record<string, { course_name: string; off_time: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

export function DataAnglesSection({
  speedStandouts,
  specialists,
  trainerHotspots,
  returningImprovers,
  raceMap,
  modelPicksMap,
  onHorseClick,
}: DataAnglesSectionProps) {
  const totalAngles = speedStandouts.length + specialists.length + trainerHotspots.length + returningImprovers.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-bold text-white">Data Angles</h2>
          <span className="text-xs text-gray-500 ml-1">Statistical edges from the data</span>
        </div>
        <span className="text-xs text-gray-500">{totalAngles} angles found</span>
      </div>

      <div className="space-y-2">
        <CollapsibleAngle
          title="Speed Figure Standouts"
          icon={Gauge}
          iconColor="text-orange-400"
          count={speedStandouts.length}
          defaultOpen={speedStandouts.length > 0 && speedStandouts.length <= 5}
        >
          <SpeedStandoutsList
            standouts={speedStandouts}
            raceMap={raceMap}
            modelPicksMap={modelPicksMap}
            onHorseClick={onHorseClick}
          />
        </CollapsibleAngle>

        <CollapsibleAngle
          title="Course & Distance Specialists"
          icon={MapPin}
          iconColor="text-purple-400"
          count={specialists.length}
        >
          <SpecialistsList
            specialists={specialists}
            raceMap={raceMap}
            modelPicksMap={modelPicksMap}
            onHorseClick={onHorseClick}
          />
        </CollapsibleAngle>

        <CollapsibleAngle
          title="Trainer Hotspots"
          icon={Users}
          iconColor="text-green-400"
          count={trainerHotspots.length}
        >
          <TrainerHotspotsList
            hotspots={trainerHotspots}
            raceMap={raceMap}
            modelPicksMap={modelPicksMap}
            onHorseClick={onHorseClick}
          />
        </CollapsibleAngle>

        <CollapsibleAngle
          title="Returning Improvers"
          icon={RotateCcw}
          iconColor="text-blue-400"
          count={returningImprovers.length}
        >
          <ReturningImproversList
            improvers={returningImprovers}
            raceMap={raceMap}
            modelPicksMap={modelPicksMap}
            onHorseClick={onHorseClick}
          />
        </CollapsibleAngle>
      </div>
    </div>
  )
}
