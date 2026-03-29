import type { TopPick } from '@/components/top-picks/types'

export function getTrustMultiplier(trustScore: number): number {
  if (trustScore >= 80) return 1.5
  if (trustScore >= 60) return 1.0
  if (trustScore >= 30) return 0.5
  if (trustScore > 0) return 0.25
  return 0.25
}

export function computeKelly(pick: TopPick, userBankroll: number, trustScore = 0) {
  const { ensemble_proba } = pick
  const odds = (pick.opening_odds > 1 ? pick.opening_odds : pick.current_odds)
  if (odds <= 1 || userBankroll <= 0 || ensemble_proba <= 0) return null
  const implied = 1 / odds
  const edge = ensemble_proba - implied
  if (edge < 0.05) return null
  const kelly = edge / (odds - 1)
  const baseQuarterKelly = kelly / 4
  const multiplier = getTrustMultiplier(trustScore)
  const fraction = Math.min(baseQuarterKelly * multiplier, 0.05)
  const rawStake = userBankroll * fraction
  const stake = Math.round(rawStake * 2) / 2
  if (stake < 1) return null
  return { stake, fraction, edge, multiplier }
}
