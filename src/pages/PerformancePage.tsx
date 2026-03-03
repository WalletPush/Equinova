import React, { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import {
  PerformanceFiltersBar,
  SIGNAL_LABELS,
  type PerformanceFilters,
} from '@/components/performance/PerformanceFilters'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Zap,
  Download,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Trophy,
  DollarSign,
  Percent,
  Activity,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

interface ModelStats {
  total_picks: number
  wins: number
  top3: number
  win_rate: number
  top3_rate: number
  profit: number
  roi_pct: number
}

interface SignalStats {
  signal_type: string
  total_bets: number
  wins: number
  win_rate: number
  profit: number
  roi_pct: number
}

interface PerformanceData {
  filters: any
  dates_included: number
  races_included: number
  ml_models: {
    aggregated: Record<string, ModelStats>
    by_date: Record<string, Record<string, ModelStats>>
  }
  signals: {
    aggregated: SignalStats[]
    by_date: Record<string, SignalStats[]>
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getUKDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function getDateRange(period: string, customStart: string, customEnd: string): { start: string; end: string } {
  const today = getUKDateString()
  if (period === 'custom') return { start: customStart || today, end: customEnd || today }
  if (period === 'lifetime') return { start: '2024-01-01', end: today }
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start: start.toISOString().split('T')[0], end: today }
}

const MODEL_DISPLAY: Record<string, { label: string; color: string }> = {
  benter: { label: 'Benter', color: 'text-purple-400' },
  rf: { label: 'RF', color: 'text-blue-400' },
  mlp: { label: 'MLP', color: 'text-green-400' },
  xgboost: { label: 'XGB', color: 'text-orange-400' },
  ensemble: { label: 'ENS', color: 'text-cyan-400' },
}

function formatProfit(v: number): string {
  return `${v >= 0 ? '+' : ''}£${v.toFixed(2)}`
}

function formatRoi(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

// ─── CSV Export ──────────────────────────────────────────────────────

function exportCSV(data: PerformanceData, filters: PerformanceFilters) {
  const lines: string[] = []

  lines.push('EQUINOVA PERFORMANCE REPORT')
  lines.push(`Period: ${filters.period === 'custom' ? `${filters.startDate} to ${filters.endDate}` : filters.period}`)
  lines.push(`Race Type: ${filters.raceType}`)
  lines.push(`Model Filter: ${filters.model}`)
  lines.push(`Signal Filter: ${filters.signal}`)
  lines.push('')

  lines.push('ML MODEL PERFORMANCE')
  lines.push('Model,Total Picks,Wins,Win Rate %,Top 3,Top 3 Rate %,Profit (£),ROI %')
  for (const [model, stats] of Object.entries(data.ml_models.aggregated)) {
    const display = MODEL_DISPLAY[model]?.label || model
    lines.push(`${display},${stats.total_picks},${stats.wins},${stats.win_rate},${stats.top3},${stats.top3_rate},${stats.profit},${stats.roi_pct}`)
  }
  lines.push('')

  lines.push('SIGNAL PERFORMANCE')
  lines.push('Signal,Total Bets,Wins,Win Rate %,Profit (£),ROI %')
  for (const sig of data.signals.aggregated) {
    const label = SIGNAL_LABELS[sig.signal_type] || sig.signal_type
    lines.push(`"${label}",${sig.total_bets},${sig.wins},${sig.win_rate},${sig.profit},${sig.roi_pct}`)
  }
  lines.push('')

  lines.push('DAILY BREAKDOWN - ML MODELS')
  lines.push('Date,Model,Picks,Wins,Win Rate %,Profit (£),ROI %')
  const sortedDates = Object.keys(data.ml_models.by_date).sort((a, b) => b.localeCompare(a))
  for (const date of sortedDates) {
    for (const [model, stats] of Object.entries(data.ml_models.by_date[date])) {
      const display = MODEL_DISPLAY[model]?.label || model
      lines.push(`${date},${display},${stats.total_picks},${stats.wins},${stats.win_rate},${stats.profit},${stats.roi_pct}`)
    }
  }
  lines.push('')

  lines.push('DAILY BREAKDOWN - SIGNALS')
  lines.push('Date,Signal,Bets,Wins,Win Rate %,Profit (£),ROI %')
  const sortedSigDates = Object.keys(data.signals.by_date).sort((a, b) => b.localeCompare(a))
  for (const date of sortedSigDates) {
    for (const sig of data.signals.by_date[date]) {
      const label = SIGNAL_LABELS[sig.signal_type] || sig.signal_type
      lines.push(`${date},"${label}",${sig.total_bets},${sig.wins},${sig.win_rate},${sig.profit},${sig.roi_pct}`)
    }
  }

  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `equinova-performance-${filters.period}-${filters.raceType}-${getUKDateString()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Day grouping ────────────────────────────────────────────────────

type Grouping = 'daily' | 'weekly' | 'monthly'

interface DayRow {
  label: string
  dates: string[]
  races: number
  mlWins: number
  mlPicks: number
  signalHits: number
  signalWins: number
  profit: number
  cumProfit: number
}

function buildDayRows(data: PerformanceData, grouping: Grouping): DayRow[] {
  const allDates = new Set<string>()
  for (const d of Object.keys(data.ml_models.by_date)) allDates.add(d)
  for (const d of Object.keys(data.signals.by_date)) allDates.add(d)

  const sorted = Array.from(allDates).sort((a, b) => a.localeCompare(b))
  if (sorted.length === 0) return []

  const groups: { label: string; dates: string[] }[] = []

  if (grouping === 'daily') {
    for (const d of sorted) groups.push({ label: d, dates: [d] })
  } else if (grouping === 'weekly') {
    let currentGroup: { label: string; dates: string[] } | null = null
    for (const d of sorted) {
      const dt = new Date(d + 'T00:00:00')
      const day = dt.getDay()
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - ((day + 6) % 7))
      const weekLabel = `w/c ${monday.toISOString().split('T')[0]}`
      if (!currentGroup || currentGroup.label !== weekLabel) {
        currentGroup = { label: weekLabel, dates: [] }
        groups.push(currentGroup)
      }
      currentGroup.dates.push(d)
    }
  } else {
    let currentGroup: { label: string; dates: string[] } | null = null
    for (const d of sorted) {
      const monthLabel = d.substring(0, 7)
      if (!currentGroup || currentGroup.label !== monthLabel) {
        currentGroup = { label: monthLabel, dates: [] }
        groups.push(currentGroup)
      }
      currentGroup.dates.push(d)
    }
  }

  let cumProfit = 0
  const rows: DayRow[] = []

  for (const g of groups) {
    let mlWins = 0, mlPicks = 0, signalHits = 0, signalWins = 0, profit = 0

    for (const d of g.dates) {
      const mlDay = data.ml_models.by_date[d]
      if (mlDay) {
        for (const stats of Object.values(mlDay)) {
          mlPicks += stats.total_picks
          mlWins += stats.wins
          profit += stats.profit
        }
      }
      const sigDay = data.signals.by_date[d]
      if (sigDay) {
        for (const stats of sigDay) {
          signalHits += stats.total_bets
          signalWins += stats.wins
        }
      }
    }

    cumProfit += profit

    rows.push({
      label: g.label,
      dates: g.dates,
      races: mlPicks,
      mlWins,
      mlPicks,
      signalHits,
      signalWins,
      profit: Math.round(profit * 100) / 100,
      cumProfit: Math.round(cumProfit * 100) / 100,
    })
  }

  return rows.reverse()
}

// ─── Component ───────────────────────────────────────────────────────

export function PerformancePage() {
  const [filters, setFilters] = useState<PerformanceFilters>({
    period: '14d',
    startDate: '',
    endDate: '',
    raceType: 'all',
    model: 'all',
    signal: 'all',
  })
  const [grouping, setGrouping] = useState<Grouping>('daily')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [signalSortField, setSignalSortField] = useState<'win_rate' | 'profit' | 'total_bets'>('win_rate')

  const dateRange = useMemo(
    () => getDateRange(filters.period, filters.startDate, filters.endDate),
    [filters.period, filters.startDate, filters.endDate],
  )

  const { data: perfData, isLoading, error } = useQuery({
    queryKey: ['performance-summary', dateRange.start, dateRange.end, filters.raceType, filters.model, filters.signal],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('performance-summary', {
        body: {
          start_date: dateRange.start,
          end_date: dateRange.end,
          race_type: filters.raceType,
          model: filters.model,
          signal: filters.signal,
        },
      })
      if (error) {
        console.error('Performance summary error:', error)
        throw new Error(error.message || 'Failed to load performance data')
      }
      if (!data?.data) {
        return {
          filters: {}, dates_included: 0, races_included: 0,
          ml_models: { aggregated: {}, by_date: {} },
          signals: { aggregated: [], by_date: {} },
        } as PerformanceData
      }
      return data.data as PerformanceData
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  })

  const dayRows = useMemo(() => {
    if (!perfData) return []
    return buildDayRows(perfData, grouping)
  }, [perfData, grouping])

  const sortedSignals = useMemo(() => {
    if (!perfData) return []
    return [...perfData.signals.aggregated].sort((a, b) => {
      if (signalSortField === 'win_rate') return b.win_rate - a.win_rate
      if (signalSortField === 'profit') return b.profit - a.profit
      return b.total_bets - a.total_bets
    })
  }, [perfData, signalSortField])

  const summary = useMemo(() => {
    if (!perfData) return { totalBets: 0, wins: 0, winRate: 0, profit: 0, roi: 0 }
    let totalBets = 0, wins = 0, profit = 0
    for (const s of Object.values(perfData.ml_models.aggregated)) {
      totalBets += s.total_picks
      wins += s.wins
      profit += s.profit
    }
    return {
      totalBets,
      wins,
      winRate: totalBets > 0 ? Math.round((wins / totalBets) * 1000) / 10 : 0,
      profit: Math.round(profit * 100) / 100,
      roi: totalBets > 0 ? Math.round((profit / totalBets) * 1000) / 10 : 0,
    }
  }, [perfData])

  const handleExport = useCallback(() => {
    if (perfData) exportCSV(perfData, filters)
  }, [perfData, filters])

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold text-white">Performance</h1>
          </div>
          {perfData && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>

        {/* Filters */}
        <PerformanceFiltersBar filters={filters} onChange={setFilters} />

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-yellow-400 animate-spin mr-3" />
            <span className="text-gray-400">Loading performance data...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{(error as Error).message}</p>
          </div>
        )}

        {/* Data loaded */}
        {perfData && !isLoading && (
          <div className="space-y-5">
            {/* Context badge */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{perfData.dates_included} days</span>
              <span className="text-gray-700">·</span>
              <span>{perfData.races_included} races</span>
              <span className="text-gray-700">·</span>
              <span>{dateRange.start} — {dateRange.end}</span>
              {filters.raceType !== 'all' && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-cyan-400 capitalize">{filters.raceType}</span>
                </>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                icon={<Activity className="w-4 h-4 text-blue-400" />}
                label="ML Picks"
                value={summary.totalBets.toString()}
                sub={`${summary.wins} winners`}
              />
              <SummaryCard
                icon={<Percent className="w-4 h-4 text-yellow-400" />}
                label="Win Rate"
                value={`${summary.winRate}%`}
                sub={`${summary.wins}/${summary.totalBets}`}
                valueColor={summary.winRate >= 20 ? 'text-green-400' : summary.winRate >= 15 ? 'text-yellow-400' : 'text-gray-300'}
              />
              <SummaryCard
                icon={<DollarSign className="w-4 h-4 text-green-400" />}
                label="P&L"
                value={formatProfit(summary.profit)}
                sub="Level stakes £1"
                valueColor={summary.profit > 0 ? 'text-green-400' : summary.profit < 0 ? 'text-red-400' : 'text-gray-300'}
              />
              <SummaryCard
                icon={<Trophy className="w-4 h-4 text-amber-400" />}
                label="ROI"
                value={formatRoi(summary.roi)}
                sub="Return on investment"
                valueColor={summary.roi > 0 ? 'text-green-400' : summary.roi < 0 ? 'text-red-400' : 'text-gray-300'}
              />
            </div>

            {/* ML Model Performance */}
            {Object.keys(perfData.ml_models.aggregated).length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ML Model Performance</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Object.entries(perfData.ml_models.aggregated)
                    .sort(([, a], [, b]) => b.win_rate - a.win_rate)
                    .map(([model, stats]) => {
                      const display = MODEL_DISPLAY[model] || { label: model, color: 'text-gray-300' }
                      return (
                        <div
                          key={model}
                          className={`rounded-xl p-3 text-center border transition-all ${
                            stats.profit > 0
                              ? 'bg-green-500/10 border-green-500/20'
                              : stats.win_rate >= 20
                                ? 'bg-yellow-500/10 border-yellow-500/20'
                                : 'bg-gray-800/50 border-gray-700/50'
                          }`}
                        >
                          <div className={`text-[10px] uppercase font-semibold tracking-wider ${display.color}`}>
                            {display.label}
                          </div>
                          <div className={`text-2xl font-bold mt-1 ${
                            stats.win_rate >= 25 ? 'text-green-400' : stats.win_rate >= 15 ? 'text-yellow-400' : 'text-gray-300'
                          }`}>
                            {stats.win_rate}%
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {stats.wins}/{stats.total_picks} wins
                          </div>
                          <div className="text-[10px] text-gray-500">
                            Top 3: {stats.top3_rate}%
                          </div>
                          <div className={`text-xs font-semibold mt-1 ${
                            stats.profit > 0 ? 'text-green-400' : stats.profit < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {formatProfit(stats.profit)}
                          </div>
                          <div className={`text-[10px] ${
                            stats.roi_pct > 0 ? 'text-green-500/70' : stats.roi_pct < 0 ? 'text-red-500/70' : 'text-gray-600'
                          }`}>
                            {formatRoi(stats.roi_pct)} ROI
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Signal Performance */}
            {sortedSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Signal Performance</h2>
                  <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                    {(['win_rate', 'profit', 'total_bets'] as const).map(field => (
                      <button
                        key={field}
                        onClick={() => setSignalSortField(field)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                          signalSortField === field
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {field === 'win_rate' ? 'Win%' : field === 'profit' ? 'P&L' : 'Bets'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table header */}
                <div className="flex items-center justify-between py-1.5 px-3 mb-1">
                  <span className="text-[10px] text-gray-600 uppercase">Signal</span>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-gray-600 uppercase w-10 text-right">Bets</span>
                    <span className="text-[10px] text-gray-600 uppercase w-10 text-right">Win%</span>
                    <span className="text-[10px] text-gray-600 uppercase w-14 text-right">P&L</span>
                    <span className="text-[10px] text-gray-600 uppercase w-12 text-right">ROI</span>
                  </div>
                </div>

                <div className="space-y-1">
                  {sortedSignals.map(sig => {
                    const label = SIGNAL_LABELS[sig.signal_type] || sig.signal_type
                    const isCompound = sig.signal_type.includes('_') &&
                      !['ml_top_pick', 'top_rpr', 'top_ts', 'trainer_form', 'jockey_form', 'course_specialist', 'speed_standout'].includes(sig.signal_type)

                    return (
                      <div
                        key={sig.signal_type}
                        className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                          sig.profit > 0
                            ? 'bg-green-500/10'
                            : sig.win_rate >= 30
                              ? 'bg-yellow-500/5'
                              : 'bg-gray-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isCompound
                            ? <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                            : <Target className="w-3 h-3 text-gray-500 flex-shrink-0" />
                          }
                          <span className="text-sm text-gray-300 truncate">{label}</span>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs text-gray-500 w-10 text-right">{sig.total_bets}</span>
                          <span className={`text-xs font-bold w-10 text-right ${
                            sig.win_rate >= 40 ? 'text-green-400'
                              : sig.win_rate >= 20 ? 'text-yellow-400'
                                : sig.win_rate <= 10 ? 'text-red-400'
                                  : 'text-gray-300'
                          }`}>
                            {sig.win_rate}%
                          </span>
                          <span className={`text-xs font-semibold w-14 text-right ${
                            sig.profit > 0 ? 'text-green-400' : sig.profit < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {formatProfit(sig.profit)}
                          </span>
                          <span className={`text-[10px] font-medium w-12 text-right ${
                            sig.roi_pct > 0 ? 'text-green-500' : sig.roi_pct < 0 ? 'text-red-500' : 'text-gray-600'
                          }`}>
                            {formatRoi(sig.roi_pct)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Day-by-Day Breakdown */}
            {dayRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Performance by Day</h2>
                  <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                    {(['daily', 'weekly', 'monthly'] as const).map(g => (
                      <button
                        key={g}
                        onClick={() => setGrouping(g)}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all capitalize ${
                          grouping === g
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table header */}
                <div className="flex items-center py-1.5 px-3 mb-1">
                  <span className="text-[10px] text-gray-600 uppercase flex-1">Date</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-600 uppercase w-10 text-right">Picks</span>
                    <span className="text-[10px] text-gray-600 uppercase w-10 text-right">Wins</span>
                    <span className="text-[10px] text-gray-600 uppercase w-10 text-right">Sigs</span>
                    <span className="text-[10px] text-gray-600 uppercase w-14 text-right">P&L</span>
                    <span className="text-[10px] text-gray-600 uppercase w-14 text-right">Cum.</span>
                  </div>
                </div>

                <div className="space-y-1">
                  {dayRows.map(row => {
                    const isExpanded = expandedDay === row.label
                    return (
                      <div key={row.label}>
                        <button
                          onClick={() => setExpandedDay(isExpanded ? null : row.label)}
                          className={`w-full flex items-center py-2 px-3 rounded-lg transition-all ${
                            row.profit > 0
                              ? 'bg-green-500/5 hover:bg-green-500/10'
                              : row.profit < 0
                                ? 'bg-red-500/5 hover:bg-red-500/10'
                                : 'bg-gray-800/30 hover:bg-gray-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {row.profit > 0
                              ? <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" />
                              : row.profit < 0
                                ? <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                                : <div className="w-3 h-3 flex-shrink-0" />
                            }
                            <span className="text-xs text-gray-300 font-mono">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-xs text-gray-500 w-10 text-right">{row.mlPicks}</span>
                            <span className="text-xs text-gray-400 w-10 text-right">{row.mlWins}</span>
                            <span className="text-xs text-gray-500 w-10 text-right">{row.signalHits}</span>
                            <span className={`text-xs font-semibold w-14 text-right ${
                              row.profit > 0 ? 'text-green-400' : row.profit < 0 ? 'text-red-400' : 'text-gray-500'
                            }`}>
                              {formatProfit(row.profit)}
                            </span>
                            <span className={`text-xs font-bold w-14 text-right ${
                              row.cumProfit > 0 ? 'text-green-400' : row.cumProfit < 0 ? 'text-red-400' : 'text-gray-500'
                            }`}>
                              {formatProfit(row.cumProfit)}
                            </span>
                            <div className="w-3 flex-shrink-0 text-gray-600">
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </div>
                          </div>
                        </button>

                        {/* Expanded detail for this day/period */}
                        {isExpanded && perfData && (
                          <DayDetail data={perfData} dates={row.dates} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {Object.keys(perfData.ml_models.aggregated).length === 0 && sortedSignals.length === 0 && (
              <div className="text-center py-16">
                <BarChart3 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500">No performance data for the selected filters.</p>
                <p className="text-xs text-gray-600 mt-1">Try adjusting the date range or filters.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, valueColor = 'text-white',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
    </div>
  )
}

function DayDetail({ data, dates }: { data: PerformanceData; dates: string[] }) {
  const mlForDates: Record<string, ModelStats> = {}
  const sigForDates: Record<string, SignalStats> = {}

  for (const d of dates) {
    const mlDay = data.ml_models.by_date[d]
    if (mlDay) {
      for (const [model, stats] of Object.entries(mlDay)) {
        if (!mlForDates[model]) mlForDates[model] = { total_picks: 0, wins: 0, top3: 0, win_rate: 0, top3_rate: 0, profit: 0, roi_pct: 0 }
        mlForDates[model].total_picks += stats.total_picks
        mlForDates[model].wins += stats.wins
        mlForDates[model].top3 += stats.top3
        mlForDates[model].profit += stats.profit
      }
    }
    const sigDay = data.signals.by_date[d]
    if (sigDay) {
      for (const sig of sigDay) {
        if (!sigForDates[sig.signal_type]) sigForDates[sig.signal_type] = { ...sig, total_bets: 0, wins: 0, profit: 0, win_rate: 0, roi_pct: 0 }
        sigForDates[sig.signal_type].total_bets += sig.total_bets
        sigForDates[sig.signal_type].wins += sig.wins
        sigForDates[sig.signal_type].profit += sig.profit
      }
    }
  }

  for (const s of Object.values(mlForDates)) {
    s.win_rate = s.total_picks > 0 ? Math.round((s.wins / s.total_picks) * 1000) / 10 : 0
    s.top3_rate = s.total_picks > 0 ? Math.round((s.top3 / s.total_picks) * 1000) / 10 : 0
    s.profit = Math.round(s.profit * 100) / 100
    s.roi_pct = s.total_picks > 0 ? Math.round((s.profit / s.total_picks) * 1000) / 10 : 0
  }
  for (const s of Object.values(sigForDates)) {
    s.win_rate = s.total_bets > 0 ? Math.round((s.wins / s.total_bets) * 1000) / 10 : 0
    s.profit = Math.round(s.profit * 100) / 100
    s.roi_pct = s.total_bets > 0 ? Math.round((s.profit / s.total_bets) * 1000) / 10 : 0
  }

  return (
    <div className="ml-8 mr-3 mt-1 mb-2 p-3 bg-gray-800/40 rounded-lg border border-gray-700/30 space-y-3">
      {Object.keys(mlForDates).length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Models</span>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {Object.entries(mlForDates)
              .sort(([, a], [, b]) => b.win_rate - a.win_rate)
              .map(([model, stats]) => {
                const display = MODEL_DISPLAY[model] || { label: model, color: 'text-gray-300' }
                return (
                  <div key={model} className="flex items-center gap-1.5 text-xs">
                    <span className={`font-semibold ${display.color}`}>{display.label}</span>
                    <span className="text-gray-400">{stats.win_rate}%</span>
                    <span className={`font-medium ${stats.profit > 0 ? 'text-green-400' : stats.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {formatProfit(stats.profit)}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {Object.keys(sigForDates).length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Signals</span>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {Object.entries(sigForDates)
              .sort(([, a], [, b]) => b.win_rate - a.win_rate)
              .slice(0, 5)
              .map(([key, stats]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <Zap className="w-2.5 h-2.5 text-yellow-400" />
                  <span className="text-gray-400">{SIGNAL_LABELS[key] || key}</span>
                  <span className="text-gray-300">{stats.win_rate}%</span>
                  <span className={`font-medium ${stats.profit > 0 ? 'text-green-400' : stats.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {formatProfit(stats.profit)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
