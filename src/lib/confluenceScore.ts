/**
 * Equinova Score — a composite 0-100 rating that combines multiple data
 * signals to rate every horse in every race.
 *
 * Weights (Benter value-first):
 *   AI Models     28%  — How many of 5 ML models rank this horse top
 *   Value         20%  — Benter value score (AI probability × odds)
 *   Market Move   12%  — Whether the horse is being backed (odds shortening)
 *   Speed         15%  — Speed figures relative to the field
 *   Track Form    10%  — Trainer/jockey/horse win% at this course & distance
 *   Trainer Form  10%  — Single runner intent + recent trainer form
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
  topPickSignals: ProfitableSignal[]
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
  const valueScore = normalizedProb * currentOdds

  if (valueScore <= 1.0) return 0
  // 1.5x+ → 100, 1.3x → 75, 1.15x → 45, 1.05x → 15
  return Math.min(100, (valueScore - 1.0) * 200)
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

  let base = totalWeight === 0 ? 20 : Math.min(100, weightedSum / totalWeight)

  // C&D in comment means the horse has won at this course & distance —
  // guarantee a meaningful specialist floor so the Track Form bar reflects it
  const comment = (entry.comment || '').toLowerCase()
  const isCD = /\bc\s*&\s*d\b/.test(comment) || /\bcourse\s+and\s+distance\b/.test(comment)
  if (isCD) base = Math.max(base, 45)

  return base
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
  mlConsensus: 0.28,
  valueEdge: 0.20,
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

  if (top.score >= 50 && spread >= 8) return 'strong'
  if (top.score >= 35) return 'lean'
  return 'skip'
}

export function getVerdictConfig(verdict: Verdict) {
  switch (verdict) {
    case 'strong':
      return {
        label: 'Top Pick',
        bg: 'bg-green-500/15',
        border: 'border-green-500/40',
        text: 'text-green-400',
        dotColor: 'bg-green-400',
      }
    case 'lean':
      return {
        label: 'Worth a Look',
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/40',
        text: 'text-amber-400',
        dotColor: 'bg-amber-400',
      }
    case 'skip':
      return {
        label: 'Risky',
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
      return { label: 'AI & Market Agree', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/40' }
    case 'agree':
      return { label: 'AI & Market Agree', color: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/40' }
    case 'market_leading':
      return { label: 'Market Backed', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/40' }
    case 'false_move':
      return { label: 'AI Says Value', color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/40' }
    case 'neutral':
      return { label: 'Drifting', color: 'text-gray-400', bg: 'bg-gray-500/15', border: 'border-gray-500/40' }
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
          ? 'Best speed at this course, going & distance'
          : entry.best_speed_figure_at_distance
            ? 'Best speed at this distance'
            : 'Best speed at this track'
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
  isCommentCD: boolean
}

export function findCourseDistanceSpecialists(allEntries: RaceEntry[]): CourseDistanceSpecialist[] {
  const specialists: CourseDistanceSpecialist[] = []

  for (const entry of allEntries) {
    const horseWin = entry.horse_win_percentage_at_distance || 0
    const trainerWin = entry.trainer_win_percentage_at_course || 0

    const comment = (entry.comment || '').toLowerCase()
    const isCD = /\bc\s*&\s*d\b/.test(comment) || /\bcourse\s+and\s+distance\b/.test(comment)

    if (horseWin >= 20 || (horseWin >= 10 && trainerWin >= 15) || isCD) {
      specialists.push({
        entry,
        raceId: entry.race_id,
        horseWinPctAtDistance: horseWin,
        trainerWinPctAtCourse: trainerWin,
        combinedScore: isCD
          ? Math.max(horseWin * 0.6 + trainerWin * 0.4, 25)
          : horseWin * 0.6 + trainerWin * 0.4,
        isCommentCD: isCD,
      })
    }
  }

  return specialists.sort((a, b) => b.combinedScore - a.combinedScore)
}

// ─── Profitable Signal Detection ─────────────────────────────────

export interface ProfitableSignal {
  key: string
  label: string
  winRate: string
  color: string
  periodLabel?: string
  profit?: number
  totalBets?: number
  roi_pct?: number
}

export interface HistoricalSignalStats {
  win_rate: number
  profit: number
  total_bets: number
  roi_pct: number
}

const SIGNAL_REGISTRY: { key: string; label: string; winRate: string }[] = [
  { key: 'cd_ml_value', label: 'C&D + ML Pick + Value', winRate: '—' },
  { key: 'cd_ml_backed', label: 'C&D + ML Pick + Backed', winRate: '—' },
  { key: 'cd_ml_pick', label: 'C&D + ML Pick', winRate: '—' },
  { key: 'cd_value', label: 'C&D + Value Bet', winRate: '—' },
  { key: 'cd_backed', label: 'C&D + Backed', winRate: '—' },
  { key: 'cd_top_rated', label: 'C&D + Top Rated', winRate: '—' },
  { key: 'value_ml_backed_rated', label: 'Value + ML + Backed + Top Rated', winRate: '29%' },
  { key: 'value_ml_top_rated', label: 'Value + ML Pick + Top Rated', winRate: '23%' },
  { key: 'value_ml_backed', label: 'Value + ML Pick + Backed', winRate: '15%' },
  { key: 'triple_signal', label: 'Triple Signal (Backed + ML + Top Rated)', winRate: '33%' },
  { key: 'value_ml_pick', label: 'Value + ML Pick', winRate: '14%' },
  { key: 'value_top_rated', label: 'Value + Top Rated', winRate: '16%' },
  { key: 'steamer_ml_pick', label: 'Backed + ML Pick', winRate: '24%' },
  { key: 'steamer_trainer_form', label: 'Backed + Trainer in Form', winRate: '13%' },
  { key: 'ml_ratings_consensus', label: 'ML Pick + Top RPR + Top TS', winRate: '40%' },
  { key: 'ml_pick_top_rpr', label: 'ML Pick + Top RPR', winRate: '37%' },
  { key: 'ml_pick_course_specialist', label: 'ML Pick + Course Specialist', winRate: '45%' },
  { key: 'ml_pick_trainer_form', label: 'ML Pick + Trainer in Form', winRate: '29%' },
  { key: 'ratings_consensus', label: 'Top RPR + Top TS', winRate: '34%' },
  { key: 'steamer_single_trainer', label: 'Backed + Single Trainer', winRate: '20%' },
  { key: 'single_trainer_in_form', label: 'Single Trainer in Form', winRate: '20%' },
  { key: 'value_bet', label: 'Value Bet (AI Edge)', winRate: '9%' },
  { key: 'value_backed', label: 'Value + Backed', winRate: '9%' },
  { key: 'ml_top_pick', label: 'ML Top Pick', winRate: '26%' },
  { key: 'top_rpr', label: 'Top RPR in Field', winRate: '28%' },
  { key: 'top_ts', label: 'Top Topspeed in Field', winRate: '24%' },
  { key: 'steamer', label: 'Backed (Odds Shortening)', winRate: '11%' },
  { key: 'cd_specialist', label: 'C&D Specialist', winRate: '—' },
  { key: 'course_specialist', label: 'Course Specialist', winRate: '50%' },
  { key: 'trainer_form', label: 'Trainer in Form (21d)', winRate: '16%' },
  { key: 'speed_standout', label: 'Speed Figure Standout', winRate: '13%' },
]

export function detectProfitableSignals(
  entry: RaceEntry,
  raceEntries: RaceEntry[],
  modelBadges: { label: string; color: string }[],
  trainerIntent?: TrainerIntentData,
  historicalStats?: Record<string, HistoricalSignalStats>,
  periodLabel?: string,
): ProfitableSignal[] {
  const isMLTopPick = modelBadges.length >= 1
  const isSteaming = entry.odds_movement === 'steaming'
  const isSingleTrainer = trainerIntent?.isSingleRunner || false

  // Top RPR in race
  const rprs = raceEntries.map(e => e.rpr || 0).filter(v => v > 0)
  const isTopRpr = rprs.length > 0 && (entry.rpr || 0) > 0 && (entry.rpr || 0) >= Math.max(...rprs)

  // Top Topspeed in race
  const tss = raceEntries.map(e => e.ts || 0).filter(v => v > 0)
  const isTopTs = tss.length > 0 && (entry.ts || 0) > 0 && (entry.ts || 0) >= Math.max(...tss)

  // Course/distance specialist
  const horseWinDist = entry.horse_win_percentage_at_distance || 0
  const trainerWinCourse = entry.trainer_win_percentage_at_course || 0
  const isCourseSpec = horseWinDist >= 20 || (horseWinDist >= 10 && trainerWinCourse >= 15)

  // Trainer in form (21 day)
  const t21 = entry.trainer_21_days_win_percentage || 0
  const isTrainerForm = t21 >= 15

  // Speed figure standout
  const fieldFigs = raceEntries
    .map(e => e.best_speed_figure_at_distance || e.last_speed_figure || e.mean_speed_figure || 0)
    .filter(v => v > 0)
  const fieldAvg = fieldFigs.length > 0 ? fieldFigs.reduce((a, b) => a + b, 0) / fieldFigs.length : 0
  const bestFig = entry.best_speed_figure_on_course_going_distance
    || entry.best_speed_figure_at_distance
    || entry.best_speed_figure_at_track
    || 0
  const isSpeedStandout = fieldAvg > 0 && bestFig > 0 && ((bestFig - fieldAvg) / fieldAvg) * 100 >= 5

  const ensProb = entry.ensemble_proba || 0
  const totalEns = raceEntries.reduce((s, e) => s + (e.ensemble_proba || 0), 0)
  const normProb = totalEns > 0 ? ensProb / totalEns : 0
  const curOdds = entry.current_odds || 0
  const benterValue = curOdds > 1 ? normProb * curOdds : 0
  const isValue = benterValue >= 1.05

  // C&D specialist from comment text
  const comment = (entry.comment || '').toLowerCase()
  const isCD = /\bc\s*&\s*d\b/.test(comment) || /\bcourse\s+and\s+distance\b/.test(comment)

  const flags: Record<string, boolean> = {
    cd_ml_value: isCD && isMLTopPick && isValue,
    cd_ml_backed: isCD && isMLTopPick && isSteaming,
    cd_ml_pick: isCD && isMLTopPick,
    cd_value: isCD && isValue,
    cd_backed: isCD && isSteaming,
    cd_top_rated: isCD && (isTopRpr || isTopTs),
    value_ml_backed_rated: isValue && isMLTopPick && isSteaming && (isTopRpr || isTopTs),
    value_ml_top_rated: isValue && isMLTopPick && (isTopRpr || isTopTs),
    value_ml_backed: isValue && isMLTopPick && isSteaming,
    triple_signal: isSteaming && isMLTopPick && (isTopRpr || isTopTs),
    value_ml_pick: isValue && isMLTopPick,
    value_top_rated: isValue && (isTopRpr || isTopTs),
    steamer_ml_pick: isSteaming && isMLTopPick,
    steamer_trainer_form: isSteaming && isTrainerForm,
    ml_ratings_consensus: isMLTopPick && isTopRpr && isTopTs,
    ml_pick_top_rpr: isMLTopPick && isTopRpr,
    ml_pick_course_specialist: isMLTopPick && isCourseSpec,
    ml_pick_trainer_form: isMLTopPick && isTrainerForm,
    ratings_consensus: isTopRpr && isTopTs,
    steamer_single_trainer: isSteaming && isSingleTrainer,
    single_trainer_in_form: isSingleTrainer && isTrainerForm,
    value_bet: isValue,
    value_backed: isValue && isSteaming,
    ml_top_pick: isMLTopPick,
    top_rpr: isTopRpr,
    top_ts: isTopTs,
    steamer: isSteaming,
    cd_specialist: isCD,
    course_specialist: isCourseSpec,
    trainer_form: isTrainerForm,
    speed_standout: isSpeedStandout,
  }

  const matched: ProfitableSignal[] = []
  for (const sig of SIGNAL_REGISTRY) {
    if (!flags[sig.key]) continue

    const hist = historicalStats?.[sig.key]

    if (hist && hist.total_bets >= 3) {
      if (hist.profit <= 0) continue

      const pct = hist.win_rate
      const roi = hist.roi_pct
      const color = pct >= 35 ? 'text-green-400 bg-green-500/20 border-green-500/50'
        : pct >= 25 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'
        : 'text-amber-400 bg-amber-500/15 border-amber-500/40'
      matched.push({
        key: sig.key,
        label: sig.label,
        winRate: `${pct}%`,
        color,
        periodLabel: periodLabel || 'lifetime',
        profit: hist.profit,
        totalBets: hist.total_bets,
        roi_pct: roi,
      })
    }
  }

  // C&D is factual (horse has won at this course & distance) — show it as
  // an informational badge, but ONLY when the horse already has at least
  // one other non-CD profitable signal.  C&D alone is not enough.
  const hasNonCDSignal = matched.some(s => !s.key.startsWith('cd_'))
  if (isCD && hasNonCDSignal && !matched.some(s => s.key.startsWith('cd_'))) {
    const hist = historicalStats?.['cd_specialist']
    matched.push({
      key: 'cd_specialist',
      label: 'C&D Specialist',
      winRate: hist ? `${hist.win_rate}%` : '—',
      color: 'text-purple-400 bg-purple-500/15 border-purple-500/40',
      periodLabel: 'form',
      profit: hist?.profit ?? 0,
      totalBets: hist?.total_bets ?? 0,
      roi_pct: hist?.roi_pct ?? 0,
    })
  }

  // Sort by profit descending so the most profitable shows first
  matched.sort((a, b) => (b.profit || 0) - (a.profit || 0))

  return matched
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
