import type { Race } from '@/lib/supabase'

export interface ValueBetResult {
  horse_name: string
  horse_id: string
  race_id: string
  course_name: string
  off_time: string
  jockey_name: string
  trainer_name: string
  silk_url: string
  number: number
  current_odds: number
  ensembleProba: number
  impliedProb: number
  edge: number
  modelAgreement: number
  kellyStake: number
  entry: any
}

export function computeValueBets(
  races: Race[],
  bankroll: number,
  mastermindByHorse: Map<string, any>
): ValueBetResult[] {
  if (!races.length) return []

  const MIN_EDGE = 0.05
  const MAX_ODDS = 13.0
  const MIN_ENSEMBLE_PROBA = 0.40
  const MIN_MODEL_AGREEMENT = 2

  const results: ValueBetResult[] = []

  for (const race of races) {
    if (!race.topEntries?.length) continue

    let bestPick: ValueBetResult | null = null

    for (const entry of race.topEntries) {
      const liveOdds = Number(entry.current_odds) || 0
      const openOdds = Number(entry.opening_odds) || 0
      const odds = openOdds > 1 ? openOdds : liveOdds
      const ens = Number(entry.ensemble_proba) || 0
      if (odds <= 1 || ens <= 0 || odds > MAX_ODDS || ens < MIN_ENSEMBLE_PROBA) continue

      const impliedProb = 1 / odds
      const edge = ens - impliedProb
      if (edge < MIN_EDGE) continue

      let modelAgreement = 0
      for (const field of ['ensemble_proba', 'benter_proba', 'rf_proba', 'xgboost_proba'] as const) {
        const myVal = Number(entry[field]) || 0
        if (myVal <= 0) continue
        const isTop = race.topEntries.every((other: any) => (Number(other[field]) || 0) <= myVal)
        if (isTop) modelAgreement++
      }
      if (modelAgreement < MIN_MODEL_AGREEMENT) continue

      const kelly = edge / (odds - 1)
      const baseQuarterKelly = kelly / 4
      const mmKey = `${race.race_id}:${entry.horse_id}`
      const trustScore = mastermindByHorse.get(mmKey)?.trust_score ?? 0
      let trustMult = 0.25
      if (trustScore >= 80) trustMult = 1.5
      else if (trustScore >= 60) trustMult = 1.0
      else if (trustScore >= 30) trustMult = 0.5
      else if (trustScore > 0) trustMult = 0.25
      const fraction = Math.min(baseQuarterKelly * trustMult, 0.05)
      const rawStake = bankroll * fraction
      const stake = Math.round(rawStake * 2) / 2
      if (stake < 1 || bankroll <= 0) continue

      const pick: ValueBetResult = {
        horse_name: entry.horse_name,
        horse_id: entry.horse_id,
        race_id: race.race_id,
        course_name: race.course_name,
        off_time: race.off_time,
        jockey_name: entry.jockey_name,
        trainer_name: entry.trainer_name,
        silk_url: entry.silk_url,
        number: entry.number,
        current_odds: odds,
        ensembleProba: ens,
        impliedProb,
        edge,
        modelAgreement,
        kellyStake: stake,
        entry,
      }

      if (!bestPick || edge > bestPick.edge) {
        bestPick = pick
      }
    }

    if (bestPick) results.push(bestPick)
  }

  results.sort((a, b) => (a.off_time || '').localeCompare(b.off_time || ''))

  return results
}
