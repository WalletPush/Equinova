import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { HistoricalSignalStats } from '@/lib/confluenceScore'

export function useLifetimeSignalStats() {
  const { data: raw } = useQuery({
    queryKey: ['lifetime-signal-stats'],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/performance-summary`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ start_date: '2024-01-01', end_date: today, race_type: 'all', model: 'all', signal: 'all' }),
      })
      if (!res.ok) return null
      const json = await res.json()
      return json?.data ?? null
    },
    staleTime: 1000 * 60 * 60,
    retry: 0,
  })

  const stats = useMemo<Record<string, HistoricalSignalStats> | undefined>(() => {
    if (!raw?.signals?.aggregated) return undefined
    const map: Record<string, HistoricalSignalStats> = {}
    for (const sig of raw.signals.aggregated) {
      map[sig.signal_type] = { win_rate: sig.win_rate, profit: sig.profit, total_bets: sig.total_bets, roi_pct: sig.roi_pct }
    }
    return map
  }, [raw])

  return stats
}
