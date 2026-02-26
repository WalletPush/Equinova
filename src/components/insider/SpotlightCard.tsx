import React from 'react'
import { Zap, TrendingUp, Brain, Timer, Target, Users } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge, MODEL_DEFS } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { formatNormalized } from '@/lib/normalize'
import type { ConfluenceResult, SignalBreakdown } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

interface SpotlightCardProps {
  result: ConfluenceResult
  rank: number
  courseName: string
  offTime: string
  raceClass: string
  distance: string
  modelPicks: Map<string, { label: string; color: string }[]>
  onHorseClick?: (entry: RaceEntry) => void
}

const SIGNAL_CONFIG: { key: keyof SignalBreakdown; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'mlConsensus', label: 'AI Models', icon: Brain, color: 'text-blue-400' },
  { key: 'valueEdge', label: 'Value', icon: Target, color: 'text-green-400' },
  { key: 'marketMomentum', label: 'Market Move', icon: TrendingUp, color: 'text-cyan-400' },
  { key: 'formFigures', label: 'Speed', icon: Timer, color: 'text-orange-400' },
  { key: 'specialist', label: 'Track Form', icon: Target, color: 'text-purple-400' },
  { key: 'trainerIntent', label: 'Trainer Form', icon: Users, color: 'text-yellow-400' },
]

function EquinovaGauge({ score }: { score: number }) {
  const radius = 40
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const color = score >= 75 ? '#22c55e' : score >= 55 ? '#f59e0b' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{score}</span>
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Equinova</span>
      </div>
    </div>
  )
}

function SignalBar({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const barColor = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-amber-500' : 'bg-gray-600'
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color} flex-shrink-0`} />
      <span className="text-[11px] text-gray-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-300 w-7 text-right font-mono">{value}</span>
    </div>
  )
}

function getAngleSummary(signals: SignalBreakdown, entry: RaceEntry): string {
  const parts: string[] = []

  if (signals.mlConsensus >= 60) {
    const topCount = Math.round((signals.mlConsensus / 70) * 5)
    parts.push(`${Math.min(5, topCount)}/5 AI models agree`)
  }

  if (signals.marketMomentum >= 40 && entry.odds_movement === 'steaming') {
    parts.push(`odds shortening ${Math.abs(entry.odds_movement_pct || 0).toFixed(0)}%`)
  }

  if (signals.valueEdge >= 40) parts.push('priced higher than AI thinks')
  if (signals.specialist >= 60) parts.push('proven at this course')
  if (signals.formFigures >= 65) parts.push('fastest in the field')
  if (signals.trainerIntent >= 50) parts.push('trainer in strong form')

  if (parts.length === 0) return 'Small edge across multiple factors'
  return parts.join(' · ')
}

export function SpotlightCard({ result, rank, courseName, offTime, raceClass, distance, modelPicks, onHorseClick }: SpotlightCardProps) {
  const { entry, score, signals, normalizedEnsemble } = result
  const badges = modelPicks.get(entry.horse_id) || []
  const displayTime = formatTime(offTime)
  const angleSummary = getAngleSummary(signals, entry)

  const borderColor = score >= 75
    ? 'border-green-500/40'
    : score >= 55
      ? 'border-amber-500/40'
      : 'border-gray-700'

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm border ${borderColor} rounded-2xl p-4 sm:p-5 relative overflow-hidden`}>
      {/* Rank badge */}
      <div className="absolute top-3 right-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          rank === 1 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' :
          rank === 2 ? 'bg-gray-500/20 text-gray-300 border border-gray-500/40' :
          'bg-orange-500/20 text-orange-400 border border-orange-500/40'
        }`}>
          #{rank}
        </div>
      </div>

      {/* Race context */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
        <span className="font-medium text-gray-300">{courseName}</span>
        <span>·</span>
        <span>{displayTime}</span>
        <span>·</span>
        <span>{raceClass}</span>
        <span>·</span>
        <span>{distance}</span>
      </div>

      <div className="flex gap-4">
        {/* Left: Gauge */}
        <div className="flex-shrink-0">
          <EquinovaGauge score={score} />
        </div>

        {/* Right: Horse info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <HorseNameWithSilk
              horseName={entry.horse_name}
              silkUrl={entry.silk_url}
              className="text-white font-bold text-base"
              clickable={!!onHorseClick}
              onHorseClick={onHorseClick}
              horseEntry={entry}
            />
          </div>

          <div className="text-xs text-gray-400 mb-2">
            {entry.jockey_name} · {entry.trainer_name}
          </div>

          {/* Odds + Win Prob + Model badges row */}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-sm font-bold text-white bg-gray-800 px-2 py-0.5 rounded">
              {formatOdds(entry.current_odds)}
            </span>
            <span className="text-xs text-green-400 font-medium">
              {formatNormalized(normalizedEnsemble)} win prob
            </span>
            {entry.odds_movement === 'steaming' && (
              <span className="text-xs text-cyan-400 flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" />
                {Math.abs(entry.odds_movement_pct || 0).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Model badges */}
          <div className="flex items-center gap-1 mb-3">
            {badges.map((b, i) => (
              <ModelBadge key={i} label={b.label} color={b.color} showCheck />
            ))}
            {badges.length === 0 && (
              <span className="text-[10px] text-gray-600 italic">No model picks</span>
            )}
          </div>

          {/* Angle summary */}
          <div className="flex items-start gap-1.5 mb-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-gray-300 leading-relaxed">{angleSummary}</span>
          </div>
        </div>
      </div>

      {/* Signal breakdown bars */}
      <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
        {SIGNAL_CONFIG.map(cfg => (
          <SignalBar
            key={cfg.key}
            label={cfg.label}
            value={Math.round(signals[cfg.key])}
            icon={cfg.icon}
            color={cfg.color}
          />
        ))}
      </div>

      {/* Shortlist */}
      <div className="mt-3 flex justify-end">
        <ShortlistButton
          horseName={entry.horse_name}
          raceContext={{ race_id: entry.race_id, course_name: courseName, off_time: offTime }}
          odds={formatOdds(entry.current_odds)}
          jockeyName={entry.jockey_name}
          trainerName={entry.trainer_name}
          size="small"
        />
      </div>
    </div>
  )
}

interface SpotlightSectionProps {
  spotlightPicks: ConfluenceResult[]
  raceMap: Record<string, { course_name: string; off_time: string; race_class: string; distance: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

export function SpotlightSection({ spotlightPicks, raceMap, modelPicksMap, onHorseClick }: SpotlightSectionProps) {
  if (spotlightPicks.length === 0) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center">
        <Brain className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-400 mb-1">No Standout Picks Today</h3>
        <p className="text-sm text-gray-500">No horse currently scores 60+ on the Equinova Scale. Proceed with caution or check back closer to race time as odds update.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-5 h-5 text-yellow-400" />
        <h2 className="text-lg font-bold text-white">Today's Best Picks</h2>
        <span className="text-xs text-gray-500 ml-1">Highest rated horses across all races</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spotlightPicks.map((pick, i) => {
          const race = raceMap[pick.raceId] || { course_name: '', off_time: '', race_class: '', distance: '' }
          return (
            <SpotlightCard
              key={pick.horseId}
              result={pick}
              rank={i + 1}
              courseName={race.course_name}
              offTime={race.off_time}
              raceClass={race.race_class}
              distance={race.distance}
              modelPicks={modelPicksMap[pick.raceId] || new Map()}
              onHorseClick={onHorseClick}
            />
          )
        })}
      </div>
    </div>
  )
}
