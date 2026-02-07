/**
 * Probability normalization utilities.
 *
 * Raw ML model outputs are per-horse confidence scores (0-1) that do NOT sum
 * to 100% across a race field. This module provides helpers to normalize them
 * into true win probabilities that sum to ~100%.
 *
 * Formula:  normalizedProb(horse) = rawProb(horse) / Σ rawProb(all horses)
 */

export type ProbaField =
  | 'ensemble_proba'
  | 'benter_proba'
  | 'mlp_proba'
  | 'rf_proba'
  | 'xgboost_proba'

const ALL_PROBA_FIELDS: ProbaField[] = [
  'ensemble_proba',
  'benter_proba',
  'mlp_proba',
  'rf_proba',
  'xgboost_proba',
]

/**
 * Normalize a single probability field across all entries in a race.
 * Returns a Map from horse identifier → normalized probability (0-1, sums to ~1).
 */
export function normalizeField<T extends Record<string, any>>(
  entries: T[],
  field: ProbaField,
  idField: string = 'horse_id'
): Map<string, number> {
  const map = new Map<string, number>()
  const sum = entries.reduce((acc, e) => acc + (Number(e[field]) || 0), 0)

  for (const e of entries) {
    const raw = Number(e[field]) || 0
    map.set(String(e[idField]), sum > 0 ? raw / sum : 0)
  }

  return map
}

/**
 * Normalize all five model fields + ensemble at once.
 * Returns an object keyed by ProbaField, each value a Map<horseId, normalizedProb>.
 */
export function normalizeAllModels<T extends Record<string, any>>(
  entries: T[],
  idField: string = 'horse_id'
): Record<ProbaField, Map<string, number>> {
  const result = {} as Record<ProbaField, Map<string, number>>
  for (const f of ALL_PROBA_FIELDS) {
    result[f] = normalizeField(entries, f, idField)
  }
  return result
}

/**
 * Quick helper: normalize ensemble_proba for an array of entries and return
 * the entries augmented with a `normalized_ensemble` number field.
 * Useful for race lists where you just need the headline figure.
 */
export function withNormalizedEnsemble<T extends Record<string, any>>(
  entries: T[],
  idField: string = 'horse_id'
): (T & { normalized_ensemble: number })[] {
  const map = normalizeField(entries, 'ensemble_proba', idField)
  return entries.map((e) => ({
    ...e,
    normalized_ensemble: map.get(String(e[idField])) ?? 0,
  }))
}

// ─── Display helpers for normalized probabilities ───────────────────

/**
 * Confidence color for normalized win probabilities.
 * Thresholds are calibrated for real race fields (5-20 runners).
 */
export function getNormalizedColor(prob: number): string {
  if (prob >= 0.25) return 'text-green-400'
  if (prob >= 0.12) return 'text-yellow-400'
  return 'text-gray-400'
}

/**
 * Star rating for normalized win probabilities (1-5 stars).
 */
export function getNormalizedStars(prob: number): number {
  if (prob >= 0.30) return 5
  if (prob >= 0.22) return 4
  if (prob >= 0.14) return 3
  if (prob >= 0.08) return 2
  return 1
}

/**
 * Format a normalized probability as a percentage string.
 */
export function formatNormalized(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`
}
