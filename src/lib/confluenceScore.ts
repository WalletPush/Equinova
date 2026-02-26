/**
 * Confluence Score — a composite metric that combines multiple independent
 * signals into a single 0-100 score for each horse.
 *
 * Weights:
 *   ML Consensus  25%  — How many of 5 models rank this horse #1 or #2
 *   Value Edge    20%  — Gap between normalized ML prob and market implied prob
 *   Market Momentum 20% — Steaming direction + magnitude
 *   Form Figures  15%  — Speed figures relative to the field
 *   Specialist    10%  — Trainer/jockey/horse win% at course/distance
 *   Trainer Intent 10% — Single runner + recent trainer form
 */

import type { RaceEntry } from '@/lib/supabase'
import { normalizeField, type ProbaField } from '@/lib/normalize'

// ─── Types ──────────────────────────────────────────────────────────

export interface ConfluenceResult {
  horseId: string
  horseName: string
  score: number
  signals: SignalBreakdown
  entry: RaceEntry
  raceId: string
  normalizedEnsemble: number
}

export interface SignalBreakdown {
  mlConsensus: number
  valueEdge: number
  marketMomentum: number
  formFigures: number
  specialist: number
  trainerIntent: number
}

export type Verdict = 'strong' | 'lean' | 'skip'

export interface RaceVerdict {
  raceId: string
  courseName: string
  offTime: string
  raceClass: string
  distance: string
  fieldSize: number
  going: string
  surface: string
  prize: string
  type: string
  verdict: Verdict
  topSelection: ConfluenceResult | null
  dangerHorse: ConfluenceResult | null
  competitiveness: number
  allScored: ConfluenceResult[]
  entries: RaceEntry[]
}

// ─── ML Consensus (0-100) ──────────────────────────────────────────

const MODEL_FIELDS: ProbaField[] = [
  'ensemble_proba',
  'benter_proba',
  'mlp_proba',
  'rf_proba',
  'xgboost_proba',
]

function scoreMlConsensus(entry: RaceEntry, raceEntries: RaceEntry[], normalizedEnsemble: number): number {
  let topCount = 0
  let top2Count = 0

  for (const field of MODEL_FIELDS) {
    const sorted = [...raceEntries]
      .map(e => ({ id: e.horse_id, val: Number((e as any)[field]) || 0 }))
      .sort((a, b) => b.val - a.val)

    if (sorted.length === 0) continue
    if (sorted[0].id === entry.horse_id) topCount++
    if (sorted.length >= 2 && (sorted[0].id === entry.horse_id || sorted[1].id === entry.horse_id)) {
      top2Count++
    }
  }

  // Steep curve: model agreement is the strongest signal we have
  // 5/5 → 100, 4/5 → 92, 3/5 → 82, 2/5 → 55, 1/5 → 30, 0/5 → 0
  const TOP_SCORES = [0, 30, 55, 82, 92, 100]
  const modelScore = TOP_SCORES[topCount] || 0

  // Partial credit for being top-2 in models where not top-1
  const extraTop2 = top2Count - topCount
  const top2Bonus = extraTop2 * 4

  // Blend in normalized ensemble probability as a floor
  // so a horse the models rate highly can't score 0
  const ensembleFloor = Math.min(40, normalizedEnsemble * 200)

  return Math.min(100, Math.max(modelScore + top2Bonus, ensembleFloor))
}

// ─── Value Edge (0-100) ────────────────────────────────────────────

function scoreValueEdge(normalizedProb: number, currentOdds: number): number {
  if (!currentOdds || currentOdds <= 1) return 0
  const impliedProb = 1 / currentOdds
  const edge = normalizedProb - impliedProb

  if (edge <= 0) return 0
  // 20%+ edge → 100, 10% → 60, 5% → 35
  return Math.min(100, edge * 500)
}

// ─── Market Momentum (0-100) ───────────────────────────────────────

function scoreMarketMomentum(entry: RaceEntry): number {
  const movement = entry.odds_movement
  const pct = Math.abs(entry.odds_movement_pct || 0)

  if (movement === 'steaming') {
    // Diminishing returns — big moves are notable but shouldn't dominate
    // 30%+ → 85, 20% → 70, 10% → 45, 5% → 25
    return Math.min(85, pct * 2.5 + 10)
  }
  if (movement === 'drifting') {
    return 0
  }
  return 5
}

// ─── Form Figures (0-100) ──────────────────────────────────────────

function scoreFormFigures(entry: RaceEntry, raceEntries: RaceEntry[]): number {
  const figures = [
    entry.last_speed_figure,
    entry.mean_speed_figure,
    entry.best_speed_figure_at_distance,
    entry.best_speed_figure_at_track,
  ].filter(v => v != null && v > 0)

  if (figures.length === 0) return 20 // unknown = neutral-low

  const avg = figures.reduce((a, b) => a + b, 0) / figures.length

  // Compare to field average
  const fieldFigures = raceEntries
    .map(e => [e.last_speed_figure, e.mean_speed_figure, e.best_speed_figure_at_distance].filter(v => v > 0))
    .flat()

  if (fieldFigures.length === 0) return 50

  const fieldAvg = fieldFigures.reduce((a, b) => a + b, 0) / fieldFigures.length
  const fieldMax = Math.max(...fieldFigures)

  if (fieldMax === 0) return 50

  // How far above average (as a fraction of the range)
  const range = fieldMax - fieldAvg || 1
  const aboveAvg = (avg - fieldAvg) / range

  // -1 to +1 mapped to 0-100
  return Math.min(100, Math.max(0, 50 + aboveAvg * 50))
}

// ─── Specialist Score (0-100) ──────────────────────────────────────

function scoreSpecialist(entry: RaceEntry): number {
  const metrics = [
    { val: entry.trainer_win_percentage_at_course, weight: 3 },
    { val: entry.horse_win_percentage_at_distance, weight: 3 },
    { val: entry.jockey_win_percentage_at_distance, weight: 2 },
    { val: entry.trainer_win_percentage_at_distance, weight: 2 },
  ]

  let totalWeight = 0
  let weightedSum = 0

  for (const m of metrics) {
    const v = Number(m.val) || 0
    if (v > 0) {
      weightedSum += Math.min(100, v * 2.5) * m.weight
      totalWeight += m.weight
    }
  }

  if (totalWeight === 0) return 20
  return Math.min(100, weightedSum / totalWeight)
}

// ─── Trainer Intent (0-100) ────────────────────────────────────────

export interface TrainerIntentData {
  isSingleRunner: boolean
  trainer21DayWinPct: number
}

function scoreTrainerIntent(entry: RaceEntry, intentData?: TrainerIntentData): number {
  let score = 0

  // Single runner at meeting is a strong signal
  if (intentData?.isSingleRunner) {
    score += 50
  }

  // Trainer recent form (21-day win %)
  const t21 = entry.trainer_21_days_win_percentage || intentData?.trainer21DayWinPct || 0
  if (t21 > 0) {
    score += Math.min(50, t21 * 2.5)
  }

  return Math.min(100, score)
}

// ─── Main Confluence Calculator ────────────────────────────────────

const WEIGHTS = {
  mlConsensus: 0.35,
  valueEdge: 0.13,
  marketMomentum: 0.12,
  formFigures: 0.15,
  specialist: 0.10,
  trainerIntent: 0.10,
}

export function calculateConfluenceScores(
  raceEntries: RaceEntry[],
  trainerIntentMap?: Map<string, TrainerIntentData>,
): ConfluenceResult[] {
  if (!raceEntries || raceEntries.length === 0) return []

  const ensembleNorm = normalizeField(raceEntries, 'ensemble_proba', 'horse_id')

  return raceEntries.map(entry => {
    const normalizedEnsemble = ensembleNorm.get(entry.horse_id) || 0
    const intentData = trainerIntentMap?.get(entry.horse_id)

    const signals: SignalBreakdown = {
      mlConsensus: scoreMlConsensus(entry, raceEntries, normalizedEnsemble),
      valueEdge: scoreValueEdge(normalizedEnsemble, entry.current_odds),
      marketMomentum: scoreMarketMomentum(entry),
      formFigures: scoreFormFigures(entry, raceEntries),
      specialist: scoreSpecialist(entry),
      trainerIntent: scoreTrainerIntent(entry, intentData),
    }

    const score =
      signals.mlConsensus * WEIGHTS.mlConsensus +
      signals.valueEdge * WEIGHTS.valueEdge +
      signals.marketMomentum * WEIGHTS.marketMomentum +
      signals.formFigures * WEIGHTS.formFigures +
      signals.specialist * WEIGHTS.specialist +
      signals.trainerIntent * WEIGHTS.trainerIntent

    return {
      horseId: entry.horse_id,
      horseName: entry.horse_name,
      score: Math.round(score),
      signals,
      entry,
      raceId: entry.race_id,
      normalizedEnsemble,
    }
  }).sort((a, b) => b.score - a.score)
}

// ─── Race Verdict ──────────────────────────────────────────────────

export function deriveVerdict(scored: ConfluenceResult[]): Verdict {
  if (scored.length === 0) return 'skip'

  const top = scored[0]

  // Check competitiveness — how close the top 3 are
  const top3Scores = scored.slice(0, 3).map(s => s.score)
  const spread = top3Scores.length >= 2 ? top3Scores[0] - top3Scores[top3Scores.length - 1] : 999

  if (top.score >= 65 && spread >= 8) return 'strong'
  if (top.score >= 45) return 'lean'
  return 'skip'
}

export function getVerdictConfig(verdict: Verdict) {
  switch (verdict) {
    case 'strong':
      return {
        label: 'Strong Play',
        bg: 'bg-green-500/15',
        border: 'border-green-500/40',
        text: 'text-green-400',
        dotColor: 'bg-green-400',
      }
    case 'lean':
      return {
        label: 'Lean',
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/40',
        text: 'text-amber-400',
        dotColor: 'bg-amber-400',
      }
    case 'skip':
      return {
        label: 'Skip',
        bg: 'bg-red-500/15',
        border: 'border-red-500/40',
        text: 'text-red-400',
        dotColor: 'bg-red-400',
      }
  }
}

// ─── Market Intelligence helpers ───────────────────────────────────

export type MarketMlAgreement = 'agree' | 'market_leading' | 'smart_money' | 'false_move' | 'neutral'

export function classifyMarketMl(
  oddsMovement: string | null | undefined,
  movementPct: number | null | undefined,
  isTopMlPick: boolean,
): MarketMlAgreement {
  const isSteaming = oddsMovement === 'steaming'
  const isDrifting = oddsMovement === 'drifting'
  const significantMove = Math.abs(movementPct || 0) >= 8

  if (isSteaming && isTopMlPick && significantMove) return 'smart_money'
  if (isSteaming && isTopMlPick) return 'agree'
  if (isSteaming && !isTopMlPick) return 'market_leading'
  if (isDrifting && isTopMlPick) return 'false_move'
  return 'neutral'
}

export function getMarketMlConfig(agreement: MarketMlAgreement) {
  switch (agreement) {
    case 'smart_money':
      return { label: 'Smart Money', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/40' }
    case 'agree':
      return { label: 'ML + Market Agree', color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/40' }
    case 'market_leading':
      return { label: 'Market Leading', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/40' }
    case 'false_move':
      return { label: 'Potential Value', color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/40' }
    case 'neutral':
      return { label: 'Neutral', color: 'text-gray-400', bg: 'bg-gray-500/15', border: 'border-gray-500/40' }
  }
}

// ─── Data Angles helpers ──────────────────────────────────────────

export interface SpeedStandout {
  entry: RaceEntry
  raceId: string
  bestFigure: number
  fieldAvg: number
  advantage: number
  figureType: string
}

export function findSpeedStandouts(allEntries: RaceEntry[]): SpeedStandout[] {
  const byRace = groupByRace(allEntries)
  const standouts: SpeedStandout[] = []

  for (const [raceId, entries] of Object.entries(byRace)) {
    const fieldFigs = entries
      .map(e => e.best_speed_figure_at_distance || e.last_speed_figure || e.mean_speed_figure || 0)
      .filter(v => v > 0)
    if (fieldFigs.length < 2) continue

    const fieldAvg = fieldFigs.reduce((a, b) => a + b, 0) / fieldFigs.length

    for (const entry of entries) {
      const best = entry.best_speed_figure_on_course_going_distance
        || entry.best_speed_figure_at_distance
        || entry.best_speed_figure_at_track
        || 0
      if (best <= 0) continue

      const advantage = ((best - fieldAvg) / fieldAvg) * 100
      if (advantage >= 5) {
        const figureType = entry.best_speed_figure_on_course_going_distance
          ? 'Course/Going/Distance'
          : entry.best_speed_figure_at_distance
            ? 'At Distance'
            : 'At Track'
        standouts.push({ entry, raceId, bestFigure: best, fieldAvg, advantage, figureType })
      }
    }
  }

  return standouts.sort((a, b) => b.advantage - a.advantage)
}

export interface TrainerHotspot {
  entry: RaceEntry
  raceId: string
  courseWinPct: number
  trainer21DayPct: number
  isSingleRunner: boolean
}

export function findTrainerHotspots(
  allEntries: RaceEntry[],
  trainerIntentMap?: Map<string, TrainerIntentData>,
): TrainerHotspot[] {
  const hotspots: TrainerHotspot[] = []

  for (const entry of allEntries) {
    const courseWin = entry.trainer_win_percentage_at_course || 0
    const t21 = entry.trainer_21_days_win_percentage || 0
    const isSingle = trainerIntentMap?.get(entry.horse_id)?.isSingleRunner || false

    // Trainer has 15%+ win rate at course OR is in strong recent form with a single runner
    if (courseWin >= 15 || (isSingle && t21 >= 15)) {
      hotspots.push({
        entry,
        raceId: entry.race_id,
        courseWinPct: courseWin,
        trainer21DayPct: t21,
        isSingleRunner: isSingle,
      })
    }
  }

  return hotspots.sort((a, b) => {
    const aScore = a.courseWinPct + (a.isSingleRunner ? 20 : 0) + a.trainer21DayPct
    const bScore = b.courseWinPct + (b.isSingleRunner ? 20 : 0) + b.trainer21DayPct
    return bScore - aScore
  })
}

export interface CourseDistanceSpecialist {
  entry: RaceEntry
  raceId: string
  horseWinPctAtDistance: number
  trainerWinPctAtCourse: number
  combinedScore: number
}

export function findCourseDistanceSpecialists(allEntries: RaceEntry[]): CourseDistanceSpecialist[] {
  const specialists: CourseDistanceSpecialist[] = []

  for (const entry of allEntries) {
    const horseWin = entry.horse_win_percentage_at_distance || 0
    const trainerWin = entry.trainer_win_percentage_at_course || 0

    if (horseWin >= 20 || (horseWin >= 10 && trainerWin >= 15)) {
      specialists.push({
        entry,
        raceId: entry.race_id,
        horseWinPctAtDistance: horseWin,
        trainerWinPctAtCourse: trainerWin,
        combinedScore: horseWin * 0.6 + trainerWin * 0.4,
      })
    }
  }

  return specialists.sort((a, b) => b.combinedScore - a.combinedScore)
}

// ─── Utility ────────────────────────────────────────────────────────

export function groupByRace<T extends { race_id: string }>(entries: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const e of entries) {
    if (!map[e.race_id]) map[e.race_id] = []
    map[e.race_id].push(e)
  }
  return map
}
