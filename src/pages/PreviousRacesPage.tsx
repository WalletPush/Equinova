import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useLifetimeSignalStats } from '@/hooks/useLifetimeSignalStats'
import { useMastermind } from '@/hooks/useMastermind'
import { useBankroll } from '@/hooks/useBankroll'
import { getUKDate, raceTimeToMinutes } from '@/lib/dateUtils'
import {
  ResultsTopPicksPerformance,
  CompletedRaceCard,
  DailyIntelligenceReport,
  PendingRacesSection,
  type ResultsRace,
} from '@/components/results'
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
} from 'lucide-react'

export function PreviousRacesPage() {
  const [selectedDate, setSelectedDate] = useState(() => getUKDate())
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRaces, setExpandedRaces] = useState<Set<string>>(new Set())
  const lifetimeSignalStats = useLifetimeSignalStats()
  const { matches: mastermindMatches, isLoading: mastermindLoading } = useMastermind(selectedDate)
  const { bankroll } = useBankroll()

  const [ukTime, setUkTime] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )
  const ukToday = getUKDate()
  const isToday = selectedDate === ukToday

  useEffect(() => {
    if (!isToday) return
    const tick = setInterval(() => {
      setUkTime(
        new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }, 1000)
    return () => clearInterval(tick)
  }, [isToday])

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisExpanded, setAnalysisExpanded] = useState(true)
  const queryClient = useQueryClient()

  const { data: analysisData } = useQuery({
    queryKey: ['daily-analysis', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_analysis')
        .select('*')
        .eq('date', selectedDate)
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5
  })

  const runAnalysis = async () => {
    setIsAnalyzing(true)
    try {
      const { data, error } = await supabase.functions.invoke('daily-race-analysis', {
        body: { date: selectedDate }
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['daily-analysis', selectedDate] })
    } catch (err) {
      logger.error('Analysis failed:', err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const { data: racesData, isLoading, error, isFetching } = useQuery({
    queryKey: ['results-races', selectedDate],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('race-data', {
        body: { date: selectedDate }
      })
      if (error) throw error
      if (!data?.data) throw new Error(data?.error?.message || 'Race data API failed')
      return data.data
    },
    staleTime: isToday ? 1000 * 30 : 1000 * 60 * 10,
    refetchInterval: isToday ? 60_000 : false,
    retry: 3,
    retryDelay: 1000,
    placeholderData: keepPreviousData
  })

  const allRaces: ResultsRace[] = (racesData as any)?.races || []

  const { completed, pending } = useMemo(() => {
    const matchesSearch = (race: ResultsRace) =>
      race.course_name.toLowerCase().includes(searchTerm.toLowerCase())

    const done: ResultsRace[] = []
    const waiting: ResultsRace[] = []

    for (const race of allRaces) {
      if (!matchesSearch(race)) continue
      if (race.hasResults && race.runners && race.runners.length > 0) {
        done.push(race)
      } else {
        waiting.push(race)
      }
    }

    done.sort((a, b) => raceTimeToMinutes(b.off_time) - raceTimeToMinutes(a.off_time))
    waiting.sort((a, b) => raceTimeToMinutes(a.off_time) - raceTimeToMinutes(b.off_time))

    return { completed: done, pending: waiting }
  }, [allRaces, searchTerm])

  const toggleExpand = (raceId: string) => {
    setExpandedRaces(prev => {
      const next = new Set(prev)
      if (next.has(raceId)) next.delete(raceId)
      else next.add(raceId)
      return next
    })
  }

  const goToPreviousDay = () => {
    const date = new Date(selectedDate + 'T12:00:00')
    date.setDate(date.getDate() - 1)
    setSelectedDate(date.toLocaleDateString('en-CA'))
  }

  const goToNextDay = () => {
    if (selectedDate < ukToday) {
      const date = new Date(selectedDate + 'T12:00:00')
      date.setDate(date.getDate() + 1)
      setSelectedDate(date.toLocaleDateString('en-CA'))
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })

  const canGoNext = selectedDate < ukToday

  return (
    <AppLayout>
      <div className="p-4 space-y-5">

        {/* ── Date Navigation ────────────────────────────────── */}
        <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <button onClick={goToPreviousDay} className="p-2 text-gray-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-lg font-semibold text-white">{formatDate(selectedDate)}</div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={ukToday}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm mt-1 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              />
            </div>
            <button
              onClick={goToNextDay}
              disabled={!canGoNext}
              className={`p-2 transition-colors ${canGoNext ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Search ──────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by course name..."
            className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
          />
        </div>

        {/* ── Header ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              {isToday ? "Today's Results" : 'Results'}
            </h1>
            {isToday && (
              <div className="flex items-center space-x-2 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-1.5">
                <Clock className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400 font-mono text-sm font-medium">{ukTime}</span>
                <span className="text-gray-500 text-xs">UK</span>
              </div>
            )}
          </div>

          {!isLoading && allRaces.length > 0 && (
            <div className="mt-3 flex items-center space-x-3">
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-yellow-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((completed.length / allRaces.length) * 100)}%` }}
                />
              </div>
              <span className="text-sm text-gray-400 whitespace-nowrap">
                <span className="text-yellow-400 font-medium">{completed.length}</span> of {allRaces.length} races completed
              </span>
            </div>
          )}
        </div>

        {/* ── Top Picks Performance ──────────────────────────── */}
        {completed.length > 0 && (
          <ResultsTopPicksPerformance
            completed={completed}
            mastermindMatches={mastermindMatches}
            mastermindLoading={mastermindLoading}
            bankroll={bankroll}
          />
        )}

        {/* ── Daily Intelligence Panel ─────────────────────────── */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <DailyIntelligenceReport
              analysisData={analysisData}
              expanded={analysisExpanded}
              onToggleExpanded={() => setAnalysisExpanded(!analysisExpanded)}
              onReRunAnalysis={runAnalysis}
              isAnalyzing={isAnalyzing}
              pendingCount={pending.length}
            />
          </div>
        )}

        {/* ── Abandoned Banner ────────────────────────────────── */}
        {(racesData as any)?.abandoned_count > 0 && (
          <div className="bg-red-500/10 rounded-lg px-4 py-3 border border-red-500/30 flex items-center space-x-3">
            <span className="text-red-400 text-lg flex-shrink-0">&#x26A0;</span>
            <p className="text-sm">
              <span className="text-red-400 font-semibold">Meeting Abandoned</span>
              <span className="text-gray-400"> — {(racesData as any).abandoned_courses?.join(', ')} ({(racesData as any).abandoned_count} race{(racesData as any).abandoned_count > 1 ? 's' : ''} removed)</span>
            </p>
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────── */}
        {(isLoading || isFetching) && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
              <span className="text-gray-400">{isFetching && !isLoading ? 'Refreshing...' : 'Loading results...'}</span>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400">Failed to load results. Please try again.</p>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────── */}
        {!isLoading && !isFetching && completed.length === 0 && pending.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {searchTerm ? 'No races found' : isToday ? 'No Results Yet' : 'No races on this date'}
            </h3>
            <p className="text-gray-500">
              {searchTerm ? 'Try a different search term' : isToday ? 'Results will appear here as races finish' : 'Try selecting a different date'}
            </p>
          </div>
        )}

        {/* ── Completed Races ─────────────────────────────────── */}
        {completed.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <h2 className="text-base font-semibold text-gray-300">Completed Races</h2>
            </div>

            {completed.map((race) => (
              <CompletedRaceCard
                key={race.race_id}
                race={race}
                isExpanded={expandedRaces.has(race.race_id)}
                onToggleExpand={() => toggleExpand(race.race_id)}
                lifetimeSignalStats={lifetimeSignalStats}
              />
            ))}
          </div>
        )}

        {/* ── Pending Races (today only) ──────────────────────── */}
        {isToday && pending.length > 0 && (
          <PendingRacesSection races={pending} />
        )}

        {/* ── Auto-refresh notice ─────────────────────────────── */}
        {isToday && !isLoading && allRaces.length > 0 && (
          <p className="text-center text-xs text-gray-600 pb-4">
            Results auto-refresh every 60 seconds
          </p>
        )}
      </div>
    </AppLayout>
  )
}
