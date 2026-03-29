export function spToProfit(sp: string | null): number {
  if (!sp) return 0
  const s = sp.trim().toLowerCase()
  if (s === 'evens' || s === 'evs') return 1
  if (s.includes('/')) {
    const [num, den] = s.split('/')
    const n = parseFloat(num), d = parseFloat(den)
    if (d > 0) return n / d
  }
  const dec = parseFloat(s)
  if (!isNaN(dec) && dec > 1) return dec - 1
  return 0
}
