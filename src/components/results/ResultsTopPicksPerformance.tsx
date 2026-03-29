import React from 'react'
import type { RaceEntry } from '@/lib/supabase'
import type { MastermindMatch } from '@/hooks/useMastermind'
import type { RaceRunner, ResultsRace } from './types'
import { bareHorseName } from '@/lib/raceRunnerUtils'
import { spToProfit } from '@/lib/spUtils'
import { formatTime, raceTimeToMinutes } from '@/lib/dateUtils'
import {
  Trophy,
  XCircle,
  Loader2,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Brain,
  Target,
} from 'lucide-react'

interface PickResult {
  match: MastermindMatch
  position: number | null
  sp: string
  won: boolean
  profit: number
  stake: number
  courseName: string
}

function kellyTrustMultiplier(ts: number): number {
  if (ts >= 80) return 1.5
  if (ts >= 60) return 1.0
  if (ts >= 30) return 0.5
  return 0.25
}

function kellyStake(ensProba: number, odds: number, trustScore: number, bank: number): number | null {
  if (odds <= 1 || bank <= 0 || ensProba <= 0) return null
  const edge = ensProba - 1 / odds
  if (edge <= 0.01) return null
  const k = edge / (odds - 1)
  const frac = Math.min((k / 4) * kellyTrustMultiplier(trustScore), 0.05)
  const stake = Math.round(bank * frac * 2) / 2
  return stake >= 1 ? stake : null
}

const MM_MIN_EDGE = 0.05
const MM_MAX_ODDS = 13.0
const MM_MIN_ENSEMBLE = 0.15
const MM_LONGSHOT_PATTERNS = 2

interface Props {
  completed: ResultsRace[]
  mastermindMatches: MastermindMatch[]
  mastermindLoading: boolean
  bankroll: number
}

export function ResultsTopPicksPerformance({ completed, mastermindMatches, mastermindLoading, bankroll }: Props) {
  const mmByKey = new Map<string, MastermindMatch>()
  for (const m of mastermindMatches) {
    mmByKey.set(`${m.race_id}:${m.horse_id}`, m)
  }

  const pickResults: PickResult[] = []

  for (const race of completed) {
    const entries = race.topEntries || []
    const runners = race.runners || []
    if (entries.length === 0) continue

    let bestPick: { entry: RaceEntry; mm: MastermindMatch; edge: number } | null = null

    for (const e of entries) {
      const openOdds = Number(e.opening_odds) || 0
      const curOdds = Number(e.current_odds) || 0
      const odds = openOdds > 1 ? openOdds : curOdds
      const ensProba = Number(e.ensemble_proba) || 0

      if (odds <= 1 || ensProba <= 0) continue
      if (ensProba < MM_MIN_ENSEMBLE) continue

      const edge = ensProba - (1 / odds)
      if (edge < MM_MIN_EDGE) continue

      const mmKey = `${race.race_id}:${e.horse_id}`
      const mm = mmByKey.get(mmKey)
      if (!mm || mm.pattern_count === 0) continue
      if (mm.trust_tier !== 'high') continue

      if (odds > MM_MAX_ODDS && mm.pattern_count < MM_LONGSHOT_PATTERNS) continue

      if (!bestPick || edge > bestPick.edge) {
        bestPick = { entry: e, mm, edge }
      }
    }

    if (!bestPick) continue

    const openO = Number(bestPick.entry.opening_odds) || 0
    const curO = Number(bestPick.entry.current_odds) || 0
    const stakeOdds = openO > 1 ? openO : curO
    const stake = kellyStake(Number(bestPick.entry.ensemble_proba), stakeOdds, bestPick.mm.trust_score, bankroll)
    if (!stake) continue

    const bareMM = bareHorseName(bestPick.mm.horse_name)
    let matchedRunner: RaceRunner | undefined
    for (const r of runners) {
      const bn = bareHorseName(r.horse)
      if (bn === bareMM || bn.startsWith(bareMM) || bareMM.startsWith(bn)) {
        matchedRunner = r
        break
      }
    }

    const pos = matchedRunner?.position ?? null
    const sp = matchedRunner?.sp ?? ''
    const won = pos === 1
    const profit = won ? stake * spToProfit(sp) : -stake

    pickResults.push({
      match: bestPick.mm,
      position: pos,
      sp,
      won,
      profit,
      stake,
      courseName: race.course_name,
    })
  }

  if (pickResults.length === 0 && !mastermindLoading) return null

  pickResults.sort((a, b) => raceTimeToMinutes(a.match.off_time) - raceTimeToMinutes(b.match.off_time))

  const winners = pickResults.filter(p => p.won)
  const losers = pickResults.filter(p => !p.won)
  const totalProfit = pickResults.reduce((s, p) => s + p.profit, 0)

  const trustConfig: Record<string, { bg: string; border: string; text: string; icon: typeof ShieldCheck; label: string }> = {
    high:   { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400', icon: ShieldCheck, label: 'Strong' },
    medium: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: Shield, label: 'Moderate' },
    low:    { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', icon: AlertTriangle, label: 'Weak' },
  }
  const defaultTrust = { bg: 'bg-gray-700/50', border: 'border-gray-600', text: 'text-gray-500', icon: Brain, label: 'No signals' }

  const renderPick = (p: PickResult, i: number) => {
    const tc = trustConfig[p.match.trust_tier] ?? defaultTrust
    const TrustIcon = tc.icon
    return (
      <div key={`${p.match.race_id}-${i}`} className="py-2 px-3 bg-gray-800/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              p.won ? 'bg-yellow-500' : 'bg-red-500/30'
            }`}>
              {p.won
                ? <Trophy className="w-3 h-3 text-gray-900" />
                : <XCircle className="w-3 h-3 text-red-400" />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{p.match.horse_name}</div>
              <div className="text-[10px] text-gray-500">{p.courseName} · {formatTime(p.match.off_time)}</div>
            </div>
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.bg} ${tc.text} border ${tc.border}`}>
              <TrustIcon className="w-3 h-3" />
              {tc.label}
            </span>
            <span className="text-[10px] text-gray-500 min-w-[32px] text-right">£{p.stake.toFixed(0)}</span>
            {p.sp && <span className="text-sm font-mono text-gray-300 min-w-[40px] text-right">{p.sp}</span>}
            <span className={`text-sm font-semibold min-w-[56px] text-right ${
              p.won ? 'text-green-400' : 'text-red-400'
            }`}>
              {p.profit > 0 ? '+' : ''}£{p.profit.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-b from-gray-800/80 to-gray-800/40 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Target className="w-5 h-5 text-yellow-400" />
          <h2 className="text-base font-semibold text-white">
            Top Picks
            <span className="ml-2 text-sm font-normal text-gray-400">
              {pickResults.length} pick{pickResults.length !== 1 ? 's' : ''} from {completed.length} race{completed.length !== 1 ? 's' : ''}
            </span>
          </h2>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${totalProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalProfit > 0 ? '+' : ''}£{totalProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-500">net P&L (Kelly stakes)</div>
        </div>
      </div>

      {mastermindLoading && pickResults.length === 0 && (
        <div className="flex items-center justify-center py-4 space-x-2">
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
          <span className="text-sm text-gray-400">Loading signals…</span>
        </div>
      )}

      {pickResults.length > 0 && (
        <div className="space-y-3">
          {winners.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Trophy className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                  Winners ({winners.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {winners.map((p, i) => renderPick(p, i))}
              </div>
            </div>
          )}

          {losers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                  Losers ({losers.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {losers.map((p, i) => renderPick(p, i))}
              </div>
            </div>
          )}
        </div>
      )}

      {pickResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700 flex items-center justify-between text-xs">
          <span className="text-gray-400">Kelly stakes · {winners.length}W / {losers.length}L · Strike rate {pickResults.length > 0 ? Math.round((winners.length / pickResults.length) * 100) : 0}%</span>
          <span className={`font-semibold ${totalProfit > 0 ? 'text-green-400' : totalProfit < 0 ? 'text-red-400' : 'text-gray-400'}`}>
            Net P&L: {totalProfit > 0 ? '+' : ''}£{totalProfit.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
