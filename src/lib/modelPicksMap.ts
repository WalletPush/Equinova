import { MODEL_DEFS } from '@/components/ModelBadge'
import type { RaceEntry } from '@/lib/supabase'
import type { RaceRunner, ResultsRace } from '@/components/results/types'
import { bareHorseName } from '@/lib/raceRunnerUtils'

export function getModelPicksMap(
  entries: RaceEntry[] | undefined,
  runners: RaceRunner[] | undefined
): Map<string, { label: string; color: string }[]> {
  const map = new Map<string, { label: string; color: string }[]>()
  if (!entries || entries.length === 0) return map

  const ranNames = runners && runners.length > 0
    ? new Set(runners.map(r => bareHorseName(r.horse)))
    : null

  for (const model of MODEL_DEFS) {
    const f = model.field as keyof typeof entries[0]
    const sorted = [...entries]
      .filter(e => (e[f] as number) > 0)
      .sort((a, b) => (b[f] as number) - (a[f] as number))

    let pick: typeof entries[0] | null = null
    if (ranNames) {
      for (const entry of sorted) {
        const bn = bareHorseName(entry.horse_name)
        let found = ranNames.has(bn)
        if (!found) {
          for (const rn of ranNames) {
            if (rn.startsWith(bn) || bn.startsWith(rn)) { found = true; break }
          }
        }
        if (found) { pick = entry; break }
      }
    } else {
      pick = sorted[0] || null
    }

    if (pick) {
      const bn = bareHorseName(pick.horse_name)
      const existing = map.get(bn) || []
      existing.push({ label: model.label, color: model.color })
      map.set(bn, existing)
    }
  }

  return map
}

export function getMlPredictedWinner(race: ResultsRace): RaceEntry | null {
  if (!race.topEntries || race.topEntries.length === 0) return null

  if (race.runners && race.runners.length > 0) {
    const ranNames = new Set(race.runners.map(r => bareHorseName(r.horse)))

    for (const entry of race.topEntries) {
      const bareName = bareHorseName(entry.horse_name)
      let found = ranNames.has(bareName)
      if (!found) {
        for (const rn of ranNames) {
          if (rn.startsWith(bareName) || bareName.startsWith(rn)) {
            found = true
            break
          }
        }
      }
      if (found) return entry
    }

    return null
  }

  return race.topEntries[0]
}
