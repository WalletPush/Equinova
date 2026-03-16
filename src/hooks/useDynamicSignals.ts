import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

export interface DynamicCombo {
  combo_key: string
  combo_label: string
  signal_keys: string[]
  race_type: string
  total_bets: number
  wins: number
  win_rate: number
  profit: number
  roi_pct: number
  avg_odds?: number
  p_value?: number
  status: 'proven' | 'strong' | 'emerging'
}

export interface DynamicMatch {
  horse_name: string
  horse_id: string
  race_id: string
  course: string
  off_time: string
  race_type: string
  jockey: string
  trainer: string
  current_odds: number
  silk_url: string | null
  number: number | null
  finishing_position: number | null
  matching_combos: DynamicCombo[]
  active_signals: string[]
}

interface ComboScannerResponse {
  data: {
    top_combinations: DynamicCombo[]
    today_matches: DynamicMatch[]
    meta: {
      combos_available: number
      today_races: number
      today_entries: number
      generated_at: string
    }
  }
}

export function useDynamicSignals() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dynamic-signals'],
    queryFn: async (): Promise<ComboScannerResponse | null> => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/combo-scanner`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ min_bets: 20, min_roi: 5 }),
      })
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 1000 * 60 * 15,
    retry: 1,
  })

  const matchesByHorse = useMemo(() => {
    const map = new Map<string, DynamicMatch>()
    if (!data?.data?.today_matches) return map
    for (const m of data.data.today_matches) {
      map.set(`${m.race_id}:${m.horse_id}`, m)
    }
    return map
  }, [data])

  return {
    matches: data?.data?.today_matches ?? [],
    topCombos: data?.data?.top_combinations ?? [],
    matchesByHorse,
    meta: data?.data?.meta,
    isLoading,
    error,
  }
}
