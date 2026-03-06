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
  HelpCircle,
  Radar,
  FileDown,
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

// ─── Combo Scanner Types ──────────────────────────────────────────────

interface ComboResult {
  race_type: string
  signal: string
  label: string
  total_bets: number
  wins: number
  win_rate: number
  profit: number
  roi_pct: number
}

interface TodayMatch {
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
  matching_combos: ComboResult[]
  model_picks: string[]
}

interface ComboScanData {
  top_combinations: ComboResult[]
  today_matches: TodayMatch[]
  meta: {
    historical_races: number
    historical_entries: number
    today_races: number
    min_bets_threshold: number
    generated_at: string
  }
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

const RACE_TYPE_COLORS: Record<string, string> = {
  flat: 'bg-emerald-500/20 text-emerald-400',
  aw: 'bg-blue-500/20 text-blue-400',
  hurdles: 'bg-orange-500/20 text-orange-400',
  chase: 'bg-red-500/20 text-red-400',
}

function decToFrac(dec: number): string {
  if (dec <= 1) return 'EVS'
  const num = dec - 1
  const common = [
    [1, 5], [1, 4], [1, 3], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7], [8, 13],
    [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [6, 5], [5, 4], [11, 8],
    [6, 4], [7, 4], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2],
    [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [8, 1], [9, 1],
    [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1],
    [40, 1], [50, 1], [66, 1], [100, 1],
  ]
  let bestN = Math.round(num), bestD = 1, bestDiff = Math.abs(num - bestN)
  for (const [n, d] of common) {
    const diff = Math.abs(num - n / d)
    if (diff < bestDiff) { bestDiff = diff; bestN = n; bestD = d }
  }
  return `${bestN}/${bestD}`
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
  const [showGuide, setShowGuide] = useState(false)

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

  // ─── Combo Scanner ─────────────────────────────────────────────────
  const [comboScanData, setComboScanData] = useState<ComboScanData | null>(null)
  const [comboScanning, setComboScanning] = useState(false)
  const [comboError, setComboError] = useState<string | null>(null)
  const [showComboResults, setShowComboResults] = useState(true)
  const [comboRaceTypeFilter, setComboRaceTypeFilter] = useState<string>('all')
  const [comboSortField, setComboSortField] = useState<'roi_pct' | 'win_rate' | 'profit'>('roi_pct')
  const [comboSortDir, setComboSortDir] = useState<'desc' | 'asc'>('desc')
  const [selectedCombo, setSelectedCombo] = useState<{ race_type: string; signal: string } | null>(null)

  const runComboScan = useCallback(async () => {
    setComboScanning(true)
    setComboError(null)
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/combo-scanner`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ min_bets: 10 }),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Server error ${res.status}: ${txt.slice(0, 200)}`)
      }
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setComboScanData(json.data as ComboScanData)
    } catch (err: any) {
      setComboError(err.message || 'Combo scan failed')
    } finally {
      setComboScanning(false)
    }
  }, [])

  const filteredCombos = useMemo(() => {
    if (!comboScanData) return []
    let combos = comboScanData.top_combinations
    if (comboRaceTypeFilter !== 'all') combos = combos.filter(c => c.race_type === comboRaceTypeFilter)
    const dir = comboSortDir === 'desc' ? -1 : 1
    return [...combos].sort((a, b) => (a[comboSortField] - b[comboSortField]) * dir)
  }, [comboScanData, comboRaceTypeFilter, comboSortField, comboSortDir])

  const toggleComboSort = useCallback((field: 'roi_pct' | 'win_rate' | 'profit') => {
    if (comboSortField === field) {
      setComboSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setComboSortField(field)
      setComboSortDir('desc')
    }
  }, [comboSortField])

  const handleComboRowClick = useCallback((c: ComboResult) => {
    setSelectedCombo(prev =>
      prev && prev.race_type === c.race_type && prev.signal === c.signal ? null : { race_type: c.race_type, signal: c.signal },
    )
  }, [])

  const filteredMatches = useMemo(() => {
    if (!comboScanData) return []
    let matches = comboScanData.today_matches
    if (comboRaceTypeFilter !== 'all') matches = matches.filter(m => m.race_type === comboRaceTypeFilter)
    if (selectedCombo) {
      matches = matches.filter(m =>
        m.race_type === selectedCombo.race_type &&
        m.matching_combos.some(mc => mc.signal === selectedCombo.signal),
      )
    }
    return matches
  }, [comboScanData, comboRaceTypeFilter, selectedCombo])

  const exportComboCSV = useCallback(() => {
    if (!comboScanData) return
    const today = getUKDateString()
    const lines: string[] = []
    lines.push('EQUINOVA - LIFETIME COMBO SCANNER MATCHES')
    lines.push(`Date: ${today}`)
    lines.push(`Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`)
    lines.push(`Profitable combos found: ${comboScanData.top_combinations.length}`)
    lines.push(`Today's matching runners: ${comboScanData.today_matches.length}`)
    lines.push('')
    lines.push('--- TOP PROFITABLE COMBINATIONS ---')
    lines.push('Race Type,Signal,Bets,Wins,Win Rate,P&L,ROI')
    for (const c of comboScanData.top_combinations) {
      lines.push(`${c.race_type.toUpperCase()},"${c.label}",${c.total_bets},${c.wins},${c.win_rate}%,${c.profit > 0 ? '+' : ''}£${c.profit.toFixed(2)},${c.roi_pct > 0 ? '+' : ''}${c.roi_pct.toFixed(1)}%`)
    }
    lines.push('')
    lines.push("--- TODAY'S MATCHES ---")
    lines.push('Off Time,Course,Horse,Race Type,Jockey,Trainer,Odds,AI Models,Matching Signals,Best Signal ROI')
    for (const m of comboScanData.today_matches) {
      const bestROI = m.matching_combos.length > 0 ? m.matching_combos[0].roi_pct : 0
      const sigs = m.matching_combos.map(c => c.label).join(' | ')
      const oddsStr = m.current_odds > 0 ? decToFrac(m.current_odds) : ''
      lines.push(`${m.off_time},"${m.course}","${m.horse_name}",${m.race_type.toUpperCase()},"${m.jockey}","${m.trainer}",${oddsStr},"${m.model_picks.join(', ')}","${sigs}",${bestROI > 0 ? '+' : ''}${bestROI.toFixed(1)}%`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `equinova-combo-scanner-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [comboScanData])

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold text-white">Performance</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runComboScan} disabled={comboScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-900 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-lg hover:from-yellow-300 hover:to-amber-400 transition-all disabled:opacity-50 shadow-lg shadow-yellow-500/20">
              {comboScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
              {comboScanning ? 'Scanning...' : 'Run Lifetime Combo Scan'}
            </button>
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {exporting ? 'Generating...' : "Export today's signals"}
            </button>
          </div>
        </div>

        {/* How to use guide */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="text-sm font-medium text-yellow-400">How to use the Performance page</span>
            <div className="ml-auto text-gray-500">
              {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showGuide && (
            <div className="border-t border-gray-800 px-4 py-4 space-y-4 text-xs text-gray-300 leading-relaxed">
              <p>
                This page shows you <strong className="text-white">how well our AI signals have performed historically</strong>. Think of it as a report card — you can see which signal patterns have actually made money, which ones haven't, and drill down into every individual pick.
              </p>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Time Period</h4>
                <p>
                  Choose how far back you want to look. <strong className="text-white">7 Days</strong> and <strong className="text-white">14 Days</strong> show recent form. <strong className="text-white">30 Days</strong> gives a broader picture. <strong className="text-white">Lifetime</strong> goes all the way back to January 2024 — this is the most statistically meaningful because it has the most data. <strong className="text-white">Custom</strong> lets you pick exact start and end dates.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Race Type</h4>
                <p>
                  Filter results by the type of racing. <strong className="text-white">Flat</strong> is turf flat racing. <strong className="text-white">AW</strong> is all-weather (artificial surfaces like Polytrack or Tapeta). <strong className="text-white">Hurdles</strong> and <strong className="text-white">Chase</strong> are National Hunt (jumps) racing. Use <strong className="text-white">All</strong> to see everything combined.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Model Filter</h4>
                <p>
                  We run <strong className="text-white">5 different AI models</strong> on every race. This filter lets you see how each one performs on its own. <strong className="text-white">Ensemble</strong> is the combined prediction from all models. <strong className="text-white">Benter</strong>, <strong className="text-white">MLP</strong>, <strong className="text-white">Random Forest</strong>, and <strong className="text-white">XGBoost</strong> are individual models with different approaches. Leave on <strong className="text-white">All Models</strong> to see the overall picture.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Signal Filter</h4>
                <p>
                  This is the most powerful filter. A <strong className="text-white">"signal"</strong> is a combination of factors that line up for a horse — for example, "ML Pick + Top RPR" means our AI picked the horse AND it has the highest Racing Post Rating in the field. Use this dropdown to isolate a specific signal and see exactly how it has performed: win rate, profit/loss, and every individual pick. The signals at the top of the dropdown (like "C&D + ML Pick + Value") combine the most factors and tend to be the most selective.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">What the numbers mean</h4>
                <ul className="space-y-1.5 text-gray-400">
                  <li><strong className="text-white">Signal Picks</strong> — Total number of horses that matched the selected signal(s) and had a result.</li>
                  <li><strong className="text-white">Win Rate</strong> — What percentage of those picks actually won their race.</li>
                  <li><strong className="text-white">P&L</strong> — Profit & Loss if you had bet £1 on every pick at Starting Price (SP). Green = profit, red = loss.</li>
                  <li><strong className="text-white">ROI</strong> — Return on Investment. +20% means you'd have made 20p for every £1 staked.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Signal Performance section</h4>
                <p>
                  Shows every signal pattern ranked by performance. Click the column headers (<strong className="text-white">Win %</strong>, <strong className="text-white">P&L</strong>, <strong className="text-white">Bets</strong>) to re-sort. Green bars mean the signal is profitable, red means it's lost money. The more bets a signal has, the more reliable its stats are.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Individual Results</h4>
                <p>
                  A full list of every pick with the date, course, horse, jockey, trainer, starting price, finishing position, and which signals applied. This is your audit trail — you can verify every result yourself.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider mb-2">Export button</h4>
                <p>
                  The <strong className="text-white">"Export today's profitable signals"</strong> button at the top right downloads a CSV file with all of today's runners that match a historically profitable signal. You can open it in Excel or Google Sheets for your own analysis.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Combo Scanner Error */}
        {comboError && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{comboError}</p>
          </div>
        )}

        {/* Combo Scanner Loading */}
        {comboScanning && (
          <div className="flex items-center justify-center py-12 bg-gray-900/60 border border-yellow-500/20 rounded-xl">
            <Loader2 className="w-6 h-6 text-yellow-400 animate-spin mr-3" />
            <span className="text-gray-300">Scanning lifetime data across all race types... this may take a moment</span>
          </div>
        )}

        {/* Combo Scanner Results */}
        {comboScanData && !comboScanning && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button onClick={() => setShowComboResults(!showComboResults)} className="flex items-center gap-2">
                <Radar className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-bold text-white">Lifetime Combo Scanner</h2>
                {showComboResults ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              <div className="flex items-center gap-2">
                {/* Race type filter for combo results */}
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                  {['all', 'flat', 'aw', 'hurdles', 'chase'].map(rt => (
                    <button key={rt} onClick={() => { setComboRaceTypeFilter(rt); setSelectedCombo(null) }}
                      className={`px-2.5 py-1 text-[10px] font-medium rounded transition-all capitalize ${
                        comboRaceTypeFilter === rt ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {rt === 'all' ? 'All Types' : rt === 'aw' ? 'AW' : rt}
                    </button>
                  ))}
                </div>
                <button onClick={exportComboCSV}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
                  <FileDown className="w-3 h-3" /> CSV
                </button>
              </div>
            </div>

            {showComboResults && (
              <div className="space-y-5">
                {/* Meta info */}
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                  <span>{comboScanData.meta.historical_races} historical races analysed</span>
                  <span className="text-gray-700">·</span>
                  <span>{comboScanData.top_combinations.length} profitable combos</span>
                  <span className="text-gray-700">·</span>
                  <span>{comboScanData.today_matches.length} matches today</span>
                  <span className="text-gray-700">·</span>
                  <span>Min {comboScanData.meta.min_bets_threshold} bets</span>
                </div>

                {/* Top Profitable Combos Table */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Top Profitable Combinations ({filteredCombos.length})
                  </h3>

                  {filteredCombos.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No profitable combinations for this race type.</p>
                  ) : (
                    <>
                      {/* Desktop */}
                      <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-700/50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-800/80 text-gray-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-3 text-left">Race Type</th>
                              <th className="py-2 px-3 text-left">Signal</th>
                              <th className="py-2 px-3 text-right">Bets</th>
                              <th className="py-2 px-3 text-right">Wins</th>
                              <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-yellow-400 transition-colors"
                                onClick={() => toggleComboSort('win_rate')}>
                                <span className="inline-flex items-center gap-1 justify-end">
                                  Win %
                                  {comboSortField === 'win_rate' && (
                                    comboSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-yellow-400" /> : <ChevronUp className="w-3 h-3 text-yellow-400" />
                                  )}
                                </span>
                              </th>
                              <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-yellow-400 transition-colors"
                                onClick={() => toggleComboSort('profit')}>
                                <span className="inline-flex items-center gap-1 justify-end">
                                  P&L
                                  {comboSortField === 'profit' && (
                                    comboSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-yellow-400" /> : <ChevronUp className="w-3 h-3 text-yellow-400" />
                                  )}
                                </span>
                              </th>
                              <th className="py-2 px-3 text-right cursor-pointer select-none hover:text-yellow-400 transition-colors"
                                onClick={() => toggleComboSort('roi_pct')}>
                                <span className="inline-flex items-center gap-1 justify-end">
                                  ROI
                                  {comboSortField === 'roi_pct' && (
                                    comboSortDir === 'desc' ? <ChevronDown className="w-3 h-3 text-yellow-400" /> : <ChevronUp className="w-3 h-3 text-yellow-400" />
                                  )}
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/50">
                            {filteredCombos.map((c, i) => {
                              const isSelected = selectedCombo?.race_type === c.race_type && selectedCombo?.signal === c.signal
                              return (
                                <tr key={`${c.race_type}-${c.signal}-${i}`}
                                  onClick={() => handleComboRowClick(c)}
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-yellow-500/15 border-l-2 border-l-yellow-400'
                                      : 'hover:bg-gray-800/30'
                                  }`}>
                                  <td className="py-2 px-3">
                                    <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                                      RACE_TYPE_COLORS[c.race_type] || 'bg-gray-700 text-gray-300'
                                    }`}>
                                      {c.race_type === 'aw' ? 'AW' : c.race_type}
                                    </span>
                                  </td>
                                  <td className={`py-2 px-3 ${isSelected ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>{c.label}</td>
                                  <td className="py-2 px-3 text-right text-gray-500">{c.total_bets}</td>
                                  <td className="py-2 px-3 text-right text-gray-400">{c.wins}</td>
                                  <td className={`py-2 px-3 text-right font-bold ${
                                    c.win_rate >= 40 ? 'text-green-400' : c.win_rate >= 20 ? 'text-yellow-400' : 'text-gray-300'
                                  }`}>{c.win_rate}%</td>
                                  <td className={`py-2 px-3 text-right font-semibold ${c.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {fmtProfit(c.profit)}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-medium ${c.roi_pct > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {fmtRoi(c.roi_pct)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Mobile cards */}
                      <div className="sm:hidden space-y-1.5">
                        {/* Mobile sort controls */}
                        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5 mb-2">
                          {([['win_rate', 'Win%'], ['profit', 'P&L'], ['roi_pct', 'ROI']] as const).map(([f, label]) => (
                            <button key={f} onClick={() => toggleComboSort(f)}
                              className={`flex-1 px-2 py-1 text-[10px] font-medium rounded transition-all flex items-center justify-center gap-1 ${
                                comboSortField === f ? 'bg-gray-700 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                              }`}>
                              {label}
                              {comboSortField === f && (comboSortDir === 'desc' ? '↓' : '↑')}
                            </button>
                          ))}
                        </div>
                        {filteredCombos.map((c, i) => {
                          const isSelected = selectedCombo?.race_type === c.race_type && selectedCombo?.signal === c.signal
                          return (
                            <div key={`m-${c.race_type}-${c.signal}-${i}`}
                              onClick={() => handleComboRowClick(c)}
                              className={`rounded-lg p-3 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-yellow-500/10 border border-yellow-500/30'
                                  : 'bg-gray-800/30 border border-gray-700/30'
                              }`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                                  RACE_TYPE_COLORS[c.race_type] || 'bg-gray-700 text-gray-300'
                                }`}>
                                  {c.race_type === 'aw' ? 'AW' : c.race_type}
                                </span>
                                <span className={`text-xs font-bold ${c.roi_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {fmtRoi(c.roi_pct)} ROI
                                </span>
                              </div>
                              <div className={`text-sm mb-1 ${isSelected ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>{c.label}</div>
                              <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                <span>{c.total_bets} bets</span>
                                <span>{c.wins} wins</span>
                                <span>{c.win_rate}%</span>
                                <span className={c.profit > 0 ? 'text-green-400' : 'text-red-400'}>{fmtProfit(c.profit)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Today's Matches Table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Today's Matches ({filteredMatches.length})
                      {selectedCombo && (
                        <span className="ml-2 text-yellow-400 normal-case font-normal">
                          — filtered by: {filteredCombos.find(c => c.race_type === selectedCombo.race_type && c.signal === selectedCombo.signal)?.label || selectedCombo.signal}
                        </span>
                      )}
                    </h3>
                    {selectedCombo && (
                      <button onClick={() => setSelectedCombo(null)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 bg-gray-800 rounded hover:text-white transition-colors">
                        <XCircle className="w-3 h-3" /> Clear filter
                      </button>
                    )}
                  </div>

                  {filteredMatches.length === 0 ? (
                    <div className="text-center py-8">
                      <Radar className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No runners today match the profitable combinations.</p>
                      <p className="text-xs text-gray-600 mt-1">This can happen if today's card doesn't have races for the profitable race types, or no horses trigger the right signal flags.</p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop */}
                      <div className="hidden sm:block overflow-x-auto rounded-xl border border-yellow-500/20">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-yellow-500/5 text-gray-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-3 text-left">Time</th>
                              <th className="py-2 px-3 text-left">Course</th>
                              <th className="py-2 px-3 text-left">Horse</th>
                              <th className="py-2 px-3 text-left">Type</th>
                              <th className="py-2 px-3 text-left">Jockey</th>
                              <th className="py-2 px-3 text-left">Trainer</th>
                              <th className="py-2 px-3 text-right">Odds</th>
                              <th className="py-2 px-3 text-left">AI Models</th>
                              <th className="py-2 px-3 text-left">Matching Profitable Signals</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/50">
                            {filteredMatches.map((m, i) => (
                              <tr key={`${m.race_id}-${m.horse_id}-${i}`}
                                className="hover:bg-yellow-500/5 transition-colors">
                                <td className="py-2 px-3 text-gray-400 whitespace-nowrap font-mono">{m.off_time}</td>
                                <td className="py-2 px-3 text-gray-300 whitespace-nowrap max-w-[120px] truncate">{m.course}</td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    {m.silk_url && <img src={m.silk_url} alt="" className="w-5 h-5 object-contain" />}
                                    <span className="text-white font-medium whitespace-nowrap">{m.horse_name}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                    RACE_TYPE_COLORS[m.race_type] || 'bg-gray-700 text-gray-300'
                                  }`}>
                                    {m.race_type === 'aw' ? 'AW' : m.race_type}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-gray-400 whitespace-nowrap max-w-[110px] truncate">{m.jockey || '—'}</td>
                                <td className="py-2 px-3 text-gray-400 whitespace-nowrap max-w-[110px] truncate">{m.trainer || '—'}</td>
                                <td className="py-2 px-3 text-right text-gray-300 font-mono whitespace-nowrap">
                                  {m.current_odds > 0 ? decToFrac(m.current_odds) : '—'}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1">
                                    {m.model_picks.map(mp => (
                                      <span key={mp} className="inline-block px-1.5 py-0.5 text-[9px] bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 uppercase">
                                        {mp}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {m.matching_combos.slice(0, 3).map((c, ci) => (
                                      <span key={ci} className="inline-block px-1.5 py-0.5 text-[9px] bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20 whitespace-nowrap"
                                        title={`${c.win_rate}% win, ${fmtProfit(c.profit)} P&L, ${fmtRoi(c.roi_pct)} ROI (${c.total_bets} bets)`}>
                                        {c.label}
                                      </span>
                                    ))}
                                    {m.matching_combos.length > 3 && (
                                      <span className="text-[9px] text-gray-600">+{m.matching_combos.length - 3}</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile */}
                      <div className="sm:hidden space-y-2">
                        {filteredMatches.map((m, i) => (
                          <div key={`mm-${m.race_id}-${m.horse_id}-${i}`}
                            className="bg-gray-800/30 border border-yellow-500/20 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-gray-500">{m.off_time} · {m.course}</span>
                              <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                                RACE_TYPE_COLORS[m.race_type] || 'bg-gray-700 text-gray-300'
                              }`}>
                                {m.race_type === 'aw' ? 'AW' : m.race_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1.5">
                              {m.silk_url && <img src={m.silk_url} alt="" className="w-5 h-5 object-contain" />}
                              <span className="text-sm text-white font-medium truncate">{m.horse_name}</span>
                              <span className="text-xs text-gray-500 font-mono ml-auto">
                                {m.current_odds > 0 ? decToFrac(m.current_odds) : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
                              <span>J: {m.jockey || '—'}</span>
                              <span>T: {m.trainer || '—'}</span>
                            </div>
                            {m.model_picks.length > 0 && (
                              <div className="flex items-center gap-1 mb-1.5">
                                {m.model_picks.map(mp => (
                                  <span key={mp} className="inline-block px-1.5 py-0.5 text-[9px] bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 uppercase">
                                    {mp}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1 flex-wrap">
                              {m.matching_combos.map((c, ci) => (
                                <span key={ci} className="inline-block px-1.5 py-0.5 text-[9px] bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
                                  {c.label} ({fmtRoi(c.roi_pct)})
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
