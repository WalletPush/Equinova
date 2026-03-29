import type { RaceRunner } from '@/components/results/types'

export function parseNonFinishOutcome(runner: RaceRunner | undefined): string {
  if (!runner) return 'N/R'
  const c = (runner.comment || '').toLowerCase()
  if (c.includes('unseated')) return 'Unseated'
  if (c.includes('fell')) return 'Fell'
  if (c.includes('pulled up')) return 'Pulled Up'
  if (c.includes('brought down')) return 'Brought Down'
  if (c.includes('refused')) return 'Refused'
  if (c.includes('slipped up')) return 'Slipped Up'
  if (c.includes('carried out')) return 'Carried Out'
  return 'DNF'
}

export function bareHorseName(name: string): string {
  return name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').toLowerCase().trim()
}

export function positionBadge(pos: number | null) {
  if (pos === 1) return { bg: 'bg-yellow-500', text: 'text-gray-900', label: '1st' }
  if (pos === 2) return { bg: 'bg-gray-400', text: 'text-gray-900', label: '2nd' }
  if (pos === 3) return { bg: 'bg-amber-600', text: 'text-white', label: '3rd' }
  if (pos) return { bg: 'bg-gray-600', text: 'text-white', label: `${pos}th` }
  return { bg: 'bg-gray-700', text: 'text-gray-400', label: '-' }
}
