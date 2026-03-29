import type { RaceEntry } from '@/lib/supabase'
import { MODEL_DEFS } from '@/components/ModelBadge'

export function getModelPicksByHorseId(
  entries: RaceEntry[] | undefined
): Map<string, { label: string; color: string }[]> {
  const map = new Map<string, { label: string; color: string }[]>()
  if (!entries || entries.length === 0) return map

  for (const model of MODEL_DEFS) {
    const f = model.field as keyof RaceEntry
    let bestEntry: RaceEntry | null = null
    let bestProba = 0
    for (const entry of entries) {
      const p = entry[f] as number
      if (p > bestProba) { bestProba = p; bestEntry = entry }
    }
    if (bestEntry) {
      const id = bestEntry.horse_id
      const existing = map.get(id) || []
      existing.push({ label: model.label, color: model.color })
      map.set(id, existing)
    }
  }

  return map
}
