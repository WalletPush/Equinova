/**
 * Shared odds conversion utilities.
 * EVERY odds display in the app must use decimalToFractional().
 */

// Lookup table: maps (decimal - 1) profit to traditional UK fractional odds
const COMMON_FRACTIONS: [number, string][] = [
  [0.1,  '1/10'], [0.11, '1/9'],  [0.13, '1/8'],  [0.14, '1/7'],
  [0.17, '1/6'],  [0.2,  '1/5'],  [0.22, '2/9'],  [0.25, '1/4'],
  [0.29, '2/7'],  [0.3,  '3/10'], [0.33, '1/3'],  [0.36, '4/11'],
  [0.4,  '2/5'],  [0.44, '4/9'],  [0.45, '9/20'], [0.5,  '1/2'],
  [0.53, '8/15'], [0.57, '4/7'],  [0.6,  '3/5'],  [0.62, '8/13'],
  [0.67, '2/3'],  [0.73, '8/11'], [0.75, '3/4'],  [0.8,  '4/5'],
  [0.83, '5/6'],  [0.91, '10/11'],[1,    'EVS'],  [1.1,  '11/10'],
  [1.2,  '6/5'],  [1.25, '5/4'],  [1.3,  '13/10'],[1.33, '4/3'],
  [1.4,  '7/5'],  [1.5,  '6/4'],  [1.67, '5/3'],  [1.8,  '9/5'],
  [2,    '2/1'],  [2.25, '9/4'],  [2.5,  '5/2'],  [2.75, '11/4'],
  [3,    '3/1'],  [3.5,  '7/2'],  [4,    '4/1'],  [4.5,  '9/2'],
  [5,    '5/1'],  [5.5,  '11/2'], [6,    '6/1'],  [7,    '7/1'],
  [8,    '8/1'],  [9,    '9/1'],  [10,   '10/1'], [11,   '11/1'],
  [12,   '12/1'], [14,   '14/1'], [16,   '16/1'], [18,   '18/1'],
  [20,   '20/1'], [22,   '22/1'], [25,   '25/1'], [28,   '28/1'],
  [33,   '33/1'], [40,   '40/1'], [50,   '50/1'], [66,   '66/1'],
  [80,   '80/1'], [100,  '100/1'],
]

/**
 * Convert a decimal odds value (e.g. 5.0) to UK fractional display (e.g. "4/1").
 *
 * Handles:
 *  - number input (3.5 → "5/2")
 *  - string input ("3.5" → "5/2")
 *  - null / undefined / invalid → "TBC"
 *  - odds ≤ 1 → "EVS"
 *  - Already fractional strings ("5/2") → passed through unchanged
 */
export function decimalToFractional(dec: string | number | null | undefined): string {
  if (dec == null) return 'TBC'

  const s = String(dec).trim()
  if (!s) return 'TBC'

  // If it already looks fractional (e.g. "5/2", "11/4", "EVS"), pass through
  if (/^\d+\/\d+$/.test(s) || s.toUpperCase() === 'EVS') return s

  const d = Number(s)
  if (!Number.isFinite(d) || d <= 0) return 'TBC'
  if (d <= 1) return 'EVS'

  const profit = d - 1

  // Find closest standard fraction
  let best = COMMON_FRACTIONS[0]
  let bestDiff = Math.abs(profit - best[0])
  for (const c of COMMON_FRACTIONS) {
    const diff = Math.abs(profit - c[0])
    if (diff < bestDiff) {
      best = c
      bestDiff = diff
    }
  }

  // Allow 12% tolerance for matching to standard fractions
  if (bestDiff / Math.max(profit, 0.01) < 0.12 || bestDiff < 0.08) {
    return best[1]
  }

  // Fallback: round to nearest integer/1
  const rounded = Math.round(profit)
  return rounded <= 0 ? 'EVS' : `${rounded}/1`
}

/**
 * Format odds for display — always fractional.
 * Use this as the single entry point for ALL odds rendering.
 * Accepts the raw decimal value from DB and returns the fractional string.
 */
export function formatOdds(dec: string | number | null | undefined): string {
  return decimalToFractional(dec)
}
