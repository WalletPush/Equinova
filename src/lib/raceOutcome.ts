export function parseOutcome(comment: string): string {
  const c = comment.toLowerCase()
  if (c.includes('fell')) return 'FELL'
  if (c.includes('pulled up')) return 'PU'
  if (c.includes('unseated')) return 'UR'
  if (c.includes('brought down')) return 'BD'
  if (c.includes('refused')) return 'REF'
  if (c.includes('carried out')) return 'CO'
  if (c.includes('ran out')) return 'RO'
  if (c.includes('slipped up')) return 'SU'
  return 'DNF'
}
