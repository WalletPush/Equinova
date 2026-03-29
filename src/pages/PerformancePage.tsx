import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'
import { fmtPL, formatDateShort, formatMonthLabel, settledPLForBet, PERIOD_OPTIONS } from '@/lib/performanceUtils'
import { PerformanceKPIGrid } from '@/components/performance/PerformanceKPIGrid'
import { PerformanceEquityChart } from '@/components/performance/PerformanceEquityChart'
import { PerformanceInsightsStrip } from '@/components/performance/PerformanceInsightsStrip'
import { PerformanceYouVsSystem } from '@/components/performance/PerformanceYouVsSystem'
import { PerformanceDailyBreakdown } from '@/components/performance/PerformanceDailyBreakdown'
import { PerformanceMonthlyTab } from '@/components/performance/PerformanceMonthlyTab'
import { PerformanceTrustTab } from '@/components/performance/PerformanceTrustTab'
import type {
  UserBet, DaySummary, PeriodFilter, ActiveTab,
  SystemBenchmark, TotalStats, Insight, MonthSummary, TrustTierSummary,
} from '@/components/performance/types'
import { Loader2, BarChart3, Zap, Plus, Download } from 'lucide-react'

export function PerformancePage() {
  const { user } = useAuth()
  const { bankroll, needsSetup, isLoading: bankrollLoading, addFunds, isAddingFunds } = useBankroll()
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'daily' | 'all'>('daily')
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [period, setPeriod] = useState<PeriodFilter>('lifetime')
  const [showAddFunds, setShowAddFunds] = useState(false)
  const [addAmount, setAddAmount] = useState('')

  const { data: betsData, isLoading: betsLoading } = useQuery({
    queryKey: ['user-bets-all'],
    queryFn: async () => {
      const res = await callSupabaseFunction('get-user-bets', {
        limit: 5000,
        offset: 0,
        order_by: 'created_at',
        order_dir: 'asc',
      })
      return res?.data as { bets: UserBet[]; summary: any }
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const bets = betsData?.bets ?? []

  const { data: systemData } = useQuery({
    queryKey: ['system-benchmark'],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/performance-summary`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
        body: JSON.stringify({ start_date: '2025-01-01', end_date: today, race_type: 'all', model: 'ensemble', signal: 'all' }),
      })
      if (!res.ok) return null
      const json = await res.json()
      return json?.data ?? null
    },
    staleTime: 1000 * 60 * 60,
    enabled: !!user,
  })

  const filteredBets = useMemo(() => {
    if (period === 'lifetime') return bets
    const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[period]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return bets.filter(b => {
      const date = b.race_date || b.created_at?.split('T')[0] || ''
      return date >= cutoffStr
    })
  }, [bets, period])

  const startingBankroll = useMemo(() => {
    if (!bets.length) return bankroll
    let settledPL = 0
    let pendingExposure = 0
    for (const b of bets) {
      if (b.status === 'won') settledPL += Number(b.potential_return) - Number(b.bet_amount)
      else if (b.status === 'lost') settledPL -= Number(b.bet_amount)
      else if (b.status === 'pending') pendingExposure += Number(b.bet_amount)
    }
    return bankroll - settledPL + pendingExposure
  }, [bets, bankroll])

  const bankrollGrowth = useMemo(() => {
    if (!bets.length || startingBankroll <= 0) return 0
    let settledPL = 0
    for (const b of bets) {
      settledPL += settledPLForBet(b)
    }
    return (settledPL / startingBankroll) * 100
  }, [bets, startingBankroll])

  const systemBenchmark = useMemo<SystemBenchmark | null>(() => {
    if (!systemData?.ml_models?.by_date) return null
    const byDate = systemData.ml_models.by_date as Record<string, Record<string, { total_picks: number; wins: number; win_rate: number; top3_rate: number; profit: number; roi_pct: number }>>
    const agg = (systemData.ml_models.aggregated as any)?.ensemble
    const dates = Object.keys(byDate).sort()
    let cumulative = 0
    const cumulativeByDate: Record<string, number> = {}
    for (const date of dates) {
      const stats = byDate[date]?.ensemble
      if (stats) cumulative += stats.profit
      cumulativeByDate[date] = cumulative
    }
    return {
      cumulativeByDate,
      totalPicks: agg?.total_picks ?? 0,
      wins: agg?.wins ?? 0,
      winRate: agg?.win_rate ?? 0,
      roi: agg?.roi_pct ?? 0,
      profit: agg?.profit ?? 0,
    }
  }, [systemData])

  const { dailySummaries, totalStats } = useMemo<{ dailySummaries: DaySummary[]; totalStats: TotalStats | null }>(() => {
    if (!filteredBets.length) return { dailySummaries: [], totalStats: null }

    const byDay = new Map<string, UserBet[]>()
    for (const b of filteredBets) {
      const date = b.race_date || b.created_at?.split('T')[0] || 'unknown'
      const arr = byDay.get(date) || []
      arr.push(b)
      byDay.set(date, arr)
    }

    const totalWins = filteredBets.filter(b => b.status === 'won').length
    const totalLosses = filteredBets.filter(b => b.status === 'lost').length
    const totalPending = filteredBets.filter(b => b.status === 'pending').length
    const settledBets = filteredBets.filter(b => b.status !== 'pending')

    let settledPL = 0
    for (const b of settledBets) settledPL += settledPLForBet(b)

    const pendingExposure = filteredBets
      .filter(b => b.status === 'pending')
      .reduce((s, b) => s + Number(b.bet_amount), 0)

    const totalSettledStaked = settledBets.reduce((s, b) => s + Number(b.bet_amount), 0)

    const bankrollReturn = startingBankroll > 0 ? (settledPL / startingBankroll) * 100 : 0
    const bettingROI = totalSettledStaked > 0 ? (settledPL / totalSettledStaked) * 100 : 0

    let runningPL = 0
    let runningSettledStaked = 0
    const summaries: DaySummary[] = []
    const sortedDays = [...byDay.keys()].sort()

    for (const date of sortedDays) {
      const dayBets = byDay.get(date)!
      const wins = dayBets.filter(b => b.status === 'won').length
      const losses = dayBets.filter(b => b.status === 'lost').length
      const pending = dayBets.filter(b => b.status === 'pending').length
      const daySettled = dayBets.filter(b => b.status !== 'pending')
      const daySettledStaked = daySettled.reduce((s, b) => s + Number(b.bet_amount), 0)
      let dayPL = 0
      for (const b of daySettled) dayPL += settledPLForBet(b)
      runningPL += dayPL
      runningSettledStaked += daySettledStaked
      const runningBettingROI = runningSettledStaked > 0 ? (runningPL / runningSettledStaked) * 100 : 0
      summaries.push({ date, bets: dayBets, wins, losses, pending, dayPL, daySettledStaked, runningPL, runningSettledStaked, runningBettingROI })
    }

    const settledCount = totalWins + totalLosses
    const winRate = settledCount > 0 ? (totalWins / settledCount) * 100 : 0
    const winningDays = summaries.filter(d => d.dayPL > 0).length
    const losingDays = summaries.filter(d => d.dayPL < 0).length

    let peak = 0, maxDrawdown = 0, runPL = 0
    for (const d of summaries) {
      runPL += d.dayPL
      if (runPL > peak) peak = runPL
      const dd = peak - runPL
      if (dd > maxDrawdown) maxDrawdown = dd
    }
    const peakBankroll = startingBankroll + peak
    const maxDrawdownPct = peakBankroll > 0 ? (maxDrawdown / peakBankroll) * 100 : 0

    const winningReturns = filteredBets
      .filter(b => b.status === 'won')
      .reduce((s, b) => s + (Number(b.potential_return) - Number(b.bet_amount)), 0)
    const losingAmount = filteredBets
      .filter(b => b.status === 'lost')
      .reduce((s, b) => s + Number(b.bet_amount), 0)
    const profitFactor = losingAmount > 0 ? winningReturns / losingAmount : (winningReturns > 0 ? Infinity : 0)
    const expectancy = settledCount > 0 ? settledPL / settledCount : 0

    let longestWinStreak = 0, longestLoseStreak = 0, curWin = 0, curLose = 0
    for (const b of filteredBets) {
      if (b.status === 'pending') continue
      if (b.status === 'won') {
        curWin++; curLose = 0
        if (curWin > longestWinStreak) longestWinStreak = curWin
      } else {
        curLose++; curWin = 0
        if (curLose > longestLoseStreak) longestLoseStreak = curLose
      }
    }

    const bestDay = summaries.length > 0 ? summaries.reduce((a, b) => b.dayPL > a.dayPL ? b : a) : null
    const worstDay = summaries.length > 0 ? summaries.reduce((a, b) => b.dayPL < a.dayPL ? b : a) : null
    const avgStakePct = startingBankroll > 0 && settledBets.length > 0
      ? (totalSettledStaked / settledBets.length / startingBankroll) * 100 : 0

    return {
      dailySummaries: summaries,
      totalStats: {
        totalBets: filteredBets.length, settledCount, totalWins, totalLosses, totalPending,
        settledPL, pendingExposure, totalSettledStaked,
        bankrollReturn, bettingROI, startingBankroll,
        winRate, winningDays, losingDays, totalDays: summaries.length,
        maxDrawdown, maxDrawdownPct, profitFactor, expectancy,
        longestWinStreak, longestLoseStreak, bestDay, worstDay, avgStakePct,
      },
    }
  }, [filteredBets, bankroll, startingBankroll])

  const chartData = useMemo(() => {
    if (!dailySummaries.length) return []
    let running = 0
    const startBR = totalStats?.startingBankroll ?? bankroll
    const avgStake = totalStats && totalStats.settledCount > 0
      ? totalStats.totalSettledStaked / totalStats.settledCount : 1

    let systemBaseOffset = 0
    if (systemBenchmark) {
      const firstDate = dailySummaries[0]?.date
      const sysDates = Object.keys(systemBenchmark.cumulativeByDate).sort()
      for (const d of sysDates) {
        if (d >= firstDate) break
        systemBaseOffset = systemBenchmark.cumulativeByDate[d]
      }
    }

    const data: { label: string; pl: number; bankroll: number; systemPL: number | null }[] = [
      { label: 'Start', pl: 0, bankroll: startBR, systemPL: systemBenchmark ? 0 : null },
    ]
    for (const d of dailySummaries) {
      running += d.dayPL
      let sysPL: number | null = null
      if (systemBenchmark) {
        const rawCum = systemBenchmark.cumulativeByDate[d.date]
        if (rawCum != null) {
          sysPL = Number(((rawCum - systemBaseOffset) * avgStake).toFixed(2))
        } else {
          sysPL = data[data.length - 1]?.systemPL ?? 0
        }
      }
      data.push({
        label: formatDateShort(d.date),
        pl: Number(running.toFixed(2)),
        bankroll: Number((startBR + running).toFixed(2)),
        systemPL: sysPL,
      })
    }
    return data
  }, [dailySummaries, totalStats, bankroll, systemBenchmark])

  const gradientOffset = useMemo(() => {
    if (!chartData.length) return 1
    const max = Math.max(...chartData.map(d => d.pl))
    const min = Math.min(...chartData.map(d => d.pl))
    if (max <= 0) return 0
    if (min >= 0) return 1
    return max / (max - min)
  }, [chartData])

  const maxDrawdownPoint = useMemo(() => {
    if (chartData.length < 2) return null
    let peak = 0, maxDD = 0, maxIdx = -1
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].pl > peak) peak = chartData[i].pl
      const dd = peak - chartData[i].pl
      if (dd > maxDD) { maxDD = dd; maxIdx = i }
    }
    return maxIdx > 0 && maxDD > 0 ? { idx: maxIdx, label: chartData[maxIdx].label, pl: chartData[maxIdx].pl, dd: maxDD } : null
  }, [chartData])

  const insights = useMemo<Insight[]>(() => {
    if (!totalStats || totalStats.settledCount === 0) return []
    const items: Insight[] = []

    if (systemBenchmark && systemBenchmark.totalPicks > 0) {
      const sysWR = systemBenchmark.winRate
      const diff = totalStats.winRate - sysWR
      if (diff > 0) {
        items.push({ text: `Your ${totalStats.winRate.toFixed(0)}% win rate beats the system's ${sysWR.toFixed(0)}% — your bet selection is adding alpha.`, color: 'text-green-400' })
      } else if (diff < -5) {
        items.push({ text: `The system picks winners at ${sysWR.toFixed(0)}% vs your ${totalStats.winRate.toFixed(0)}% — following more Top Picks could help.`, color: 'text-yellow-400' })
      }
    }

    if (totalStats.profitFactor > 1.5 && totalStats.profitFactor < 99) {
      items.push({ text: `For every £1 lost on losing bets, your winners bring back £${totalStats.profitFactor.toFixed(2)} — you're making more than you lose.`, color: 'text-green-400' })
    } else if (totalStats.profitFactor > 0 && totalStats.profitFactor < 1) {
      items.push({ text: `Your losses are currently outweighing your wins — sticking to higher-confidence picks could help.`, color: 'text-yellow-400' })
    }

    if (totalStats.expectancy > 0) {
      items.push({ text: `On average you make ${fmtPL(totalStats.expectancy)} profit per settled bet — the more you bet, the more you earn.`, color: 'text-green-400' })
    }

    if (totalStats.maxDrawdownPct > 15) {
      items.push({ text: `Max drawdown hit ${totalStats.maxDrawdownPct.toFixed(1)}% — consider smaller stakes to smooth volatility.`, color: 'text-orange-400' })
    } else if (totalStats.maxDrawdownPct > 0 && totalStats.maxDrawdownPct <= 10) {
      items.push({ text: `Drawdown contained at ${totalStats.maxDrawdownPct.toFixed(1)}% — disciplined risk management.`, color: 'text-green-400' })
    }

    if (totalStats.longestWinStreak >= 4) {
      items.push({ text: `${totalStats.longestWinStreak}-bet winning streak shows the model finds consistent value runs.`, color: 'text-green-400' })
    }

    return items.slice(0, 3)
  }, [totalStats, systemBenchmark])

  const monthSummaries = useMemo<MonthSummary[]>(() => {
    if (!filteredBets.length) return []
    const byMonth = new Map<string, UserBet[]>()
    for (const b of filteredBets) {
      const date = b.race_date || b.created_at?.split('T')[0] || 'unknown'
      const month = date.substring(0, 7)
      const arr = byMonth.get(month) || []
      arr.push(b)
      byMonth.set(month, arr)
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, monthBets]) => {
        const settled = monthBets.filter(b => b.status !== 'pending')
        const wins = monthBets.filter(b => b.status === 'won').length
        const losses = monthBets.filter(b => b.status === 'lost').length
        const pending = monthBets.filter(b => b.status === 'pending').length
        const settledStaked = settled.reduce((s, b) => s + Number(b.bet_amount), 0)
        let pl = 0
        for (const b of settled) pl += settledPLForBet(b)
        const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
        const roi = settledStaked > 0 ? (pl / settledStaked) * 100 : 0
        return { month, label: formatMonthLabel(month), totalBets: monthBets.length, settled: settled.length, pending, wins, losses, settledStaked, pl, roi, winRate: wr }
      })
  }, [filteredBets])

  const trustTierSummaries = useMemo<TrustTierSummary[]>(() => {
    const hasTrustData = filteredBets.some(b => b.trust_tier)
    if (!hasTrustData) return []
    const tiers = [
      { key: 'Strong', bgClass: 'bg-green-500/10 border-green-500/20', textClass: 'text-green-400', barColor: '#22c55e' },
      { key: 'Medium', bgClass: 'bg-yellow-500/10 border-yellow-500/20', textClass: 'text-yellow-400', barColor: '#eab308' },
      { key: 'Low', bgClass: 'bg-orange-500/10 border-orange-500/20', textClass: 'text-orange-400', barColor: '#f97316' },
    ]
    return tiers.map(({ key, bgClass, textClass, barColor }) => {
      const tierBets = filteredBets.filter(b => b.trust_tier === key)
      if (!tierBets.length) return null
      const settled = tierBets.filter(b => b.status !== 'pending')
      const wins = tierBets.filter(b => b.status === 'won').length
      const losses = tierBets.filter(b => b.status === 'lost').length
      const settledStaked = settled.reduce((s, b) => s + Number(b.bet_amount), 0)
      let pl = 0
      for (const b of settled) pl += settledPLForBet(b)
      const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
      const roi = settledStaked > 0 ? (pl / settledStaked) * 100 : 0
      const avgStake = settled.length > 0 ? settledStaked / settled.length : 0
      const edgeBets = tierBets.filter(b => b.edge_pct != null)
      const avgEdge = edgeBets.length > 0
        ? edgeBets.reduce((s, b) => s + Number(b.edge_pct ?? 0), 0) / edgeBets.length * 100 : 0
      return { key, bgClass, textClass, barColor, totalBets: tierBets.length, wins, losses, settledStaked, pl, roi, winRate: wr, avgStake, avgEdge }
    }).filter(Boolean) as TrustTierSummary[]
  }, [filteredBets])

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Course', 'Time', 'Horse', 'Odds', 'Stake', 'Status', 'P/L', 'Trust Tier', 'Edge %']
    const rows = filteredBets.map(b => {
      const pl = settledPLForBet(b)
      return [
        b.race_date || b.created_at?.split('T')[0] || '',
        b.course || '', b.off_time?.substring(0, 5) || '', b.horse_name || '',
        b.current_odds || '', Number(b.bet_amount).toFixed(2), b.status,
        b.status === 'pending' ? '' : pl.toFixed(2),
        b.trust_tier || '', b.edge_pct != null ? (Number(b.edge_pct) * 100).toFixed(1) : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `equinova-performance-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [filteredBets])

  const isLoading = bankrollLoading || betsLoading

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mr-3" />
          <span className="text-gray-400">Loading your performance...</span>
        </div>
      </AppLayout>
    )
  }

  const handleAddFunds = async () => {
    const val = parseFloat(addAmount)
    if (!val || val <= 0) return
    await addFunds(val)
    setAddAmount('')
    setShowAddFunds(false)
  }

  const riskLevel = (totalStats?.avgStakePct ?? 0) < 2 ? 'Conservative'
    : (totalStats?.avgStakePct ?? 0) < 4 ? 'Balanced' : 'Aggressive'
  const riskColor = (totalStats?.avgStakePct ?? 0) < 2 ? 'text-green-400'
    : (totalStats?.avgStakePct ?? 0) < 4 ? 'text-yellow-400' : 'text-red-400'

  return (
    <AppLayout>
      {needsSetup && <BankrollSetupModal onSetup={addFunds} isSubmitting={isAddingFunds} />}

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-yellow-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">My Performance</h1>
              <p className="text-xs text-gray-500">Track your betting results</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {bets.length > 0 && (
              <button onClick={exportCSV} title="Export CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-yellow-500/30 transition-colors">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            <button onClick={() => setShowAddFunds(!showAddFunds)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-yellow-500/30 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Add Funds
            </button>
          </div>
        </div>

        {showAddFunds && (
          <div className="bg-gray-800/80 border border-yellow-500/20 rounded-xl p-4 flex items-center gap-3">
            <input type="number" step="1" min="1" value={addAmount} onChange={e => setAddAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              placeholder="Amount (£)" autoFocus />
            <button onClick={handleAddFunds} disabled={isAddingFunds || !addAmount}
              className="px-4 py-2 bg-yellow-500 text-gray-900 rounded-lg text-sm font-bold hover:bg-yellow-400 disabled:opacity-50">
              {isAddingFunds ? 'Adding...' : 'Add'}
            </button>
            <button onClick={() => { setShowAddFunds(false); setAddAmount('') }}
              className="px-3 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
          </div>
        )}

        {bets.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No bets placed yet</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto mb-4">
              Head to Top Picks to find pattern-matched selections and place your first bet
            </p>
            <Link to="/auto-bets"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-gray-900 rounded-xl font-bold text-sm hover:bg-yellow-400 transition-colors">
              <Zap className="w-4 h-4" />View Top Picks
            </Link>
          </div>
        )}

        {bets.length > 0 && (
          <>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5 w-fit">
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setPeriod(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    period === opt.value ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {filteredBets.length > 0 ? (
              <>
                {totalStats && (
                  <PerformanceKPIGrid
                    bankroll={bankroll}
                    bankrollGrowth={bankrollGrowth}
                    totalStats={totalStats}
                    startingBankroll={startingBankroll}
                  />
                )}

                <PerformanceEquityChart
                  chartData={chartData}
                  gradientOffset={gradientOffset}
                  maxDrawdownPoint={maxDrawdownPoint}
                  totalStats={totalStats!}
                  systemBenchmark={systemBenchmark}
                />

                {totalStats && (
                  <PerformanceInsightsStrip
                    totalStats={totalStats}
                    insights={insights}
                    riskLevel={riskLevel}
                    riskColor={riskColor}
                  />
                )}

                {systemBenchmark && systemBenchmark.totalPicks > 0 && totalStats && (
                  <PerformanceYouVsSystem
                    totalStats={totalStats}
                    systemBenchmark={systemBenchmark}
                  />
                )}

                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                  {([
                    { key: 'overview' as const, label: 'Overview' },
                    { key: 'monthly' as const, label: 'Monthly' },
                    { key: 'trust' as const, label: 'Trust Tier' },
                  ]).map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                        activeTab === tab.key ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'overview' && totalStats && (
                  <PerformanceDailyBreakdown
                    dailySummaries={dailySummaries}
                    expandedDay={expandedDay}
                    onToggleDay={(date) => setExpandedDay(expandedDay === date ? null : date)}
                    totalStats={totalStats}
                    bankroll={bankroll}
                    activeView={activeView}
                    filteredBets={filteredBets}
                    onSetActiveView={setActiveView}
                  />
                )}

                {activeTab === 'monthly' && (
                  <PerformanceMonthlyTab monthSummaries={monthSummaries} />
                )}

                {activeTab === 'trust' && (
                  <PerformanceTrustTab trustTierSummaries={trustTierSummaries} />
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-500 text-sm mb-2">No bets in the selected period</div>
                <button onClick={() => setPeriod('lifetime')}
                  className="text-yellow-400 text-sm hover:text-yellow-300 transition-colors">
                  View all time
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
