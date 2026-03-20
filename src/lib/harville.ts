/**
 * Harville formula: derives forecast (1st+2nd) and tricast (1st+2nd+3rd)
 * probabilities from individual win probabilities.
 *
 * P(A 1st, B 2nd) = P(A) × P(B) / (1 − P(A))
 * P(A 1st, B 2nd, C 3rd) = P(A) × P(B) / (1 − P(A)) × P(C) / (1 − P(A) − P(B))
 */

export interface Runner {
  horse_id: string
  horse_name: string
  win_prob: number      // model's calibrated win probability
  market_prob: number   // implied from odds (1/odds, overround-normalised)
  odds: number          // decimal odds (opening or current)
  silk_url?: string | null
  number?: number | null
  jockey?: string
  trainer?: string
}

export interface ForecastPick {
  first: Runner
  second: Runner
  harville_prob: number
  market_prob: number
  fair_odds: number
  estimated_market_odds: number
  edge: number
  edge_pct: number
  kelly_stake: number
}

export interface TricastPick {
  first: Runner
  second: Runner
  third: Runner
  harville_prob: number
  market_prob: number
  fair_odds: number
  estimated_market_odds: number
  edge: number
  edge_pct: number
  kelly_stake: number
}

function harvilleForecast(pA: number, pB: number): number {
  if (pA >= 1 || pA <= 0 || pB <= 0) return 0
  return pA * (pB / (1 - pA))
}

function harvilleTricast(pA: number, pB: number, pC: number): number {
  if (pA >= 1 || pA <= 0 || pB <= 0 || pC <= 0) return 0
  const denom1 = 1 - pA
  if (denom1 <= 0) return 0
  const denom2 = 1 - pA - pB
  if (denom2 <= 0) return 0
  return pA * (pB / denom1) * (pC / denom2)
}

function normaliseProbs(runners: Runner[], key: 'win_prob' | 'market_prob'): Map<string, number> {
  const total = runners.reduce((s, r) => s + r[key], 0)
  const map = new Map<string, number>()
  if (total <= 0) return map
  for (const r of runners) map.set(r.horse_id, r[key] / total)
  return map
}

function roundTo50p(amount: number): number {
  return Math.round(amount * 2) / 2
}

export function computeForecasts(
  runners: Runner[],
  bankroll: number,
  topN = 10,
): ForecastPick[] {
  if (runners.length < 2) return []

  const modelNorm = normaliseProbs(runners, 'win_prob')
  const marketNorm = normaliseProbs(runners, 'market_prob')

  const top = [...runners].sort((a, b) => b.win_prob - a.win_prob).slice(0, 8)
  const picks: ForecastPick[] = []

  for (const a of top) {
    for (const b of top) {
      if (a.horse_id === b.horse_id) continue

      const pA = modelNorm.get(a.horse_id) || 0
      const pB = modelNorm.get(b.horse_id) || 0
      const mA = marketNorm.get(a.horse_id) || 0
      const mB = marketNorm.get(b.horse_id) || 0

      const hProb = harvilleForecast(pA, pB)
      const mProb = harvilleForecast(mA, mB)

      if (hProb <= 0 || mProb <= 0) continue

      const fairOdds = 1 / hProb
      const estMarketOdds = 1 / mProb
      const edge = hProb - mProb
      const edgePct = edge * 100

      let kellyStake = 0
      if (edge > 0.005 && estMarketOdds > 1 && bankroll > 0) {
        const kelly = edge / (estMarketOdds - 1)
        const fraction = Math.min(kelly / 6, 0.02)
        const raw = bankroll * fraction
        kellyStake = roundTo50p(raw)
        if (kellyStake < 1) kellyStake = 0
      }

      picks.push({
        first: a,
        second: b,
        harville_prob: hProb,
        market_prob: mProb,
        fair_odds: fairOdds,
        estimated_market_odds: estMarketOdds,
        edge,
        edge_pct: edgePct,
        kelly_stake: kellyStake,
      })
    }
  }

  picks.sort((a, b) => b.edge - a.edge)
  return picks.slice(0, topN)
}

export function computeTricasts(
  runners: Runner[],
  bankroll: number,
  topN = 5,
): TricastPick[] {
  if (runners.length < 3) return []

  const modelNorm = normaliseProbs(runners, 'win_prob')
  const marketNorm = normaliseProbs(runners, 'market_prob')

  const top = [...runners].sort((a, b) => b.win_prob - a.win_prob).slice(0, 6)
  const picks: TricastPick[] = []

  for (const a of top) {
    for (const b of top) {
      if (b.horse_id === a.horse_id) continue
      for (const c of top) {
        if (c.horse_id === a.horse_id || c.horse_id === b.horse_id) continue

        const pA = modelNorm.get(a.horse_id) || 0
        const pB = modelNorm.get(b.horse_id) || 0
        const pC = modelNorm.get(c.horse_id) || 0
        const mA = marketNorm.get(a.horse_id) || 0
        const mB = marketNorm.get(b.horse_id) || 0
        const mC = marketNorm.get(c.horse_id) || 0

        const hProb = harvilleTricast(pA, pB, pC)
        const mProb = harvilleTricast(mA, mB, mC)

        if (hProb <= 0 || mProb <= 0) continue

        const fairOdds = 1 / hProb
        const estMarketOdds = 1 / mProb
        const edge = hProb - mProb
        const edgePct = edge * 100

        let kellyStake = 0
        if (edge > 0.003 && estMarketOdds > 1 && bankroll > 0) {
          const kelly = edge / (estMarketOdds - 1)
          const fraction = Math.min(kelly / 8, 0.015)
          const raw = bankroll * fraction
          kellyStake = roundTo50p(raw)
          if (kellyStake < 1) kellyStake = 0
        }

        picks.push({
          first: a,
          second: b,
          third: c,
          harville_prob: hProb,
          market_prob: mProb,
          fair_odds: fairOdds,
          estimated_market_odds: estMarketOdds,
          edge,
          edge_pct: edgePct,
          kelly_stake: kellyStake,
        })
      }
    }
  }

  picks.sort((a, b) => b.edge - a.edge)
  return picks.slice(0, topN)
}

// ─── Exacta (Reverse Forecast): any order, 2 permutations ──────────────

export interface ExactaPick {
  horses: [Runner, Runner]
  harville_prob: number
  market_prob: number
  fair_odds: number
  estimated_market_odds: number
  edge: number
  edge_pct: number
  kelly_unit_stake: number
  total_stake: number
  num_lines: 2
}

export function computeExactas(
  runners: Runner[],
  bankroll: number,
  topN = 5,
): ExactaPick[] {
  if (runners.length < 2) return []

  const modelNorm = normaliseProbs(runners, 'win_prob')
  const marketNorm = normaliseProbs(runners, 'market_prob')
  const seen = new Set<string>()
  const top = [...runners].sort((a, b) => b.win_prob - a.win_prob).slice(0, 8)
  const picks: ExactaPick[] = []

  for (const a of top) {
    for (const b of top) {
      if (a.horse_id === b.horse_id) continue
      const pairKey = [a.horse_id, b.horse_id].sort().join(':')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      const pA = modelNorm.get(a.horse_id) || 0
      const pB = modelNorm.get(b.horse_id) || 0
      const mA = marketNorm.get(a.horse_id) || 0
      const mB = marketNorm.get(b.horse_id) || 0

      const hProb = harvilleForecast(pA, pB) + harvilleForecast(pB, pA)
      const mProb = harvilleForecast(mA, mB) + harvilleForecast(mB, mA)

      if (hProb <= 0 || mProb <= 0) continue

      const fairOdds = 1 / hProb
      const estMarketOdds = 1 / mProb
      const edge = hProb - mProb
      const edgePct = edge * 100

      let kellyUnit = 0
      if (edge > 0.005 && estMarketOdds > 1 && bankroll > 0) {
        const kelly = edge / (estMarketOdds - 1)
        const fraction = Math.min(kelly / 6, 0.02)
        const raw = bankroll * fraction
        kellyUnit = roundTo50p(raw)
        if (kellyUnit < 1) kellyUnit = 0
      }

      picks.push({
        horses: [a, b],
        harville_prob: hProb,
        market_prob: mProb,
        fair_odds: fairOdds,
        estimated_market_odds: estMarketOdds,
        edge,
        edge_pct: edgePct,
        kelly_unit_stake: kellyUnit,
        total_stake: kellyUnit * 2,
        num_lines: 2,
      })
    }
  }

  picks.sort((a, b) => b.edge - a.edge)
  return picks.slice(0, topN)
}

// ─── Trifecta (Combination Tricast): any order, 6 permutations ─────────

export interface TrifectaPick {
  horses: [Runner, Runner, Runner]
  harville_prob: number
  market_prob: number
  fair_odds: number
  estimated_market_odds: number
  edge: number
  edge_pct: number
  kelly_unit_stake: number
  total_stake: number
  num_lines: 6
}

export function computeTrifectas(
  runners: Runner[],
  bankroll: number,
  topN = 3,
): TrifectaPick[] {
  if (runners.length < 3) return []

  const modelNorm = normaliseProbs(runners, 'win_prob')
  const marketNorm = normaliseProbs(runners, 'market_prob')
  const seen = new Set<string>()
  const top = [...runners].sort((a, b) => b.win_prob - a.win_prob).slice(0, 6)
  const picks: TrifectaPick[] = []

  for (const a of top) {
    for (const b of top) {
      if (b.horse_id === a.horse_id) continue
      for (const c of top) {
        if (c.horse_id === a.horse_id || c.horse_id === b.horse_id) continue

        const trioKey = [a.horse_id, b.horse_id, c.horse_id].sort().join(':')
        if (seen.has(trioKey)) continue
        seen.add(trioKey)

        const pA = modelNorm.get(a.horse_id) || 0
        const pB = modelNorm.get(b.horse_id) || 0
        const pC = modelNorm.get(c.horse_id) || 0
        const mA = marketNorm.get(a.horse_id) || 0
        const mB = marketNorm.get(b.horse_id) || 0
        const mC = marketNorm.get(c.horse_id) || 0

        const hProb =
          harvilleTricast(pA, pB, pC) + harvilleTricast(pA, pC, pB) +
          harvilleTricast(pB, pA, pC) + harvilleTricast(pB, pC, pA) +
          harvilleTricast(pC, pA, pB) + harvilleTricast(pC, pB, pA)
        const mProb =
          harvilleTricast(mA, mB, mC) + harvilleTricast(mA, mC, mB) +
          harvilleTricast(mB, mA, mC) + harvilleTricast(mB, mC, mA) +
          harvilleTricast(mC, mA, mB) + harvilleTricast(mC, mB, mA)

        if (hProb <= 0 || mProb <= 0) continue

        const fairOdds = 1 / hProb
        const estMarketOdds = 1 / mProb
        const edge = hProb - mProb
        const edgePct = edge * 100

        let kellyUnit = 0
        if (edge > 0.003 && estMarketOdds > 1 && bankroll > 0) {
          const kelly = edge / (estMarketOdds - 1)
          const fraction = Math.min(kelly / 8, 0.015)
          const raw = bankroll * fraction
          kellyUnit = roundTo50p(raw)
          if (kellyUnit < 1) kellyUnit = 0
        }

        picks.push({
          horses: [a, b, c],
          harville_prob: hProb,
          market_prob: mProb,
          fair_odds: fairOdds,
          estimated_market_odds: estMarketOdds,
          edge,
          edge_pct: edgePct,
          kelly_unit_stake: kellyUnit,
          total_stake: kellyUnit * 6,
          num_lines: 6,
        })
      }
    }
  }

  picks.sort((a, b) => b.edge - a.edge)
  return picks.slice(0, topN)
}

// ─── Combined race exotics ─────────────────────────────────────────────

export interface RaceExotics {
  race_id: string
  course: string
  off_time: string
  race_type: string
  field_size: number
  forecasts: ForecastPick[]
  tricasts: TricastPick[]
  exactas: ExactaPick[]
  trifectas: TrifectaPick[]
}

export function computeRaceExotics(
  race_id: string,
  course: string,
  off_time: string,
  race_type: string,
  runners: Runner[],
  bankroll: number,
): RaceExotics | null {
  if (runners.length < 3) return null

  const forecasts = computeForecasts(runners, bankroll, 5)
    .filter(f => f.kelly_stake > 0)
  const tricasts = computeTricasts(runners, bankroll, 3)
    .filter(t => t.kelly_stake > 0)
  const exactas = computeExactas(runners, bankroll, 5)
    .filter(e => e.total_stake > 0)
  const trifectas = computeTrifectas(runners, bankroll, 3)
    .filter(t => t.total_stake > 0)

  // Deduplicate: for each pair/trio, keep only the bet style with higher EV/£
  const pairKey = (a: string, b: string) => [a, b].sort().join(':')
  const trioKey = (a: string, b: string, c: string) => [a, b, c].sort().join(':')

  // --- Forecasts vs Exactas ---
  // Build map of best straight forecast EV per unordered pair
  const straightPairEV = new Map<string, number>()
  for (const fc of forecasts) {
    const key = pairKey(fc.first.horse_id, fc.second.horse_id)
    const ev = fc.harville_prob * fc.estimated_market_odds - 1
    const existing = straightPairEV.get(key)
    if (existing === undefined || ev > existing) straightPairEV.set(key, ev)
  }

  const pairsWonByExacta = new Set<string>()
  const dedupedExactas = exactas.filter(ex => {
    const key = pairKey(ex.horses[0].horse_id, ex.horses[1].horse_id)
    const exactaEV = ex.harville_prob * (ex.estimated_market_odds / ex.num_lines) - 1
    const bestStraightEV = straightPairEV.get(key) ?? -Infinity
    if (exactaEV > bestStraightEV) {
      pairsWonByExacta.add(key)
      return true
    }
    return false
  })

  const dedupedForecasts = forecasts.filter(fc => {
    const key = pairKey(fc.first.horse_id, fc.second.horse_id)
    return !pairsWonByExacta.has(key)
  })

  // --- Tricasts vs Trifectas ---
  const straightTrioEV = new Map<string, number>()
  for (const tc of tricasts) {
    const key = trioKey(tc.first.horse_id, tc.second.horse_id, tc.third.horse_id)
    const ev = tc.harville_prob * tc.estimated_market_odds - 1
    const existing = straightTrioEV.get(key)
    if (existing === undefined || ev > existing) straightTrioEV.set(key, ev)
  }

  const triosWonByTrifecta = new Set<string>()
  const dedupedTrifectas = trifectas.filter(tf => {
    const key = trioKey(tf.horses[0].horse_id, tf.horses[1].horse_id, tf.horses[2].horse_id)
    const trifectaEV = tf.harville_prob * (tf.estimated_market_odds / tf.num_lines) - 1
    const bestStraightEV = straightTrioEV.get(key) ?? -Infinity
    if (trifectaEV > bestStraightEV) {
      triosWonByTrifecta.add(key)
      return true
    }
    return false
  })

  const dedupedTricasts = tricasts.filter(tc => {
    const key = trioKey(tc.first.horse_id, tc.second.horse_id, tc.third.horse_id)
    return !triosWonByTrifecta.has(key)
  })

  if (dedupedForecasts.length === 0 && dedupedTricasts.length === 0 && dedupedExactas.length === 0 && dedupedTrifectas.length === 0) return null

  return {
    race_id,
    course,
    off_time,
    race_type,
    field_size: runners.length,
    forecasts: dedupedForecasts,
    tricasts: dedupedTricasts,
    exactas: dedupedExactas,
    trifectas: dedupedTrifectas,
  }
}
