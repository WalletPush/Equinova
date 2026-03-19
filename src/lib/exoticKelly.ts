export interface Selection {
  horse_id: string
  race_id: string
  horse_name: string
  course: string
  off_time: string
  jockey: string
  trainer: string
  odds: number        // opening odds (decimal)
  ensemble_proba: number
}

export interface ComponentBet {
  subtype: 'single' | 'double' | 'treble' | 'fourfold'
  legs: Selection[]
  combinedOdds: number
  combinedProba: number
  edge: number
  kellyStake: number
  potentialReturn: number
}

export interface ExoticBetPackage {
  type: 'double' | 'patent' | 'lucky15'
  components: ComponentBet[]
  unitStake: number
  totalOutlay: number
  maxReturn: number
}

function roundTo50p(amount: number): number {
  return Math.round(amount * 2) / 2
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map(x => [x])
  if (k === arr.length) return [arr]
  const result: T[][] = []
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = combinations(arr.slice(i + 1), k - 1)
    for (const combo of rest) {
      result.push([arr[i], ...combo])
    }
  }
  return result
}

function kellyForComponent(legs: Selection[], bankroll: number): ComponentBet {
  const combinedOdds = legs.reduce((acc, l) => acc * l.odds, 1)
  const combinedProba = legs.reduce((acc, l) => acc * l.ensemble_proba, 1)
  const implied = 1 / combinedOdds
  const edge = combinedProba - implied

  let kellyStake = 0
  if (edge > 0.01 && combinedOdds > 1 && bankroll > 0) {
    const kelly = edge / (combinedOdds - 1)
    const fraction = Math.min(kelly / 4, 0.03)
    const raw = bankroll * fraction
    kellyStake = roundTo50p(raw)
    if (kellyStake < 1) kellyStake = 0
  }

  const subtype = legs.length === 1 ? 'single'
    : legs.length === 2 ? 'double'
    : legs.length === 3 ? 'treble'
    : 'fourfold'

  return {
    subtype,
    legs,
    combinedOdds,
    combinedProba,
    edge,
    kellyStake,
    potentialReturn: kellyStake * combinedOdds,
  }
}

function buildComponents(selections: Selection[], bankroll: number): ComponentBet[] {
  const components: ComponentBet[] = []
  const n = selections.length

  for (let k = 1; k <= n; k++) {
    const combos = combinations(selections, k)
    for (const combo of combos) {
      components.push(kellyForComponent(combo, bankroll))
    }
  }

  return components
}

export function buildDouble(selections: Selection[], bankroll: number): ExoticBetPackage | null {
  if (selections.length !== 2) return null

  const doubleComp = kellyForComponent(selections, bankroll)
  if (doubleComp.kellyStake < 1) return null

  return {
    type: 'double',
    components: [doubleComp],
    unitStake: doubleComp.kellyStake,
    totalOutlay: doubleComp.kellyStake,
    maxReturn: doubleComp.potentialReturn,
  }
}

export function buildPatent(selections: Selection[], bankroll: number): ExoticBetPackage | null {
  if (selections.length !== 3) return null

  const components = buildComponents(selections, bankroll)
  const qualifying = components.filter(c => c.kellyStake > 0)
  if (qualifying.length === 0) return null

  // Unit stake = smallest qualifying Kelly to avoid over-betting
  let unitStake = Math.min(...qualifying.map(c => c.kellyStake))
  const totalOutlay = unitStake * 7

  // Cap total outlay at 5% of bankroll
  const maxOutlay = bankroll * 0.05
  if (totalOutlay > maxOutlay) {
    unitStake = roundTo50p(maxOutlay / 7)
  }
  if (unitStake < 1) return null

  // Recalculate components with uniform unit stake
  const uniformComponents = components.map(c => ({
    ...c,
    kellyStake: unitStake,
    potentialReturn: unitStake * c.combinedOdds,
  }))

  const maxReturn = uniformComponents.reduce((sum, c) => sum + c.potentialReturn, 0)

  return {
    type: 'patent',
    components: uniformComponents,
    unitStake,
    totalOutlay: unitStake * 7,
    maxReturn,
  }
}

export function buildLucky15(selections: Selection[], bankroll: number): ExoticBetPackage | null {
  if (selections.length !== 4) return null

  const components = buildComponents(selections, bankroll)
  const qualifying = components.filter(c => c.kellyStake > 0)
  if (qualifying.length === 0) return null

  let unitStake = Math.min(...qualifying.map(c => c.kellyStake))
  const totalOutlay = unitStake * 15

  // Cap total outlay at 8% of bankroll
  const maxOutlay = bankroll * 0.08
  if (totalOutlay > maxOutlay) {
    unitStake = roundTo50p(maxOutlay / 15)
  }
  if (unitStake < 1) return null

  const uniformComponents = components.map(c => ({
    ...c,
    kellyStake: unitStake,
    potentialReturn: unitStake * c.combinedOdds,
  }))

  const maxReturn = uniformComponents.reduce((sum, c) => sum + c.potentialReturn, 0)

  return {
    type: 'lucky15',
    components: uniformComponents,
    unitStake,
    totalOutlay: unitStake * 15,
    maxReturn,
  }
}

export function getAvailableExotics(
  selections: Selection[],
  bankroll: number,
): ExoticBetPackage[] {
  const packages: ExoticBetPackage[] = []

  if (selections.length === 2) {
    const d = buildDouble(selections, bankroll)
    if (d) packages.push(d)
  }

  if (selections.length === 3) {
    const p = buildPatent(selections, bankroll)
    if (p) packages.push(p)
  }

  if (selections.length === 4) {
    const l = buildLucky15(selections, bankroll)
    if (l) packages.push(l)
  }

  return packages
}
