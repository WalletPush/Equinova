import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { BankrollSetupModal } from '@/components/BankrollSetupModal'
import { useBankroll } from '@/hooks/useBankroll'
import { useAuth } from '@/contexts/AuthContext'
import { callSupabaseFunction } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, Line,
  BarChart, Bar, Cell, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Trophy, Target, Loader2,
  ChevronDown, ChevronUp, BarChart3, Wallet, CheckCircle,
  XCircle, Clock, Zap, Plus, Download, ShieldCheck,
  Activity, ArrowDownRight, Brain, Users,
} from 'lucide-react'

interface UserBet {
  id: number
  user_id: string
  race_id: string
  race_date: string
  course: string
  off_time: string
  horse_name: string
  horse_id: string
  trainer_name: string
  jockey_name: string
  current_odds: string
  bet_amount: number
  bet_type: string
  status: 'pending' | 'won' | 'lost'
  potential_return: number
  created_at: string
  updated_at: string
  trust_tier?: string | null
  trust_score?: number | null
  edge_pct?: number | null
  ensemble_proba?: number | null
  signal_combo_key?: string | null
}

interface DaySummary {
  date: string
  bets: UserBet[]
  wins: number
  losses: number
  pending: number
  dayPL: number
  dayStaked: number
  runningPL: number
  runningStaked: number
  runningROI: number
}

type PeriodFilter = '7d' | '14d' | '30d' | '90d' | 'lifetime'
type ActiveTab = 'overview' | 'monthly' | 'trust'

function fmtPL(v: number) {
  return `${v >= 0 ? '+' : '-'}£${Math.abs(v).toFixed(2)}`
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatMonthLabel(monthStr: string) {
  const [year, month] = monthStr.split('-')
  const d = new Date(Number(year), Number(month) - 1)
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '14d', label: '14D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'lifetime', label: 'All' },
]

function PLTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-gray-400 mb-1">{d.label}</div>
      <div className={`font-bold ${d.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>You: {fmtPL(d.pl)}</div>
      {d.systemPL != null && (
        <div className="text-cyan-400 mt-0.5">System: {fmtPL(d.systemPL)}</div>
      )}
      <div className="text-gray-500 mt-0.5">Bankroll: £{d.bankroll.toFixed(2)}</div>
    </div>
  )
}

function TrustTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-gray-400 mb-1">{d.name} Trust</div>
      <div className={`font-bold ${d.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        ROI: {d.roi >= 0 ? '+' : ''}{d.roi}%
      </div>
      <div className="text-gray-500 mt-0.5">Win Rate: {d.winRate}%</div>
    </div>
  )
}

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
        limit: 500,
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
        body: JSON.stringify({ start_date: '2026-03-01', end_date: today, race_type: 'all', model: 'ensemble', signal: 'all' }),
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
    let allTimePL = 0
    for (const b of bets) {
      if (b.status === 'won') allTimePL += Number(b.potential_return) - Number(b.bet_amount)
      else if (b.status === 'lost') allTimePL -= Number(b.bet_amount)
      else if (b.status === 'pending') allTimePL -= Number(b.bet_amount)
    }
    return bankroll - allTimePL
  }, [bets, bankroll])

  const bankrollGrowth = useMemo(() => {
    if (!bets.length || startingBankroll <= 0) return 0
    return ((bankroll - startingBankroll) / startingBankroll) * 100
  }, [bets, bankroll, startingBankroll])

  const systemBenchmark = useMemo(() => {
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

  const { dailySummaries, totalStats } = useMemo(() => {
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
    const totalStaked = filteredBets.reduce((s, b) => s + Number(b.bet_amount), 0)
    let totalPL = 0
    for (const b of filteredBets) {
      if (b.status === 'won') totalPL += Number(b.potential_return) - Number(b.bet_amount)
      else if (b.status === 'lost') totalPL -= Number(b.bet_amount)
      else if (b.status === 'pending') totalPL -= Number(b.bet_amount)
    }
    const roi = startingBankroll > 0 ? (totalPL / startingBankroll) * 100 : 0

    let runningPL = 0
    let runningStaked = 0
    const summaries: DaySummary[] = []
    const sortedDays = [...byDay.keys()].sort()

    for (const date of sortedDays) {
      const dayBets = byDay.get(date)!
      const wins = dayBets.filter(b => b.status === 'won').length
      const losses = dayBets.filter(b => b.status === 'lost').length
      const pending = dayBets.filter(b => b.status === 'pending').length
      const dayStaked = dayBets.reduce((s, b) => s + Number(b.bet_amount), 0)
      let dayPL = 0
      for (const b of dayBets) {
        if (b.status === 'won') dayPL += Number(b.potential_return) - Number(b.bet_amount)
        else if (b.status === 'lost') dayPL -= Number(b.bet_amount)
        else if (b.status === 'pending') dayPL -= Number(b.bet_amount)
      }
      runningPL += dayPL
      runningStaked += dayStaked
      const runningROI = startingBankroll > 0 ? (runningPL / startingBankroll) * 100 : 0
      summaries.push({ date, bets: dayBets, wins, losses, pending, dayPL, dayStaked, runningPL, runningStaked, runningROI })
    }

    const winRate = (totalWins + totalLosses) > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : 0
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
    const settledCount = totalWins + totalLosses
    const expectancy = settledCount > 0 ? totalPL / settledCount : 0

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
    const avgStakePct = startingBankroll > 0 && filteredBets.length > 0
      ? (totalStaked / filteredBets.length / startingBankroll) * 100 : 0

    return {
      dailySummaries: summaries,
      totalStats: {
        totalBets: filteredBets.length, totalWins, totalLosses, totalPending,
        totalPL, totalStaked, roi, startingBankroll,
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
    const avgStake = totalStats && totalStats.totalBets > 0 ? totalStats.totalStaked / totalStats.totalBets : 1
    const data: { label: string; pl: number; bankroll: number; systemPL: number | null }[] = [
      { label: 'Start', pl: 0, bankroll: startBR, systemPL: systemBenchmark ? 0 : null },
    ]
    for (const d of dailySummaries) {
      running += d.dayPL
      const sysCum = systemBenchmark?.cumulativeByDate[d.date]
      data.push({
        label: formatDateShort(d.date),
        pl: Number(running.toFixed(2)),
        bankroll: Number((startBR + running).toFixed(2)),
        systemPL: sysCum != null ? Number((sysCum * avgStake).toFixed(2)) : data[data.length - 1]?.systemPL ?? null,
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

  const insights = useMemo(() => {
    if (!totalStats || !filteredBets.length) return []
    const items: { text: string; color: string }[] = []

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
      items.push({ text: `Profit factor of ${totalStats.profitFactor.toFixed(2)} — your winners are paying ${totalStats.profitFactor.toFixed(1)}x more than your losers cost.`, color: 'text-green-400' })
    } else if (totalStats.profitFactor < 1 && totalStats.profitFactor > 0) {
      items.push({ text: `Profit factor below 1.0 — consider tightening to higher-edge picks only.`, color: 'text-yellow-400' })
    }

    if (totalStats.expectancy > 0) {
      items.push({ text: `Expected value of ${fmtPL(totalStats.expectancy)} per bet — you have a quantifiable edge.`, color: 'text-green-400' })
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
  }, [totalStats, filteredBets, systemBenchmark])

  const monthSummaries = useMemo(() => {
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
        const wins = monthBets.filter(b => b.status === 'won').length
        const losses = monthBets.filter(b => b.status === 'lost').length
        const staked = monthBets.reduce((s, b) => s + Number(b.bet_amount), 0)
        let pl = 0
        for (const b of monthBets) {
          if (b.status === 'won') pl += Number(b.potential_return) - Number(b.bet_amount)
          else if (b.status === 'lost') pl -= Number(b.bet_amount)
        }
        const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
        const roi = startingBankroll > 0 ? (pl / startingBankroll) * 100 : 0
        return { month, label: formatMonthLabel(month), totalBets: monthBets.length, wins, losses, staked, pl, roi, winRate: wr }
      })
  }, [filteredBets, startingBankroll])

  const trustTierSummaries = useMemo(() => {
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
      const wins = tierBets.filter(b => b.status === 'won').length
      const losses = tierBets.filter(b => b.status === 'lost').length
      const staked = tierBets.reduce((s, b) => s + Number(b.bet_amount), 0)
      let pl = 0
      for (const b of tierBets) {
        if (b.status === 'won') pl += Number(b.potential_return) - Number(b.bet_amount)
        else if (b.status === 'lost') pl -= Number(b.bet_amount)
      }
      const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
      const roi = startingBankroll > 0 ? (pl / startingBankroll) * 100 : 0
      const avgStake = tierBets.length > 0 ? staked / tierBets.length : 0
      const edgeBets = tierBets.filter(b => b.edge_pct != null)
      const avgEdge = edgeBets.length > 0
        ? edgeBets.reduce((s, b) => s + Number(b.edge_pct ?? 0), 0) / edgeBets.length * 100 : 0
      return { key, bgClass, textClass, barColor, totalBets: tierBets.length, wins, losses, staked, pl, roi, winRate: wr, avgStake, avgEdge }
    }).filter(Boolean) as { key: string; bgClass: string; textClass: string; barColor: string; totalBets: number; wins: number; losses: number; staked: number; pl: number; roi: number; winRate: number; avgStake: number; avgEdge: number }[]
  }, [filteredBets, startingBankroll])

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Course', 'Time', 'Horse', 'Odds', 'Stake', 'Status', 'P/L', 'Trust Tier', 'Edge %']
    const rows = filteredBets.map(b => {
      const amt = Number(b.bet_amount)
      const ret = Number(b.potential_return)
      let pl = 0
      if (b.status === 'won') pl = ret - amt
      else if (b.status === 'lost') pl = -amt
      return [
        b.race_date || b.created_at?.split('T')[0] || '',
        b.course || '', b.off_time?.substring(0, 5) || '', b.horse_name || '',
        b.current_odds || '', amt.toFixed(2), b.status, pl.toFixed(2),
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

        {/* Add funds inline */}
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

        {/* Empty state */}
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

        {/* Main dashboard */}
        {bets.length > 0 && (
          <>
            {/* Period filter */}
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
                {/* 6 KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-4 h-4 text-yellow-400" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bankroll</span>
                    </div>
                    <div className="text-xl font-bold text-white">£{bankroll.toFixed(2)}</div>
                    <div className={`text-xs mt-0.5 ${bankrollGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {bankrollGrowth >= 0 ? '+' : ''}{bankrollGrowth.toFixed(1)}% all-time
                    </div>
                  </div>

                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {(totalStats?.roi ?? 0) >= 0
                        ? <TrendingUp className="w-4 h-4 text-green-400" />
                        : <TrendingDown className="w-4 h-4 text-red-400" />}
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">ROI</span>
                    </div>
                    <div className={`text-xl font-bold ${(totalStats?.roi ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(totalStats?.roi ?? 0) >= 0 ? '+' : ''}{(totalStats?.roi ?? 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">£{(totalStats?.totalStaked ?? 0).toFixed(0)} staked</div>
                  </div>

                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
                    </div>
                    <div className="text-xl font-bold text-white">{(totalStats?.winRate ?? 0).toFixed(1)}%</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {totalStats?.totalWins ?? 0}W / {totalStats?.totalLosses ?? 0}L
                      {(totalStats?.totalPending ?? 0) > 0 && ` / ${totalStats?.totalPending}P`}
                    </div>
                  </div>

                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">P/L</span>
                    </div>
                    <div className={`text-xl font-bold ${(totalStats?.totalPL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtPL(totalStats?.totalPL ?? 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {totalStats?.totalBets ?? 0} bets, {totalStats?.totalDays ?? 0} days
                    </div>
                  </div>

                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Drawdown</span>
                    </div>
                    <div className="text-xl font-bold text-red-400">
                      {totalStats ? `-£${totalStats.maxDrawdown.toFixed(2)}` : '£0.00'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {totalStats ? `${totalStats.maxDrawdownPct.toFixed(1)}% of peak` : '0% of peak'}
                    </div>
                  </div>

                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Expectancy</span>
                    </div>
                    <div className={`text-xl font-bold ${(totalStats?.expectancy ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtPL(totalStats?.expectancy ?? 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      per bet &middot; PF: {totalStats ? (totalStats.profitFactor >= 99 ? '∞' : totalStats.profitFactor.toFixed(2)) : '0.00'}
                    </div>
                  </div>
                </div>

                {/* Equity Curve */}
                {chartData.length > 1 && (
                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-semibold text-gray-300">P/L Curve</h2>
                      {systemBenchmark && (
                        <div className="flex items-center gap-3 text-[10px]">
                          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block rounded" /> You</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-400 inline-block rounded border-dashed" style={{ borderTop: '1px dashed #06b6d4', height: 0, background: 'none' }} /> System</span>
                        </div>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                            <stop offset={`${gradientOffset * 100}%`} stopColor="#22c55e" stopOpacity={0.05} />
                            <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={0.05} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
                          </linearGradient>
                          <linearGradient id="plStroke" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={`${gradientOffset * 100}%`} stopColor="#22c55e" stopOpacity={1} />
                            <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `£${v}`} width={45} />
                        <Tooltip content={<PLTooltip />} cursor={{ stroke: '#4b5563', strokeDasharray: '4 4' }} />
                        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="pl" stroke="url(#plStroke)" fill="url(#plFill)" strokeWidth={2} name="Your P/L"
                          dot={false} activeDot={{ r: 4, fill: '#fbbf24', stroke: '#1f2937', strokeWidth: 2 }} />
                        {systemBenchmark && (
                          <Line type="monotone" dataKey="systemPL" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="5 3"
                            dot={false} activeDot={{ r: 3, fill: '#06b6d4' }} name="System" connectNulls />
                        )}
                        {maxDrawdownPoint && (
                          <ReferenceDot x={maxDrawdownPoint.label} y={maxDrawdownPoint.pl} r={5}
                            fill="#ef4444" stroke="#7f1d1d" strokeWidth={2}>
                          </ReferenceDot>
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                    {maxDrawdownPoint && totalStats && totalStats.maxDrawdown > 0 && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        Max drawdown: <span className="text-red-400 font-medium">-£{totalStats.maxDrawdown.toFixed(2)}</span>
                        <span className="text-gray-600">({totalStats.maxDrawdownPct.toFixed(1)}% of peak)</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Insights Strip */}
                {totalStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-gray-500 uppercase">Avg Stake</div>
                      <div className="text-sm font-semibold text-white">{totalStats.avgStakePct.toFixed(1)}%</div>
                      <div className={`text-[10px] ${riskColor}`}>{riskLevel}</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-gray-500 uppercase">Best Day</div>
                      <div className="text-sm font-semibold text-green-400">
                        {totalStats.bestDay ? fmtPL(totalStats.bestDay.dayPL) : '-'}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        {totalStats.bestDay ? formatDateShort(totalStats.bestDay.date) : ''}
                      </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-gray-500 uppercase">Worst Day</div>
                      <div className="text-sm font-semibold text-red-400">
                        {totalStats.worstDay ? fmtPL(totalStats.worstDay.dayPL) : '-'}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        {totalStats.worstDay ? formatDateShort(totalStats.worstDay.date) : ''}
                      </div>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-gray-500 uppercase">Streaks</div>
                      <div className="text-sm font-semibold">
                        <span className="text-green-400">{totalStats.longestWinStreak}W</span>
                        <span className="text-gray-600 mx-1">/</span>
                        <span className="text-red-400">{totalStats.longestLoseStreak}L</span>
                      </div>
                      <div className="text-[10px] text-gray-600">longest run</div>
                    </div>
                  </div>
                )}

                {/* AI Insights Box */}
                {insights.length > 0 && (
                  <div className="bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Brain className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">AI Insights</span>
                    </div>
                    <div className="space-y-2">
                      {insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 ${insight.color}`}>&#x2022;</span>
                          <span className="text-gray-300 leading-relaxed">{insight.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* System vs You Comparison */}
                {systemBenchmark && systemBenchmark.totalPicks > 0 && totalStats && (
                  <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">You vs System</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center text-[11px]">
                      <div>
                        <div className="text-gray-500 mb-1.5">Win Rate</div>
                        <div className="flex items-center justify-center gap-2">
                          <div>
                            <div className={`text-base font-bold ${totalStats.winRate > systemBenchmark.winRate ? 'text-green-400' : 'text-white'}`}>
                              {totalStats.winRate.toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-gray-600">You</div>
                          </div>
                          <div className="text-gray-600 text-[10px]">vs</div>
                          <div>
                            <div className={`text-base font-bold ${systemBenchmark.winRate > totalStats.winRate ? 'text-cyan-400' : 'text-white'}`}>
                              {systemBenchmark.winRate.toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-gray-600">System</div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1.5">ROI</div>
                        <div className="flex items-center justify-center gap-2">
                          <div>
                            <div className={`text-base font-bold ${totalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-gray-600">You</div>
                          </div>
                          <div className="text-gray-600 text-[10px]">vs</div>
                          <div>
                            <div className={`text-base font-bold ${systemBenchmark.roi >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                              {systemBenchmark.roi >= 0 ? '+' : ''}{systemBenchmark.roi.toFixed(0)}%
                            </div>
                            <div className="text-[9px] text-gray-600">System</div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500 mb-1.5">Picks</div>
                        <div className="flex items-center justify-center gap-2">
                          <div>
                            <div className="text-base font-bold text-white">{totalStats.totalBets}</div>
                            <div className="text-[9px] text-gray-600">You</div>
                          </div>
                          <div className="text-gray-600 text-[10px]">vs</div>
                          <div>
                            <div className="text-base font-bold text-white">{systemBenchmark.totalPicks}</div>
                            <div className="text-[9px] text-gray-600">System</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab bar */}
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

                {/* ====== OVERVIEW TAB ====== */}
                {activeTab === 'overview' && (
                  <>
                    <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-0.5">
                      <button onClick={() => setActiveView('daily')}
                        className={`flex-1 px-3 py-1 text-[11px] font-medium rounded transition-all ${
                          activeView === 'daily' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                        }`}>
                        Daily Breakdown
                      </button>
                      <button onClick={() => setActiveView('all')}
                        className={`flex-1 px-3 py-1 text-[11px] font-medium rounded transition-all ${
                          activeView === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                        }`}>
                        All Bets ({totalStats?.totalBets ?? 0})
                      </button>
                    </div>

                    {activeView === 'daily' && (
                      <div className="space-y-2">
                        {[...dailySummaries].reverse().map(day => {
                          const isExpanded = expandedDay === day.date
                          const dayColor = day.dayPL >= 20 ? 'bg-green-500/10 border-green-500/25'
                            : day.dayPL > 0 ? 'bg-green-500/5 border-green-500/15'
                            : day.dayPL <= -20 ? 'bg-red-500/10 border-red-500/25'
                            : day.dayPL < 0 ? 'bg-red-500/5 border-red-500/15'
                            : 'bg-gray-800/40 border-gray-700/50'
                          return (
                            <div key={day.date} className={`rounded-xl overflow-hidden border transition-colors ${
                              isExpanded ? 'bg-gray-800/60 border-yellow-500/30' : dayColor
                            }`}>
                              <button onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/60 transition-colors">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm font-semibold text-white">{formatDateShort(day.date)}</span>
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                      day.dayPL > 0 ? 'bg-green-500/15 text-green-400'
                                        : day.dayPL < 0 ? 'bg-red-500/15 text-red-400'
                                        : 'bg-gray-700 text-gray-400'
                                    }`}>{fmtPL(day.dayPL)}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                    <span>{day.bets.length} bets</span>
                                    <span className="text-green-500">{day.wins}W</span>
                                    <span className="text-red-500">{day.losses}L</span>
                                    {day.pending > 0 && <span className="text-yellow-500">{day.pending}P</span>}
                                    <span className="text-gray-600">|</span>
                                    <span className={day.runningROI >= 0 ? 'text-green-500' : 'text-red-500'}>
                                      ROI: {day.runningROI >= 0 ? '+' : ''}{day.runningROI.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                {isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-yellow-400" />
                                  : <ChevronDown className="w-4 h-4 text-gray-500" />}
                              </button>
                              {isExpanded && (
                                <div className="border-t border-gray-700/50 px-3 py-2 space-y-1">
                                  {day.bets.map(bet => <BetRow key={bet.id} bet={bet} />)}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {totalStats && (
                          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mt-3">
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Total P/L</div>
                                <div className={`text-lg font-bold ${totalStats.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {fmtPL(totalStats.totalPL)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-500 uppercase mb-1">Bankroll</div>
                                <div className="text-lg font-bold text-white">£{bankroll.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-500 uppercase mb-1">ROI</div>
                                <div className={`text-lg font-bold ${totalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeView === 'all' && (
                      <div className="space-y-1.5">
                        {[...filteredBets].reverse().map(bet => <BetRow key={bet.id} bet={bet} showDate />)}
                      </div>
                    )}
                  </>
                )}

                {/* ====== MONTHLY TAB ====== */}
                {activeTab === 'monthly' && (
                  <div className="space-y-3">
                    {monthSummaries.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 text-sm">No data for this period</div>
                    ) : monthSummaries.map(m => (
                      <div key={m.month} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-white">{m.label}</span>
                          <span className={`text-sm font-bold ${m.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {fmtPL(m.pl)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                          <div>
                            <div className="text-gray-500 mb-0.5">Bets</div>
                            <div className="text-white font-medium">{m.totalBets}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-0.5">Win Rate</div>
                            <div className="text-white font-medium">{m.winRate.toFixed(0)}%</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-0.5">Staked</div>
                            <div className="text-white font-medium">£{m.staked.toFixed(0)}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-0.5">ROI</div>
                            <div className={`font-medium ${m.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {m.roi >= 0 ? '+' : ''}{m.roi.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500/60 rounded-full transition-all" style={{ width: `${Math.min(m.winRate, 100)}%` }} />
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                          <span className="text-green-500">{m.wins} won</span>
                          <span className="text-red-500">{m.losses} lost</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ====== TRUST TIER TAB ====== */}
                {activeTab === 'trust' && (
                  <div className="space-y-4">
                    {trustTierSummaries.length === 0 ? (
                      <div className="text-center py-12">
                        <ShieldCheck className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                        <h3 className="text-gray-400 font-medium mb-1">Trust Tier Analytics Coming Soon</h3>
                        <p className="text-gray-600 text-sm max-w-sm mx-auto">
                          Future bets placed through AI Top Picks will be tagged with confidence tiers,
                          enabling detailed performance analysis by trust level.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
                          <h3 className="text-sm font-semibold text-gray-300 mb-3">ROI by Trust Tier</h3>
                          <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={trustTierSummaries.map(t => ({
                              name: t.key, roi: Number(t.roi.toFixed(1)), winRate: Number(t.winRate.toFixed(1)),
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                                tickFormatter={(v: number) => `${v}%`} width={40} />
                              <Tooltip content={<TrustTooltip />} />
                              <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                                {trustTierSummaries.map((t, i) => (
                                  <Cell key={i} fill={t.barColor} fillOpacity={0.7} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {trustTierSummaries.map(t => (
                          <div key={t.key} className={`border rounded-xl p-4 ${t.bgClass}`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className={`w-4 h-4 ${t.textClass}`} />
                                <span className={`text-sm font-semibold ${t.textClass}`}>{t.key} Trust</span>
                              </div>
                              <span className={`text-sm font-bold ${t.pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {fmtPL(t.pl)}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                              <div>
                                <div className="text-gray-500 mb-0.5">Bets</div>
                                <div className="text-white font-medium">{t.totalBets}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Win Rate</div>
                                <div className="text-white font-medium">{t.winRate.toFixed(0)}%</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">Avg Stake</div>
                                <div className="text-white font-medium">£{t.avgStake.toFixed(2)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 mb-0.5">ROI</div>
                                <div className={`font-medium ${t.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {t.roi >= 0 ? '+' : ''}{t.roi.toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            {t.avgEdge > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-700/30 text-[10px] text-gray-500">
                                Avg edge: <span className="text-cyan-400">{t.avgEdge.toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
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

function BetRow({ bet, showDate = false }: { bet: UserBet; showDate?: boolean }) {
  const odds = bet.current_odds
  const amount = Number(bet.bet_amount)
  const potentialReturn = Number(bet.potential_return)

  let pl = 0
  if (bet.status === 'won') pl = potentialReturn
  else if (bet.status === 'lost') pl = -amount

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs ${
      bet.status === 'won' ? 'bg-green-500/5 border border-green-500/15' :
      bet.status === 'pending' ? 'bg-yellow-500/5 border border-yellow-500/15' :
      'bg-gray-800/30 border border-gray-700/30'
    }`}>
      <div className="flex-shrink-0">
        {bet.status === 'won' && <CheckCircle className="w-4 h-4 text-green-400" />}
        {bet.status === 'lost' && <XCircle className="w-4 h-4 text-gray-600" />}
        {bet.status === 'pending' && <Clock className="w-4 h-4 text-yellow-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold truncate ${
            bet.status === 'won' ? 'text-green-300' : bet.status === 'pending' ? 'text-white' : 'text-gray-300'
          }`}>
            {bet.horse_name}
          </span>
          {bet.trust_tier && (
            <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase leading-none flex-shrink-0 ${
              bet.trust_tier === 'Strong' ? 'bg-green-500/20 text-green-400' :
              bet.trust_tier === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {bet.trust_tier}
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
          {showDate && <span>{formatDateShort(bet.race_date || bet.created_at?.split('T')[0])}</span>}
          {showDate && <span className="text-gray-700">&middot;</span>}
          <span>{bet.off_time?.substring(0, 5)}</span>
          <span className="text-gray-700">&middot;</span>
          <span>{bet.course}</span>
          {bet.edge_pct != null && (
            <>
              <span className="text-gray-700">&middot;</span>
              <span className="text-cyan-400">{(Number(bet.edge_pct) * 100).toFixed(0)}% edge</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0 w-12">
        <div className="text-gray-300 font-mono text-[11px]">{formatOdds(odds)}</div>
      </div>

      <div className="text-right flex-shrink-0 w-14">
        <div className="text-gray-300 text-[11px]">£{amount.toFixed(2)}</div>
        <div className="text-[8px] text-gray-600">stake</div>
      </div>

      <div className="text-right flex-shrink-0 w-16">
        {bet.status === 'pending' ? (
          <div className="text-yellow-400 font-semibold text-[11px]">Pending</div>
        ) : (
          <div className={`font-bold text-[11px] ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtPL(pl)}
          </div>
        )}
      </div>
    </div>
  )
}
