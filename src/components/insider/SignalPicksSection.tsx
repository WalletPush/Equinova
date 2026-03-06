import React from 'react'
import { Zap, TrendingUp, Brain, Timer, Target, Users, BadgeCheck } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ModelBadge } from '@/components/ModelBadge'
import { ShortlistButton } from '@/components/ShortlistButton'
import { MarketMovementBadge } from '@/components/MarketMovement'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import { formatNormalized } from '@/lib/normalize'
import type { ConfluenceResult, SignalBreakdown, ProfitableSignal } from '@/lib/confluenceScore'
import type { RaceEntry } from '@/lib/supabase'

interface SignalPickCardProps {
  result: ConfluenceResult
  signals: ProfitableSignal[]
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
  const color = score >= 60 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'

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

function SignalPickCard({ result, signals, courseName, offTime, raceClass, distance, modelPicks, onHorseClick }: SignalPickCardProps) {
  const { entry, score, signals: signalBreakdown, normalizedEnsemble } = result
  const badges = modelPicks.get(entry.horse_id) || []
  const displayTime = formatTime(offTime)

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm border border-green-500/30 rounded-2xl relative overflow-hidden">
      {/* Profitable signals header */}
      <div className="bg-gradient-to-r from-green-500/15 via-emerald-500/10 to-transparent px-4 py-3 border-b border-green-500/20">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
            {signals.length} Profitable {signals.length === 1 ? 'Signal' : 'Signals'} (Lifetime)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {signals.map(sig => {
            const isInfoOnly = sig.periodLabel === 'form'
            return (
              <div
                key={sig.key}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${sig.color}`}
              >
                <span>{sig.label}</span>
                {isInfoOnly ? (
                  <span className="text-[10px] opacity-60">Won here before</span>
                ) : (
                  <>
                    <span className="opacity-75">|</span>
                    <span>{sig.winRate} win</span>
                    <span className="opacity-75">|</span>
                    <span className={sig.profit && sig.profit > 0 ? 'text-green-400' : 'text-red-400'}>
                      {sig.profit && sig.profit > 0 ? '+' : ''}{sig.profit?.toFixed(2) ?? '0.00'}
                    </span>
                    <span className="text-[10px] opacity-60">({sig.totalBets} bets)</span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5">
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

            <div className="text-xs text-gray-400 mb-2 space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                <span>J: {entry.jockey_name}</span>
                {(entry.jockey_21_days_win_percentage || 0) >= 10 && (
                  <span className="text-[10px] text-green-400">({entry.jockey_21_days_win_percentage?.toFixed(0)}% last 21d)</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span>T: {entry.trainer_name}</span>
                {(entry.trainer_win_percentage_at_course || 0) > 0 && (
                  <span className="text-[10px] text-purple-400">({entry.trainer_win_percentage_at_course?.toFixed(0)}% at course)</span>
                )}
                {(entry.trainer_21_days_win_percentage || 0) >= 10 && (
                  <span className="text-[10px] text-green-400">({entry.trainer_21_days_win_percentage?.toFixed(0)}% last 21d)</span>
                )}
              </div>
            </div>

            {/* Odds + Win Prob + Model badges row */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-sm font-bold text-white bg-gray-800 px-2 py-0.5 rounded">
                {formatOdds(entry.current_odds)}
              </span>
              <span className="text-xs text-green-400 font-medium">
                {formatNormalized(normalizedEnsemble)} win prob
              </span>
              <MarketMovementBadge movement={entry.odds_movement} pct={entry.odds_movement_pct} size="md" />
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
          </div>
        </div>

        {/* Signal breakdown bars */}
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
          {SIGNAL_CONFIG.map(cfg => (
            <SignalBar
              key={cfg.key}
              label={cfg.label}
              value={Math.round(signalBreakdown[cfg.key])}
              icon={cfg.icon}
              color={cfg.color}
            />
          ))}
        </div>

        {/* Expert comment from CSV */}
        {entry.comment && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex-shrink-0 pt-0.5">Comment</span>
              <p className="text-xs text-gray-300 leading-relaxed italic">{entry.comment}</p>
            </div>
          </div>
        )}

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
    </div>
  )
}

interface SignalPicksSectionProps {
  signalPicks: { result: ConfluenceResult; signals: ProfitableSignal[]; offTime: string }[]
  raceMap: Record<string, { course_name: string; off_time: string; race_class: string; distance: string }>
  modelPicksMap: Record<string, Map<string, { label: string; color: string }[]>>
  onHorseClick?: (entry: RaceEntry) => void
}

export function SignalPicksSection({ signalPicks, raceMap, modelPicksMap, onHorseClick }: SignalPicksSectionProps) {
  if (signalPicks.length === 0) {
    return (
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center">
        <Brain className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-400 mb-1">No Profitable Signals Right Now</h3>
        <p className="text-sm text-gray-500">No horse currently matches a historically profitable signal pattern. Check back closer to race time as odds and market data update.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="mb-1">
        <div className="flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-bold text-white whitespace-nowrap">Today's Profitable Signals</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1 ml-7">Horses matching historically profitable signal patterns · ordered by race time</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {signalPicks.map(pick => {
          const race = raceMap[pick.result.raceId] || { course_name: '', off_time: '', race_class: '', distance: '' }
          return (
            <SignalPickCard
              key={`${pick.result.raceId}-${pick.result.horseId}`}
              result={pick.result}
              signals={pick.signals}
              courseName={race.course_name}
              offTime={race.off_time}
              raceClass={race.race_class}
              distance={race.distance}
              modelPicks={modelPicksMap[pick.result.raceId] || new Map()}
              onHorseClick={onHorseClick}
            />
          )
        })}
      </div>
    </div>
  )
}
