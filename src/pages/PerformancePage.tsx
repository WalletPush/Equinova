import React, { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AppLayout } from '@/components/AppLayout'
import {
  PerformanceFiltersBar,
  SIGNAL_LABELS,
  SIGNAL_DESCRIPTIONS,
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
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trophy,
  DollarSign,
  Percent,
  Activity,
  CheckCircle2,
  XCircle,
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

interface PickRow {
  date: string
  course: string
  off_time: string
  horse: string
  jockey: string
  trainer: string
  sp: string
  sp_dec: number
  position: number
  signals: string[]
  won: boolean
  profit: number
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
  picks: PickRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getUKDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function getDateRange(period: string, customStart: string, customEnd: string) {
  const today = getUKDateString()
  if (period === 'custom') return { start: customStart || today, end: customEnd || today }
  if (period === 'lifetime') return { start: '2024-01-01', end: today }
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { start: d.toISOString().split('T')[0], end: today }
}

const MODEL_DISPLAY: Record<string, { label: string; color: string }> = {
  benter: { label: 'Benter', color: 'text-purple-400' },
  rf: { label: 'RF', color: 'text-blue-400' },
  mlp: { label: 'MLP', color: 'text-green-400' },
  xgboost: { label: 'XGB', color: 'text-orange-400' },
  ensemble: { label: 'ENS', color: 'text-cyan-400' },
}

function fmtProfit(v: number) { return `${v >= 0 ? '+' : ''}£${v.toFixed(2)}` }
function fmtRoi(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }
function fmtPos(p: number) {
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ─── CSV Export: Today's Profitable Signals ─────────────────────────

async function exportTodaysProfitableSignals() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

  // 1. Fetch lifetime signal stats for profitability data
  const perfRes = await fetch(`${supabaseUrl}/functions/v1/performance-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
    body: JSON.stringify({ start_date: '2024-01-01', end_date: today, race_type: 'all', model: 'all', signal: 'all' }),
  })
  if (!perfRes.ok) throw new Error('Failed to fetch signal stats')
  const perfJson = await perfRes.json()
  const signalStats: Record<string, { win_rate: number; profit: number; total_bets: number; roi_pct: number }> = {}
  for (const sig of perfJson?.data?.signals?.aggregated || []) {
    signalStats[sig.signal_type] = { win_rate: sig.win_rate, profit: sig.profit, total_bets: sig.total_bets, roi_pct: sig.roi_pct }
  }

  // 2. Fetch today's races
  const { data: racesData, error: racesErr } = await supabase.from('races')
    .select('race_id,date,off_time,course_name,type,surface,race_class,distance')
    .eq('date', today)
  if (racesErr || !racesData?.length) throw new Error('No races found for today')

  const raceIds = racesData.map(r => r.race_id)
  const raceMap: Record<string, typeof racesData[0]> = {}
  for (const r of racesData) raceMap[r.race_id] = r

  // 3. Fetch all entries for today's races
  let allEntries: any[] = []
  for (let i = 0; i < raceIds.length; i += 50) {
    const batch = raceIds.slice(i, i + 50)
    const { data: entries } = await supabase.from('race_entries').select('*').in('race_id', batch)
    if (entries) allEntries = allEntries.concat(entries)
  }

  // 4. Group entries by race and detect signals
  const entriesByRace: Record<string, any[]> = {}
  for (const e of allEntries) {
    if (!entriesByRace[e.race_id]) entriesByRace[e.race_id] = []
    entriesByRace[e.race_id].push(e)
  }

  // Model picks: find each model's top pick per race
  const MODEL_FIELDS = [
    { f: 'ensemble_proba', n: 'Ensemble' },
    { f: 'benter_proba', n: 'Benter' },
    { f: 'mlp_proba', n: 'MLP' },
    { f: 'rf_proba', n: 'Random Forest' },
    { f: 'xgboost_proba', n: 'XGBoost' },
  ]

  interface SignalRow {
    offTime: string; course: string; horse: string; jockey: string; trainer: string
    odds: string; comment: string; signalDetail: string; winRate: string; roi: string
  }

  const rows: SignalRow[] = []

  for (const [raceId, entries] of Object.entries(entriesByRace)) {
    const race = raceMap[raceId]
    if (!race) continue

    // Build model picks for this race
    const modelPicks = new Map<string, string[]>()
    for (const md of MODEL_FIELDS) {
      let best: any = null, bp = 0
      for (const e of entries) { const p = e[md.f] || 0; if (p > bp) { bp = p; best = e } }
      if (best) {
        const ex = modelPicks.get(best.horse_id) || []
        ex.push(md.n)
        modelPicks.set(best.horse_id, ex)
      }
    }

    for (const entry of entries) {
      const models = modelPicks.get(entry.horse_id) || []
      const isML = models.length >= 1

      // Detect all signal flags (same logic as edge function)
      const rprs = entries.map((e: any) => e.rpr || 0).filter((v: number) => v > 0)
      const isTopRpr = rprs.length > 0 && (entry.rpr || 0) > 0 && (entry.rpr || 0) >= Math.max(...rprs)
      const tss = entries.map((e: any) => e.ts || 0).filter((v: number) => v > 0)
      const isTopTs = tss.length > 0 && (entry.ts || 0) > 0 && (entry.ts || 0) >= Math.max(...tss)
      const isCourseSpec = (entry.horse_win_percentage_at_distance || 0) >= 20 ||
        ((entry.horse_win_percentage_at_distance || 0) >= 10 && (entry.trainer_win_percentage_at_course || 0) >= 15)
      const isTrainerForm = (entry.trainer_21_days_win_percentage || 0) >= 15
      const isSteaming = entry.odds_movement === 'steaming'
      const fieldFigs = entries.map((e: any) => e.best_speed_figure_at_distance || e.last_speed_figure || e.mean_speed_figure || 0).filter((v: number) => v > 0)
      const fieldAvg = fieldFigs.length > 0 ? fieldFigs.reduce((a: number, b: number) => a + b, 0) / fieldFigs.length : 0
      const bestFig = entry.best_speed_figure_on_course_going_distance || entry.best_speed_figure_at_distance || entry.best_speed_figure_at_track || 0
      const isSpeedStandout = fieldAvg > 0 && bestFig > 0 && ((bestFig - fieldAvg) / fieldAvg) * 100 >= 5

      // Value bet detection
      const ensProb = entry.ensemble_proba || 0
      const totalEns = entries.reduce((s: number, e: any) => s + (e.ensemble_proba || 0), 0)
      const normProb = totalEns > 0 ? ensProb / totalEns : 0
      const curOdds = entry.current_odds || 0
      const impliedProb = curOdds > 1 ? 1 / curOdds : 0
      const isValue = impliedProb > 0 && (normProb - impliedProb) >= 0.05

      // C&D specialist from comment text
      const commentText = (entry.comment || '').toLowerCase()
      const isCD = /\bc\s*&\s*d\b/.test(commentText) || /\bcourse\s+and\s+distance\b/.test(commentText)

      const flags: Record<string, boolean> = {
        cd_ml_value: isCD && isML && isValue,
        cd_ml_backed: isCD && isML && isSteaming,
        cd_ml_pick: isCD && isML,
        cd_value: isCD && isValue,
        cd_backed: isCD && isSteaming,
        cd_top_rated: isCD && (isTopRpr || isTopTs),
        value_ml_backed_rated: isValue && isML && isSteaming && (isTopRpr || isTopTs),
        value_ml_top_rated: isValue && isML && (isTopRpr || isTopTs),
        value_ml_backed: isValue && isML && isSteaming,
        triple_signal: isSteaming && isML && (isTopRpr || isTopTs),
        value_ml_pick: isValue && isML,
        value_top_rated: isValue && (isTopRpr || isTopTs),
        steamer_ml_pick: isSteaming && isML,
        steamer_trainer_form: isSteaming && isTrainerForm,
        ml_ratings_consensus: isML && isTopRpr && isTopTs,
        ml_pick_top_rpr: isML && isTopRpr,
        ml_pick_course_specialist: isML && isCourseSpec,
        ml_pick_trainer_form: isML && isTrainerForm,
        ratings_consensus: isTopRpr && isTopTs,
        value_bet: isValue,
        value_backed: isValue && isSteaming,
        ml_top_pick: isML,
        top_rpr: isTopRpr,
        top_ts: isTopTs,
        steamer: isSteaming,
        cd_specialist: isCD,
        course_specialist: isCourseSpec,
        trainer_form: isTrainerForm,
        speed_standout: isSpeedStandout,
      }

      // Only keep signals that are historically profitable (profit > 0, 3+ bets)
      const profitableSignals = Object.entries(flags)
        .filter(([key, active]) => {
          if (!active) return false
          const stats = signalStats[key]
          return stats && stats.total_bets >= 3 && stats.profit > 0
        })
        .map(([key]) => key)
        .sort((a, b) => (signalStats[b]?.roi_pct || 0) - (signalStats[a]?.roi_pct || 0))

      if (profitableSignals.length === 0) continue

      // Build comment
      const commentParts: string[] = []
      if (models.length > 0) commentParts.push(`${models.length}/5 AI models agree (${models.join(', ')})`)
      if (isSteaming) commentParts.push('odds shortening')
      if (isValue) commentParts.push('AI sees value vs bookmaker price')
      if (isTopRpr) commentParts.push('top RPR in field')
      if (isTopTs) commentParts.push('top Topspeed in field')
      if (isCD) commentParts.push('C&D winner/form')
      if (isCourseSpec) commentParts.push('proven at this course')
      if (isTrainerForm) commentParts.push(`trainer ${(entry.trainer_21_days_win_percentage || 0).toFixed(0)}% win last 21d`)
      if (isSpeedStandout) commentParts.push('speed figures above field average')

      // Build signal detail with stats
      const sigDetails = profitableSignals.map(key => {
        const label = SIGNAL_LABELS[key] || key
        const stats = signalStats[key]
        return `${label} (${stats.total_bets} bets, ${stats.win_rate}% win, ${stats.profit > 0 ? '+' : ''}£${stats.profit.toFixed(2)} P&L)`
      }).join(' | ')

      // Best signal stats for the summary columns
      const bestSig = signalStats[profitableSignals[0]]

      const oddsStr = entry.current_odds ? (entry.current_odds >= 2
        ? `${Math.round((entry.current_odds - 1) * 1)}/1`
        : `${entry.current_odds.toFixed(2)}`) : ''

      rows.push({
        offTime: race.off_time || '',
        course: race.course_name || '',
        horse: entry.horse_name || '',
        jockey: entry.jockey_name || '',
        trainer: entry.trainer_name || '',
        odds: oddsStr,
        comment: commentParts.join(' · ') || 'Multiple factors align',
        signalDetail: sigDetails,
        winRate: bestSig ? `${bestSig.win_rate}%` : '',
        roi: bestSig ? `${bestSig.roi_pct > 0 ? '+' : ''}${bestSig.roi_pct.toFixed(1)}%` : '',
      })
    }
  }

  // Sort by off time
  rows.sort((a, b) => a.offTime.localeCompare(b.offTime))

  if (rows.length === 0) throw new Error('No profitable signals found for today\'s runners')

  // Build CSV
  const lines: string[] = []
  lines.push(`EQUINOVA - TODAY'S PROFITABLE SIGNALS`)
  lines.push(`Date: ${today}`)
  lines.push(`Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`)
  lines.push(`Total runners with profitable signals: ${rows.length}`)
  lines.push('')
  lines.push('Off Time,Course,Horse,Jockey,Trainer,Current Odds,Comment,Profitable Signal (Detail),Best Signal Win Rate,Best Signal ROI')

  for (const r of rows) {
    lines.push(`${r.offTime},"${r.course}","${r.horse}","${r.jockey}","${r.trainer}","${r.odds}","${r.comment}","${r.signalDetail}",${r.winRate},${r.roi}`)
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `equinova-todays-profitable-signals-${today}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ───────────────────────────────────────────────────────

const PAGE_SIZE = 25

export function PerformancePage() {
  const [filters, setFilters] = useState<PerformanceFilters>({
    period: '14d',
    startDate: '',
    endDate: '',
    raceType: 'all',
    model: 'all',
    signal: 'all',
  })
  const [signalSortField, setSignalSortField] = useState<'win_rate' | 'profit' | 'total_bets'>('win_rate')
  const [picksPage, setPicksPage] = useState(0)
  const [showSignals, setShowSignals] = useState(true)
  const [showPicks, setShowPicks] = useState(true)

  const dateRange = useMemo(
    () => getDateRange(filters.period, filters.startDate, filters.endDate),
    [filters.period, filters.startDate, filters.endDate],
  )

  const { data: perfData, isLoading, error } = useQuery({
    queryKey: ['performance-summary', dateRange.start, dateRange.end, filters.raceType, filters.model, filters.signal],
    queryFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/performance-summary`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          start_date: dateRange.start,
          end_date: dateRange.end,
          race_type: filters.raceType,
          model: filters.model,
          signal: filters.signal,
        }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Server error ${res.status}: ${txt.slice(0, 200)}`)
      }
      const json = await res.json()
      return (json?.data || { filters: {}, dates_included: 0, races_included: 0, ml_models: { aggregated: {}, by_date: {} }, signals: { aggregated: [], by_date: {} }, picks: [] }) as PerformanceData
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })

  // Reset picks page when filters change
  useMemo(() => { setPicksPage(0) }, [dateRange.start, dateRange.end, filters.raceType, filters.model, filters.signal])

  const sortedSignals = useMemo(() => {
    if (!perfData) return []
    return [...perfData.signals.aggregated].sort((a, b) => {
      if (signalSortField === 'win_rate') return b.win_rate - a.win_rate
      if (signalSortField === 'profit') return b.profit - a.profit
      return b.total_bets - a.total_bets
    })
  }, [perfData, signalSortField])

  const summary = useMemo(() => {
    if (!perfData?.picks) return { totalPicks: 0, wins: 0, winRate: 0, profit: 0, roi: 0 }
    const picks = perfData.picks
    const totalPicks = picks.length
    const wins = picks.filter(p => p.won).length
    const netProfit = picks.reduce((sum, p) => sum + (p.won ? p.profit - 1 : p.profit), 0)
    return {
      totalPicks,
      wins,
      winRate: totalPicks > 0 ? Math.round((wins / totalPicks) * 1000) / 10 : 0,
      profit: Math.round(netProfit * 100) / 100,
      roi: totalPicks > 0 ? Math.round((netProfit / totalPicks) * 1000) / 10 : 0,
    }
  }, [perfData])

  const paginatedPicks = useMemo(() => {
    if (!perfData?.picks) return []
    const start = picksPage * PAGE_SIZE
    return perfData.picks.slice(start, start + PAGE_SIZE)
  }, [perfData, picksPage])

  const totalPickPages = perfData?.picks ? Math.ceil(perfData.picks.length / PAGE_SIZE) : 0

  const [exporting, setExporting] = useState(false)
  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportTodaysProfitableSignals()
    } catch (err: any) {
      alert(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }, [])

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold text-white">Performance</h1>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exporting ? 'Generating...' : "Export today's profitable signals"}
          </button>
        </div>

        <PerformanceFiltersBar filters={filters} onChange={setFilters} />

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-yellow-400 animate-spin mr-3" />
            <span className="text-gray-400">Loading performance data...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{(error as Error).message}</p>
          </div>
        )}

        {perfData && !isLoading && (
          <div className="space-y-5">
            {/* Context */}
            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              <span>{perfData.dates_included} days</span>
              <span className="text-gray-700">·</span>
              <span>{perfData.races_included} races</span>
              <span className="text-gray-700">·</span>
              <span>{perfData.picks?.length || 0} signal picks</span>
              <span className="text-gray-700">·</span>
              <span>{dateRange.start} — {dateRange.end}</span>
              {filters.raceType !== 'all' && (
                <span className="text-cyan-400 capitalize ml-1">{filters.raceType}</span>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={<Activity className="w-4 h-4 text-blue-400" />}
                label="Signal Picks" value={summary.totalPicks.toString()} sub={`${summary.wins} winners`} />
              <SummaryCard icon={<Percent className="w-4 h-4 text-yellow-400" />}
                label="Win Rate" value={`${summary.winRate}%`} sub={`${summary.wins}/${summary.totalPicks}`}
                valueColor={summary.winRate >= 25 ? 'text-green-400' : summary.winRate >= 15 ? 'text-yellow-400' : 'text-gray-300'} />
              <SummaryCard icon={<DollarSign className="w-4 h-4 text-green-400" />}
                label="P&L" value={fmtProfit(summary.profit)} sub="Level stakes £1"
                valueColor={summary.profit > 0 ? 'text-green-400' : summary.profit < 0 ? 'text-red-400' : 'text-gray-300'} />
              <SummaryCard icon={<Trophy className="w-4 h-4 text-amber-400" />}
                label="ROI" value={fmtRoi(summary.roi)} sub="Return on investment"
                valueColor={summary.roi > 0 ? 'text-green-400' : summary.roi < 0 ? 'text-red-400' : 'text-gray-300'} />
            </div>

            {/* ML Model Performance */}
            {Object.keys(perfData.ml_models.aggregated).length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">ML Model Performance</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Object.entries(perfData.ml_models.aggregated)
                    .sort(([, a], [, b]) => b.win_rate - a.win_rate)
                    .map(([model, stats]) => {
                      const d = MODEL_DISPLAY[model] || { label: model, color: 'text-gray-300' }
                      return (
                        <div key={model} className={`rounded-xl p-3 text-center border transition-all ${
                          stats.profit > 0 ? 'bg-green-500/10 border-green-500/20'
                          : stats.win_rate >= 20 ? 'bg-yellow-500/10 border-yellow-500/20'
                          : 'bg-gray-800/50 border-gray-700/50'
                        }`}>
                          <div className={`text-[10px] uppercase font-semibold tracking-wider ${d.color}`}>{d.label}</div>
                          <div className={`text-2xl font-bold mt-1 ${stats.win_rate >= 25 ? 'text-green-400' : stats.win_rate >= 15 ? 'text-yellow-400' : 'text-gray-300'}`}>
                            {stats.win_rate}%
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">{stats.wins}/{stats.total_picks} wins · Top3 {stats.top3_rate}%</div>
                          <div className={`text-xs font-semibold mt-1 ${stats.profit > 0 ? 'text-green-400' : stats.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {fmtProfit(stats.profit)} <span className="text-[10px] font-normal">({fmtRoi(stats.roi_pct)})</span>
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
                <button onClick={() => setShowSignals(!showSignals)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Signal Performance</h2>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5" onClick={e => e.stopPropagation()}>
                      {(['win_rate', 'profit', 'total_bets'] as const).map(f => (
                        <button key={f} onClick={() => setSignalSortField(f)}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                            signalSortField === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                          }`}>
                          {f === 'win_rate' ? 'Win%' : f === 'profit' ? 'P&L' : 'Bets'}
                        </button>
                      ))}
                    </div>
                    {showSignals ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
                  </div>
                </button>

                {showSignals && (
                  <>
                    <div className="hidden sm:flex items-center py-1.5 px-3 mb-1">
                      <span className="text-[10px] text-gray-600 uppercase flex-1">Signal</span>
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
                          !['ml_top_pick', 'top_rpr', 'top_ts', 'trainer_form', 'course_specialist', 'speed_standout'].includes(sig.signal_type)

                        return (
                          <div key={sig.signal_type} className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                            sig.profit > 0 ? 'bg-green-500/10' : sig.win_rate >= 30 ? 'bg-yellow-500/5' : 'bg-gray-800/30'
                          }`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0" title={SIGNAL_DESCRIPTIONS[sig.signal_type] || ''}>
                              {isCompound ? <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" /> : <Target className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                              <div className="min-w-0">
                                <span className="text-sm text-gray-300 truncate block">{label}</span>
                                {SIGNAL_DESCRIPTIONS[sig.signal_type] && (
                                  <span className="text-[10px] text-gray-500 truncate block">{SIGNAL_DESCRIPTIONS[sig.signal_type]}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <span className="text-xs text-gray-500 w-10 text-right">{sig.total_bets}</span>
                              <span className={`text-xs font-bold w-10 text-right ${
                                sig.win_rate >= 40 ? 'text-green-400' : sig.win_rate >= 20 ? 'text-yellow-400' : sig.win_rate <= 10 ? 'text-red-400' : 'text-gray-300'
                              }`}>{sig.win_rate}%</span>
                              <span className={`text-xs font-semibold w-14 text-right ${sig.profit > 0 ? 'text-green-400' : sig.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                {fmtProfit(sig.profit)}
                              </span>
                              <span className={`text-[10px] font-medium w-12 text-right ${sig.roi_pct > 0 ? 'text-green-500' : sig.roi_pct < 0 ? 'text-red-500' : 'text-gray-600'}`}>
                                {fmtRoi(sig.roi_pct)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── Individual Results Table ─── */}
            {perfData.picks && perfData.picks.length > 0 && (
              <div>
                <button onClick={() => setShowPicks(!showPicks)} className="flex items-center justify-between w-full mb-3">
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Individual Results ({perfData.picks.length})
                  </h2>
                  {showPicks ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
                </button>

                {showPicks && (
                  <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-700/50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-800/80 text-gray-500 uppercase text-[10px] tracking-wider">
                            <th className="py-2 px-3 text-left">Date</th>
                            <th className="py-2 px-3 text-left">Course</th>
                            <th className="py-2 px-3 text-left">Off</th>
                            <th className="py-2 px-3 text-left">Horse</th>
                            <th className="py-2 px-3 text-left">Jockey</th>
                            <th className="py-2 px-3 text-left">Trainer</th>
                            <th className="py-2 px-3 text-right">SP</th>
                            <th className="py-2 px-3 text-center">Pos</th>
                            <th className="py-2 px-3 text-right">P&L</th>
                            <th className="py-2 px-3 text-left">Signals</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          {paginatedPicks.map((pick, i) => (
                            <tr key={`${pick.date}-${pick.course}-${pick.off_time}-${pick.horse}-${i}`}
                              className={`transition-colors ${pick.won ? 'bg-green-500/5 hover:bg-green-500/10' : 'hover:bg-gray-800/30'}`}>
                              <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{fmtDate(pick.date)}</td>
                              <td className="py-2 px-3 text-gray-300 whitespace-nowrap max-w-[120px] truncate">{pick.course}</td>
                              <td className="py-2 px-3 text-gray-400 whitespace-nowrap">{pick.off_time}</td>
                              <td className="py-2 px-3 text-white font-medium whitespace-nowrap max-w-[140px] truncate">{pick.horse}</td>
                              <td className="py-2 px-3 text-gray-400 whitespace-nowrap max-w-[120px] truncate">{pick.jockey}</td>
                              <td className="py-2 px-3 text-gray-400 whitespace-nowrap max-w-[120px] truncate">{pick.trainer}</td>
                              <td className="py-2 px-3 text-gray-300 text-right whitespace-nowrap font-mono">{pick.sp}</td>
                              <td className="py-2 px-3 text-center">
                                {pick.won ? (
                                  <span className="inline-flex items-center gap-1 text-green-400 font-bold">
                                    <CheckCircle2 className="w-3 h-3" /> 1st
                                  </span>
                                ) : (
                                  <span className="text-gray-500">{fmtPos(pick.position)}</span>
                                )}
                              </td>
                              <td className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${pick.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtProfit(pick.profit)}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {pick.signals.slice(0, 3).map(s => (
                                    <span key={s} className="inline-block px-1.5 py-0.5 text-[9px] bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20 whitespace-nowrap">
                                      {SIGNAL_LABELS[s] || s}
                                    </span>
                                  ))}
                                  {pick.signals.length > 3 && (
                                    <span className="text-[9px] text-gray-600">+{pick.signals.length - 3}</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden space-y-2">
                      {paginatedPicks.map((pick, i) => (
                        <div key={`m-${pick.date}-${pick.off_time}-${pick.horse}-${i}`}
                          className={`rounded-lg p-3 border ${pick.won ? 'bg-green-500/5 border-green-500/20' : 'bg-gray-800/30 border-gray-700/30'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-gray-500">{fmtDate(pick.date)} · {pick.course} · {pick.off_time}</span>
                            <span className={`text-xs font-bold ${pick.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {fmtProfit(pick.profit)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-white font-medium truncate mr-2">{pick.horse}</span>
                            {pick.won ? (
                              <span className="flex items-center gap-1 text-green-400 text-xs font-bold flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" /> Won
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs flex-shrink-0">{fmtPos(pick.position)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
                            <span>J: {pick.jockey || '—'}</span>
                            <span>T: {pick.trainer || '—'}</span>
                            <span className="font-mono">SP: {pick.sp}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {pick.signals.map(s => (
                              <span key={s} className="inline-block px-1.5 py-0.5 text-[9px] bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
                                {SIGNAL_LABELS[s] || s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPickPages > 1 && (
                      <div className="flex items-center justify-between mt-3 px-1">
                        <span className="text-[10px] text-gray-600">
                          {picksPage * PAGE_SIZE + 1}–{Math.min((picksPage + 1) * PAGE_SIZE, perfData.picks.length)} of {perfData.picks.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPicksPage(p => Math.max(0, p - 1))} disabled={picksPage === 0}
                            className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          {Array.from({ length: Math.min(totalPickPages, 7) }, (_, idx) => {
                            let page: number
                            if (totalPickPages <= 7) {
                              page = idx
                            } else if (picksPage < 3) {
                              page = idx
                            } else if (picksPage > totalPickPages - 4) {
                              page = totalPickPages - 7 + idx
                            } else {
                              page = picksPage - 3 + idx
                            }
                            return (
                              <button key={page} onClick={() => setPicksPage(page)}
                                className={`w-6 h-6 rounded text-[10px] font-medium transition-all ${
                                  picksPage === page ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-white'
                                }`}>
                                {page + 1}
                              </button>
                            )
                          })}
                          <button onClick={() => setPicksPage(p => Math.min(totalPickPages - 1, p + 1))} disabled={picksPage >= totalPickPages - 1}
                            className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Empty state */}
            {(!perfData.picks || perfData.picks.length === 0) && sortedSignals.length === 0 && (
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

function SummaryCard({ icon, label, value, sub, valueColor = 'text-white' }: {
  icon: React.ReactNode; label: string; value: string; sub: string; valueColor?: string
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
