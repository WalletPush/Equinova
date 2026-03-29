import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { supabase, callSupabaseFunction, Race } from '@/lib/supabase'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { useLifetimeSignalStats } from '@/hooks/useLifetimeSignalStats'
import { useMastermind } from '@/hooks/useMastermind'
import { fetchFromSupabaseFunction } from '@/lib/api'
import { logger } from '@/lib/logger'
import { compareRaceTimes, raceTimeToMinutes, isRaceCompleted } from '@/lib/dateUtils'
import {
  Trophy,
  RefreshCw,
  Search,
  Calendar,
} from 'lucide-react'
import type { SmartSignal, PatternAlert } from '@/types/signals'
import { computeValueBets } from '@/lib/valueBets'
import { TodayBankrollSummary } from '@/components/today/TodayBankrollSummary'
import { TodayBetsPanel } from '@/components/today/TodayBetsPanel'
import { ValueBetsScannerPanel } from '@/components/today/ValueBetsScannerPanel'
import { TodaysRaceCard } from '@/components/today/TodaysRaceCard'

export function TodaysRacesPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const ukDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    return ukDate
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedRace, setExpandedRace] = useState<string | null>(null)
  const { openHorseDetail } = useHorseDetail()
  const lifetimeSignalStats = useLifetimeSignalStats()
  const { matchesByHorse: mastermindByHorse } = useMastermind(selectedDate)

  const { data: racesData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['races', selectedDate, 'today-races'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('race-data', {
        body: { date: selectedDate }
      })
      
      if (error) {
        logger.error('Error invoking race-data API:', error)
        throw error
      }
      
      if (!data.data) {
        logger.error('Race data API returned no data:', data)
        throw new Error(data.error?.message || 'Race data API failed')
      }
      
      return data.data
    },
    staleTime: 1000 * 60 * 2,
    retry: 3,
    retryDelay: 1000,
    placeholderData: keepPreviousData
  })

  const { data: raceStatsData } = useQuery({
    queryKey: ['today-race-stats', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('today-race-stats', {
        body: {}
      })
      
      if (error) {
        logger.error('Error fetching race statistics:', error)
        throw error
      }
      
      if (!data.success) {
        logger.error('Race statistics API returned error:', data.error)
        throw new Error(data.error?.message || 'Race statistics API failed')
      }
      
      return data.data
    },
    staleTime: 1000 * 60 * 5,
    retry: 3,
    retryDelay: 1000,
    enabled: selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  })

  const isToday = selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  const { data: smartSignalsData } = useQuery({
    queryKey: ['smart-signals'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('smart-signals')
      if (error) {
        logger.error('Smart signals error:', error)
        return { signals: [] }
      }
      return data
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    enabled: isToday,
    retry: 1,
  })

  const { data: patternAlertsData } = useQuery({
    queryKey: ['pattern-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pattern-alerts')
      if (error) {
        logger.error('Pattern alerts error:', error)
        return { alerts: [] }
      }
      return data
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: isToday,
    retry: 1,
  })

  const allPatternAlerts = useMemo<PatternAlert[]>(() => {
    return patternAlertsData?.alerts ?? []
  }, [patternAlertsData])

  const allSmartSignals = useMemo<SmartSignal[]>(() => {
    const signals: SmartSignal[] = smartSignalsData?.signals ?? []
    if (!signals.length) return []

    const ukNowStr = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/London',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    })
    const [nowH, nowM] = ukNowStr.split(':').map(Number)
    const nowMinutes = nowH * 60 + nowM

    return signals.filter((s) => {
      if (s.off_time) {
        const raceMinutes = raceTimeToMinutes(s.off_time)
        if (raceMinutes <= nowMinutes) return false
      }
      return true
    })
  }, [smartSignalsData, selectedDate])

  const signalHorseIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of allSmartSignals) set.add(s.horse_id)
    for (const a of allPatternAlerts) set.add(a.horse_id)
    return set
  }, [allSmartSignals, allPatternAlerts])

  const races = useMemo(() => {
    const raw: Race[] = (racesData as any)?.races || []
    const sorted = [...raw].sort((a, b) => compareRaceTimes(a.off_time, b.off_time))

    if (isToday) {
      return sorted.filter((race) => !isRaceCompleted(race.off_time, 15))
    }
    return sorted
  }, [racesData, isToday])

  const { user } = useAuth()
  const { bankroll } = useBankroll()

  const [showValueScan, setShowValueScan] = useState(false)

  const valueBets = useMemo(() => {
    return computeValueBets(races, bankroll, mastermindByHorse)
  }, [races, bankroll])

  const { data: userBetsData } = useQuery({
    queryKey: ['user-bets-today-page'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bets', { limit: 500, offset: 0 })
      return res?.data?.bets ?? []
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const userBetsSummary = useMemo(() => {
    const bets = userBetsData ?? []
    let totalPL = 0, totalStaked = 0, wins = 0, settled = 0
    for (const b of bets) {
      const amt = Number(b.bet_amount)
      totalStaked += amt
      if (b.status === 'won') { totalPL += Number(b.potential_return) - amt; wins++; settled++ }
      else if (b.status === 'lost') { totalPL -= amt; settled++ }
      else if (b.status === 'pending') { totalPL -= amt }
    }
    const startingBankroll = bankroll - totalPL
    return {
      totalPL, totalStaked, wins, settled,
      totalBets: bets.length,
      roi: startingBankroll > 0 ? (totalPL / startingBankroll) * 100 : 0,
      winRate: settled > 0 ? (wins / settled) * 100 : 0,
    }
  }, [userBetsData, bankroll])

  const todayBets = useMemo(() => {
    return (userBetsData ?? []).filter((b: any) =>
      (b.race_date ?? b.created_at ?? '').startsWith(selectedDate)
    )
  }, [userBetsData, selectedDate])

  const todayPL = useMemo(() => {
    let pl = 0
    for (const b of todayBets) {
      if (b.status === 'won') pl += Number(b.potential_return) - Number(b.bet_amount)
      else if (b.status === 'lost') pl -= Number(b.bet_amount)
    }
    return pl
  }, [todayBets])

  const todayWins = todayBets.filter((b: any) => b.status === 'won').length
  const todayPending = todayBets.filter((b: any) => b.status === 'pending').length

  const enrichmentRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (valueBets.length === 0) return
    const horsesToEnrich: { race_id: string; horse_id: string }[] = []
    for (const vb of valueBets) {
      const key = `${vb.race_id}::${vb.horse_id}`
      if (!enrichmentRef.current.has(key)) {
        horsesToEnrich.push({ race_id: vb.race_id, horse_id: vb.horse_id })
        enrichmentRef.current.add(key)
      }
    }
    if (horsesToEnrich.length > 0) {
      fetchFromSupabaseFunction('enrich-horse-odds', {
        method: 'POST',
        body: JSON.stringify({ horses: horsesToEnrich.slice(0, 20) })
      }).catch(() => {})
    }
  }, [valueBets])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate)
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load races. Please try again.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        <TodayBankrollSummary
          bankroll={bankroll}
          userBetsSummary={userBetsSummary}
          todayBetsLength={todayBets.length}
          todayWins={todayWins}
          todayPending={todayPending}
          todayPL={todayPL}
        />

        <TodayBetsPanel bets={todayBets} />

        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Today's Races</h1>
            <p className="text-gray-400 text-sm">AI-powered race predictions</p>
          </div>
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 disabled:opacity-50 flex items-center space-x-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              {races.length > 0 && (
                <button
                  onClick={() => setShowValueScan(!showValueScan)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center space-x-1.5 transition-all ${
                    showValueScan
                      ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                      : 'bg-green-500 hover:bg-green-400 text-gray-900'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Value Bets</span>
                  {valueBets.length > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      showValueScan
                        ? 'bg-green-500/30 text-green-300'
                        : 'bg-gray-900/30 text-white'
                    }`}>
                      {valueBets.length}
                    </span>
                  )}
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              />
            </div>
          </div>

          {showValueScan && (
            <ValueBetsScannerPanel
              valueBets={valueBets}
              onClose={() => setShowValueScan(false)}
              openHorseDetail={openHorseDetail}
              allPatternAlerts={allPatternAlerts}
              allSmartSignals={allSmartSignals}
            />
          )}
          
          {selectedDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) && raceStatsData && (
            <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
              <p className="text-gray-300 text-sm">
                <span className="text-yellow-400 font-medium">{raceStatsData.summary_message}</span>
              </p>
            </div>
          )}

          {(racesData as any)?.abandoned_count > 0 && (
            <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/30 flex items-center space-x-3">
              <span className="text-red-400 text-lg flex-shrink-0">&#x26A0;</span>
              <p className="text-sm">
                <span className="text-red-400 font-semibold">Meeting Abandoned</span>
                <span className="text-gray-400"> — {(racesData as any).abandoned_courses?.join(', ')} ({(racesData as any).abandoned_count} race{(racesData as any).abandoned_count > 1 ? 's' : ''} removed)</span>
              </p>
            </div>
          )}
        </div>

        {(isLoading || isRefreshing || isFetching) && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
              <span className="text-gray-400">
                {isRefreshing ? 'Refreshing races...' : 
                 isFetching ? 'Loading new date...' : 'Loading races...'}
              </span>
            </div>
          </div>
        )}

        {!isLoading && !isFetching && races.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No races found</h3>
            <p className="text-gray-500">Try selecting a different date</p>
          </div>
        )}

        <div className="space-y-2">
          {races.map((race: Race) => (
            <TodaysRaceCard
              key={race.race_id}
              race={race}
              isExpanded={expandedRace === race.race_id}
              onToggleExpand={() => setExpandedRace(expandedRace === race.race_id ? null : race.race_id)}
              openHorseDetail={openHorseDetail}
              allPatternAlerts={allPatternAlerts}
              allSmartSignals={allSmartSignals}
              lifetimeSignalStats={lifetimeSignalStats}
              mastermindByHorse={mastermindByHorse}
              signalHorseIds={signalHorseIds}
            />
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
