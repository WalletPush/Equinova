import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { AppLayout } from '@/components/AppLayout'
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Radar,
  FileDown,
  HelpCircle,
  RefreshCw,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────

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
  finishing_position: number | null
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

// ─── Component ───────────────────────────────────────────────────────

export function PerformancePage() {
  const [comboScanData, setComboScanData] = useState<ComboScanData | null>(null)
  const [comboScanning, setComboScanning] = useState(false)
  const [comboError, setComboError] = useState<string | null>(null)
  const [comboRaceTypeFilter, setComboRaceTypeFilter] = useState<string>('all')
  const [comboSortField, setComboSortField] = useState<'roi_pct' | 'win_rate' | 'profit'>('roi_pct')
  const [comboSortDir, setComboSortDir] = useState<'desc' | 'asc'>('desc')
  const [expandedCombo, setExpandedCombo] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

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

  // Auto-run on page load
  useEffect(() => { runComboScan() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const comboKey = (c: ComboResult) => `${c.race_type}__${c.signal}`

  const handleComboRowClick = useCallback((c: ComboResult) => {
    const key = comboKey(c)
    setExpandedCombo(prev => prev === key ? null : key)
  }, [])

  // Get matches for a specific combo
  const getMatchesForCombo = useCallback((c: ComboResult): TodayMatch[] => {
    if (!comboScanData) return []
    return comboScanData.today_matches.filter(m =>
      m.race_type === c.race_type &&
      m.matching_combos.some(mc => mc.signal === c.signal),
    )
  }, [comboScanData])

  const exportComboCSV = useCallback(() => {
    if (!comboScanData) return
    const today = getUKDateString()
    const lines: string[] = []
    lines.push('EQUINOVA - LIFETIME COMBO SCANNER')
    lines.push(`Date: ${today}`)
    lines.push(`Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`)
    lines.push(`Profitable combos: ${comboScanData.top_combinations.length}`)
    lines.push(`Today's matches: ${comboScanData.today_matches.length}`)
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

  // Inline match rows component
  const MatchesDropdown = ({ combo }: { combo: ComboResult }) => {
    const matches = getMatchesForCombo(combo)
    if (matches.length === 0) {
      return (
        <div className="px-4 py-3 text-xs text-gray-500 italic">
          No runners today match this signal for {combo.race_type === 'aw' ? 'AW' : combo.race_type} races.
        </div>
      )
    }
    return (
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[10px] text-yellow-400/70 uppercase tracking-wider font-semibold mb-1">
          {matches.length} {matches.length === 1 ? 'runner matches' : 'runners match'} today
        </div>
        {matches.map((m, i) => (
          <div key={`${m.race_id}-${m.horse_id}-${i}`}
            className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-gray-800/40 text-xs">
            <span className="text-gray-400 font-mono w-12 flex-shrink-0">{m.off_time}</span>
            <span className="text-gray-400 w-24 truncate flex-shrink-0">{m.course}</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {m.silk_url && <img src={m.silk_url} alt="" className="w-4 h-4 object-contain flex-shrink-0" />}
              <span className="text-white font-medium truncate">{m.horse_name}</span>
            </div>
            <span className="text-gray-400 font-mono w-10 text-right flex-shrink-0">
              {m.current_odds > 0 ? decToFrac(m.current_odds) : '—'}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {m.model_picks.slice(0, 3).map(mp => (
                <span key={mp} className="px-1 py-0.5 text-[8px] bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 uppercase">
                  {mp}
                </span>
              ))}
            </div>
            <span className={`w-10 text-right font-bold flex-shrink-0 ${
              m.finishing_position == null ? 'text-gray-600 text-[10px] font-normal'
              : m.finishing_position === 1 ? 'text-green-400'
              : m.finishing_position <= 3 ? 'text-yellow-400'
              : 'text-gray-500'
            }`}>
              {m.finishing_position != null ? fmtPos(m.finishing_position) : '—'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Mobile match cards
  const MobileMatchesDropdown = ({ combo }: { combo: ComboResult }) => {
    const matches = getMatchesForCombo(combo)
    if (matches.length === 0) {
      return (
        <div className="px-3 py-2 text-xs text-gray-500 italic">
          No runners today match this signal.
        </div>
      )
    }
    return (
      <div className="px-3 pb-3 space-y-1.5">
        <div className="text-[10px] text-yellow-400/70 uppercase tracking-wider font-semibold">
          {matches.length} {matches.length === 1 ? 'match' : 'matches'} today
        </div>
        {matches.map((m, i) => (
          <div key={`${m.race_id}-${m.horse_id}-${i}`}
            className="flex items-center gap-2 py-1.5 px-2 rounded bg-gray-800/40 text-xs">
            <span className="text-gray-500 font-mono text-[10px]">{m.off_time}</span>
            {m.silk_url && <img src={m.silk_url} alt="" className="w-4 h-4 object-contain" />}
            <span className="text-white font-medium truncate flex-1">{m.horse_name}</span>
            <span className="text-gray-400 font-mono text-[10px]">
              {m.current_odds > 0 ? decToFrac(m.current_odds) : ''}
            </span>
            {m.finishing_position != null && (
              <span className={`font-bold text-[10px] ${
                m.finishing_position === 1 ? 'text-green-400'
                : m.finishing_position <= 3 ? 'text-yellow-400'
                : 'text-gray-500'
              }`}>
                {fmtPos(m.finishing_position)}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Radar className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl font-bold text-white">Lifetime Combo Scanner</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runComboScan} disabled={comboScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50">
              {comboScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {comboScanning ? 'Scanning...' : 'Re-scan'}
            </button>
            {comboScanData && (
              <button onClick={exportComboCSV}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 hover:text-white transition-colors">
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
            )}
          </div>
        </div>

        {/* How to use guide */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="text-sm font-medium text-yellow-400">How to use the Combo Scanner</span>
            <div className="ml-auto text-gray-500">
              {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showGuide && (
            <div className="border-t border-gray-800 px-4 py-4 space-y-3 text-xs text-gray-300 leading-relaxed">
              <p>
                This page automatically scans <strong className="text-white">all historical race data since January 2024</strong> and finds signal combinations that have been <strong className="text-white">profitable</strong> — meaning they've made money at level stakes (£1 per bet at Starting Price).
              </p>
              <p>
                Results are broken down by <strong className="text-white">race type</strong> (Flat, AW, Hurdles, Chase) because a signal that works well on All Weather might not work on Flat turf. Use the tabs to filter by race type.
              </p>
              <p>
                <strong className="text-white">Click any row</strong> in the table to instantly see which of today's runners match that signal. This saves you scrolling — you can check each profitable combo one by one and see if there are any runners today worth backing.
              </p>
              <p>
                Click the <strong className="text-white">Win %</strong>, <strong className="text-white">P&L</strong>, or <strong className="text-white">ROI</strong> column headers to sort the table. The <strong className="text-white">CSV</strong> button exports everything for your own analysis.
              </p>
            </div>
          )}
        </div>

        {/* Loading */}
        {comboScanning && (
          <div className="flex items-center justify-center py-16 bg-gray-900/60 border border-yellow-500/20 rounded-xl">
            <Loader2 className="w-6 h-6 text-yellow-400 animate-spin mr-3" />
            <span className="text-gray-300">Scanning lifetime data across all race types...</span>
          </div>
        )}

        {/* Error */}
        {comboError && !comboScanning && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-400">{comboError}</p>
              <button onClick={runComboScan} className="text-xs text-red-400/70 underline mt-1">Try again</button>
            </div>
          </div>
        )}

        {/* Results */}
        {comboScanData && !comboScanning && (
          <div className="space-y-4">
            {/* Race type tabs + meta */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                {['all', 'flat', 'aw', 'hurdles', 'chase'].map(rt => (
                  <button key={rt} onClick={() => { setComboRaceTypeFilter(rt); setExpandedCombo(null) }}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded transition-all capitalize ${
                      comboRaceTypeFilter === rt ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                    }`}>
                    {rt === 'all' ? 'All Types' : rt === 'aw' ? 'AW' : rt}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{comboScanData.meta.historical_races} races analysed</span>
                <span className="text-gray-700">·</span>
                <span>{comboScanData.top_combinations.length} profitable combos</span>
                <span className="text-gray-700">·</span>
                <span className="text-yellow-400">{comboScanData.today_matches.length} matches today</span>
              </div>
            </div>

            {filteredCombos.length === 0 ? (
              <div className="text-center py-12">
                <Radar className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No profitable combinations for this race type.</p>
              </div>
            ) : (
              <>
                {/* Desktop table with inline expansion */}
                <div className="hidden sm:block overflow-x-auto rounded-xl border border-gray-700/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-800/80 text-gray-500 uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-3 text-left w-6"></th>
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
                        <th className="py-2 px-3 text-right">Today</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {filteredCombos.map((c, i) => {
                        const key = comboKey(c)
                        const isExpanded = expandedCombo === key
                        const matchCount = getMatchesForCombo(c).length
                        return (
                          <React.Fragment key={`${key}-${i}`}>
                            <tr
                              onClick={() => handleComboRowClick(c)}
                              className={`cursor-pointer transition-colors ${
                                isExpanded
                                  ? 'bg-yellow-500/10'
                                  : 'hover:bg-gray-800/30'
                              }`}>
                              <td className="py-2 px-3 text-gray-500">
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-yellow-400" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </td>
                              <td className="py-2 px-3">
                                <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                                  RACE_TYPE_COLORS[c.race_type] || 'bg-gray-700 text-gray-300'
                                }`}>
                                  {c.race_type === 'aw' ? 'AW' : c.race_type}
                                </span>
                              </td>
                              <td className={`py-2 px-3 ${isExpanded ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>{c.label}</td>
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
                              <td className="py-2 px-3 text-right">
                                {matchCount > 0 ? (
                                  <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 text-[10px] font-bold bg-yellow-500/20 text-yellow-400 rounded-full">
                                    {matchCount}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-600">—</span>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} className="p-0 bg-yellow-500/5 border-t border-b border-yellow-500/20">
                                  <MatchesDropdown combo={c} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards with inline expansion */}
                <div className="sm:hidden space-y-1.5">
                  {/* Sort controls */}
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
                    const key = comboKey(c)
                    const isExpanded = expandedCombo === key
                    const matchCount = getMatchesForCombo(c).length
                    return (
                      <div key={`m-${key}-${i}`}
                        className={`rounded-lg overflow-hidden transition-colors ${
                          isExpanded
                            ? 'bg-yellow-500/5 border border-yellow-500/30'
                            : 'bg-gray-800/30 border border-gray-700/30'
                        }`}>
                        <div
                          onClick={() => handleComboRowClick(c)}
                          className="p-3 cursor-pointer">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase rounded ${
                                RACE_TYPE_COLORS[c.race_type] || 'bg-gray-700 text-gray-300'
                              }`}>
                                {c.race_type === 'aw' ? 'AW' : c.race_type}
                              </span>
                              {matchCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[18px] px-1 py-0.5 text-[9px] font-bold bg-yellow-500/20 text-yellow-400 rounded-full">
                                  {matchCount} today
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${c.roi_pct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtRoi(c.roi_pct)}
                              </span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-yellow-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                            </div>
                          </div>
                          <div className={`text-sm mb-1 ${isExpanded ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>{c.label}</div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <span>{c.total_bets} bets</span>
                            <span>{c.wins} wins</span>
                            <span>{c.win_rate}%</span>
                            <span className={c.profit > 0 ? 'text-green-400' : 'text-red-400'}>{fmtProfit(c.profit)}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-yellow-500/20">
                            <MobileMatchesDropdown combo={c} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
