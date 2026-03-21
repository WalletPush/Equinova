import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'

export interface PatternMatch {
  pattern_id: string
  pattern_label: string
  signal_keys: string[]
  status: string
  d21_bets: number
  d21_wins: number
  d21_roi_pct: number
  d21_profit: number
  total_bets: number
  wins: number
  win_rate: number
  roi_pct: number
  confidence_score: number
  pattern_type: string
  pqs: number
  stability_windows: number
  outlier_trimmed_roi: number
  drawdown_health: number
  failure_modes: string[]
}

export interface BetQuestions {
  fair_probability: number
  market_implied: number
  edge_pct: number
  evidence_strength: number
  trust_tier: string
  worth_betting: boolean
  stake_fraction: number
}

export interface MastermindMatch {
  horse_name: string
  horse_id: string
  race_id: string
  course: string
  off_time: string
  segment: string
  current_odds: number
  opening_odds: number
  ensemble_proba: number
  silk_url: string | null
  number: number | null
  jockey: string
  trainer: string
  matching_patterns: PatternMatch[]
  anti_patterns: PatternMatch[]
  active_signals: string[]
  active_pattern_count: number
  total_pattern_count: number
  is_vetoed: boolean
  veto_reason: string | null
  edge_trust_score: number
  trust_tier: string
  kelly_multiplier: number
  failure_modes: string[]
  bet_questions: BetQuestions
}

interface MastermindResponse {
  data: {
    matches: MastermindMatch[]
    patterns_loaded: number
    anti_patterns_loaded: number
    meta: {
      today_races: number
      today_entries: number
      total_matches: number
      vetoed_count: number
      generated_at: string
    }
  }
}

export function useMastermind() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['mastermind-scanner'],
    queryFn: async (): Promise<MastermindResponse | null> => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mastermind-scanner`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 1000 * 60 * 15,
    retry: 1,
  })

  const matchesByHorse = useMemo(() => {
    const map = new Map<string, MastermindMatch>()
    if (!data?.data?.matches) return map
    for (const m of data.data.matches) {
      map.set(`${m.race_id}:${m.horse_id}`, m)
    }
    return map
  }, [data])

  return {
    matches: data?.data?.matches ?? [],
    matchesByHorse,
    meta: data?.data?.meta,
    patternsLoaded: data?.data?.patterns_loaded ?? 0,
    isLoading,
    error,
    refetch,
  }
}

export function useAutoBetSettings() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['auto-bet-settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { auto_bet_enabled: false }

      const { data: settings } = await supabase
        .from('user_auto_bet_settings')
        .select('auto_bet_enabled')
        .eq('user_id', user.id)
        .single()

      return settings ?? { auto_bet_enabled: false }
    },
    staleTime: 1000 * 60 * 5,
  })

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('user_auto_bet_settings')
        .upsert({
          user_id: user.id,
          auto_bet_enabled: enabled,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-bet-settings'] })
    },
  })

  return {
    autoBetEnabled: data?.auto_bet_enabled ?? false,
    isLoading,
    toggleAutoBet: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
  }
}
