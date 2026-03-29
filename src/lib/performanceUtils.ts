import type { UserBet, PeriodFilter } from '@/components/performance/types'

export function fmtPL(v: number) {
  return `${v >= 0 ? '+' : '-'}£${Math.abs(v).toFixed(2)}`
}

export function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatMonthLabel(monthStr: string) {
  const [year, month] = monthStr.split('-')
  const d = new Date(Number(year), Number(month) - 1)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function settledPLForBet(b: UserBet): number {
  if (b.status === 'won') return Number(b.potential_return) - Number(b.bet_amount)
  if (b.status === 'lost') return -Number(b.bet_amount)
  return 0
}

export const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '14d', label: '14D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'lifetime', label: 'All' },
]
