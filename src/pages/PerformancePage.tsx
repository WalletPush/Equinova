import { useState, useMemo, useEffect } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { supabase } from '@/lib/supabase'
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Wallet,
  CheckCircle,
  XCircle,
} from 'lucide-react'

interface AutoBet {
  id: number
  bet_date: string
  race_id: string
  horse_id: string
  horse_name: string
  course: string
  off_time: string
  jockey: string
  trainer: string
  current_odds: number
  value_score: number
  model_consensus: number
  norm_prob: number
  kelly_fraction: number
  stake: number
  finishing_position: number
  won: boolean
  profit: number
  bankroll_after: number
  tags: string[]
}

interface DaySummary {
  date: string
  bets: number
  wins: number
  losses: number
  dayPL: number
  bankrollEnd: number
  runningROI: number
  runningPL: number
}

const STARTING_BANKROLL = 200

function fmtCurrency(v: number) {
  return `${v >= 0 ? '' : '-'}£${Math.abs(v).toFixed(2)}`
}

function fmtPL(v: number) {
  return `${v >= 0 ? '+' : '-'}£${Math.abs(v).toFixed(2)}`
}

function decToFrac(dec: number): string {
  if (dec <= 1) return 'EVS'
  const num = dec - 1
  const common: [number, number][] = [
    [1, 5], [1, 4], [1, 3], [2, 5], [4, 9], [1, 2], [8, 15], [4, 7],
    [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [6, 5], [5, 4],
    [6, 4], [7, 4], [2, 1], [9, 4], [5, 2], [3, 1], [7, 2], [4, 1],
    [9, 2], [5, 1], [6, 1], [7, 1], [8, 1], [10, 1], [12, 1], [16, 1],
    [20, 1], [25, 1], [33, 1], [50, 1],
  ]
  let bestN = Math.round(num), bestD = 1, bestDiff = Math.abs(num - bestN)
  for (const [n, d] of common) {
    const diff = Math.abs(num - n / d)
    if (diff < bestDiff) { bestDiff = diff; bestN = n; bestD = d }
  }
  return `${bestN}/${bestD}`
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function PerformancePage() {
  const [bets, setBets] = useState<AutoBet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'daily' | 'all'>('daily')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('auto_bet_ledger')
          .select('*')
          .order('bet_date', { ascending: true })
          .order('id', { ascending: true })
        if (err) throw new Error(err.message)
        setBets(data || [])
      } catch (e: any) {
        setError(e.message || 'Failed to load performance data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const { dailySummaries, totalStats } = useMemo(() => {
    if (!bets.length) return { dailySummaries: [], totalStats: null }

    const byDay = new Map<string, AutoBet[]>()
    for (const b of bets) {
      const arr = byDay.get(b.bet_date) || []
      arr.push(b)
      byDay.set(b.bet_date, arr)
    }

    let runningPL = 0
    let totalStaked = 0
    const summaries: DaySummary[] = []

    for (const [date, dayBets] of byDay) {
      const wins = dayBets.filter(b => b.won).length
      const losses = dayBets.length - wins
      const dayPL = dayBets.reduce((s, b) => s + b.profit, 0)
      const dayStaked = dayBets.reduce((s, b) => s + b.stake, 0)
      runningPL += dayPL
      totalStaked += dayStaked
      const bankrollEnd = dayBets[dayBets.length - 1].bankroll_after
      const runningROI = totalStaked > 0 ? (runningPL / totalStaked) * 100 : 0

      summaries.push({
        date,
        bets: dayBets.length,
        wins,
        losses,
        dayPL,
        bankrollEnd,
        runningROI,
        runningPL,
      })
    }

    const totalWins = bets.filter(b => b.won).length
    const totalBetsCount = bets.length
    const totalPL = bets.reduce((s, b) => s + b.profit, 0)
    const totalStakedAll = bets.reduce((s, b) => s + b.stake, 0)
    const finalBankroll = bets[bets.length - 1].bankroll_after
    const avgOddsWins = bets.filter(b => b.won).reduce((s, b) => s + b.current_odds, 0) / (totalWins || 1)
    const peakBankroll = Math.max(STARTING_BANKROLL, ...bets.map(b => b.bankroll_after))
    const troughBankroll = Math.min(STARTING_BANKROLL, ...bets.map(b => b.bankroll_after))
    const winningDays = summaries.filter(d => d.dayPL > 0).length
    const losingDays = summaries.filter(d => d.dayPL < 0).length

    return {
      dailySummaries: summaries,
      totalStats: {
        totalBets: totalBetsCount,
        totalWins,
        totalPL,
        totalStaked: totalStakedAll,
        roi: totalStakedAll > 0 ? (totalPL / totalStakedAll) * 100 : 0,
        winRate: totalBetsCount > 0 ? (totalWins / totalBetsCount) * 100 : 0,
        finalBankroll,
        avgOddsWins,
        peakBankroll,
        troughBankroll,
        winningDays,
        losingDays,
        totalDays: summaries.length,
      },
    }
  }, [bets])

  const equityCurvePoints = useMemo(() => {
    if (!dailySummaries.length) return []
    const points = [{ label: 'Start', value: STARTING_BANKROLL }]
    for (const d of dailySummaries) {
      points.push({ label: formatDateShort(d.date), value: d.bankrollEnd })
    }
    return points
  }, [dailySummaries])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mr-3" />
          <span className="text-gray-400">Loading performance data...</span>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-4">
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!totalStats) {
    return (
      <AppLayout>
        <div className="p-4 text-center py-24">
          <BarChart3 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">No auto-bet data available yet.</p>
        </div>
      </AppLayout>
    )
  }

  const eqMin = Math.min(...equityCurvePoints.map(p => p.value)) - 5
  const eqMax = Math.max(...equityCurvePoints.map(p => p.value)) + 5
  const eqRange = eqMax - eqMin

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Auto-Bet Performance</h1>
            <p className="text-xs text-gray-500">Quarter Kelly staking on value plays (v{'\u2265'}1.10, consensus 3+, odds{'\u2264'}5)</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Bankroll</span>
            </div>
            <div className="text-xl font-bold text-white">{fmtCurrency(totalStats.finalBankroll)}</div>
            <div className={`text-xs font-medium mt-0.5 ${totalStats.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtPL(totalStats.totalPL)} from £{STARTING_BANKROLL}
            </div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              {totalStats.roi >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Staking ROI</span>
            </div>
            <div className={`text-xl font-bold ${totalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              £{totalStats.totalStaked.toFixed(0)} staked
            </div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
            </div>
            <div className="text-xl font-bold text-white">{totalStats.winRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalStats.totalWins}W / {totalStats.totalBets - totalStats.totalWins}L
            </div>
          </div>

          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Record</span>
            </div>
            <div className="text-xl font-bold text-white">{totalStats.totalBets} bets</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalStats.winningDays}W / {totalStats.losingDays}L days
            </div>
          </div>
        </div>

        {/* Equity Curve */}
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Bankroll Equity Curve</h2>
          <div className="relative h-32">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 text-[9px] text-gray-600 font-mono">£{eqMax.toFixed(0)}</div>
            <div className="absolute left-0 bottom-0 text-[9px] text-gray-600 font-mono">£{eqMin.toFixed(0)}</div>
            {/* £200 baseline */}
            <div
              className="absolute left-8 right-0 border-t border-dashed border-gray-700"
              style={{ bottom: `${((STARTING_BANKROLL - eqMin) / eqRange) * 100}%` }}
            >
              <span className="absolute -top-3 right-0 text-[8px] text-gray-600">£200</span>
            </div>
            {/* Bars */}
            <div className="absolute left-8 right-0 bottom-0 top-0 flex items-end gap-[2px]">
              {equityCurvePoints.map((p, i) => {
                const height = ((p.value - eqMin) / eqRange) * 100
                const isAbove = p.value >= STARTING_BANKROLL
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        isAbove ? 'bg-green-500/60' : 'bg-red-500/60'
                      } group-hover:opacity-80`}
                      style={{ height: `${height}%` }}
                    />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[8px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {p.label}: £{p.value.toFixed(0)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-between mt-1 px-8">
            <span className="text-[8px] text-gray-600">Start</span>
            <span className="text-[8px] text-gray-600">Mar 14</span>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setActiveView('daily')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
              activeView === 'daily' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Daily Breakdown
          </button>
          <button
            onClick={() => setActiveView('all')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
              activeView === 'all' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All Bets ({totalStats.totalBets})
          </button>
        </div>

        {/* Daily Breakdown View */}
        {activeView === 'daily' && (
          <div className="space-y-2">
            {dailySummaries.map(day => {
              const isExpanded = expandedDay === day.date
              const dayBets = bets.filter(b => b.bet_date === day.date)
              return (
                <div key={day.date} className={`rounded-xl overflow-hidden border transition-colors ${
                  isExpanded ? 'bg-gray-800/60 border-yellow-500/30' : 'bg-gray-800/40 border-gray-700/50'
                }`}>
                  {/* Day header */}
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-800/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-white">{formatDateShort(day.date)}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          day.dayPL > 0 ? 'bg-green-500/15 text-green-400' : day.dayPL < 0 ? 'bg-red-500/15 text-red-400' : 'bg-gray-700 text-gray-400'
                        }`}>
                          {fmtPL(day.dayPL)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>{day.bets} bets</span>
                        <span className="text-green-500">{day.wins}W</span>
                        <span className="text-red-500">{day.losses}L</span>
                        <span className="text-gray-600">|</span>
                        <span>Bank: {fmtCurrency(day.bankrollEnd)}</span>
                        <span className="text-gray-600">|</span>
                        <span className={day.runningROI >= 0 ? 'text-green-500' : 'text-red-500'}>
                          ROI: {day.runningROI >= 0 ? '+' : ''}{day.runningROI.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-yellow-400" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>

                  {/* Expanded bet list */}
                  {isExpanded && (
                    <div className="border-t border-gray-700/50 px-3 py-2 space-y-1">
                      {dayBets.map(bet => (
                        <BetRow key={bet.id} bet={bet} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Running totals footer */}
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mt-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Total P/L</div>
                  <div className={`text-lg font-bold ${totalStats.totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtPL(totalStats.totalPL)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Final Bankroll</div>
                  <div className="text-lg font-bold text-white">{fmtCurrency(totalStats.finalBankroll)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase mb-1">Staking ROI</div>
                  <div className={`text-lg font-bold ${totalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalStats.roi >= 0 ? '+' : ''}{totalStats.roi.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All Bets View */}
        {activeView === 'all' && (
          <div className="space-y-1.5">
            {bets.map(bet => (
              <BetRow key={bet.id} bet={bet} showDate />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function BetRow({ bet, showDate = false }: { bet: AutoBet; showDate?: boolean }) {
  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs ${
      bet.won ? 'bg-green-500/5 border border-green-500/15' : 'bg-gray-800/30 border border-gray-700/30'
    }`}>
      {/* Result icon */}
      <div className="flex-shrink-0">
        {bet.won
          ? <CheckCircle className="w-4 h-4 text-green-400" />
          : <XCircle className="w-4 h-4 text-gray-600" />
        }
      </div>

      {/* Horse + course */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold truncate ${bet.won ? 'text-green-300' : 'text-gray-300'}`}>
            {bet.horse_name}
          </span>
          {bet.tags?.map((tag, i) => (
            <span key={i} className={`px-1 py-0.5 text-[7px] rounded font-bold uppercase tracking-wide ${
              tag === 'Market Backed' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' :
              tag === 'Strong Value' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
              'bg-gray-700/50 text-gray-400 border border-gray-600/20'
            }`}>
              {tag === 'Market Backed' ? 'MKT' : tag === 'Strong Value' ? 'VAL' : tag.substring(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
          {showDate && <span>{formatDateShort(bet.bet_date)}</span>}
          {showDate && <span className="text-gray-700">&middot;</span>}
          <span>{bet.off_time?.substring(0, 5)}</span>
          <span className="text-gray-700">&middot;</span>
          <span>{bet.course}</span>
          <span className="text-gray-700">&middot;</span>
          <span>{bet.jockey}</span>
        </div>
      </div>

      {/* Odds */}
      <div className="text-right flex-shrink-0 w-12">
        <div className="text-gray-300 font-mono text-[11px]">{decToFrac(bet.current_odds)}</div>
        <div className="text-[8px] text-gray-600">{bet.current_odds.toFixed(1)}</div>
      </div>

      {/* Value */}
      <div className="text-right flex-shrink-0 w-12">
        <div className={`font-bold text-[11px] ${bet.value_score >= 1.3 ? 'text-amber-400' : 'text-gray-400'}`}>
          {bet.value_score.toFixed(2)}x
        </div>
        <div className="text-[8px] text-gray-600">value</div>
      </div>

      {/* Stake */}
      <div className="text-right flex-shrink-0 w-14">
        <div className="text-gray-300 text-[11px]">£{bet.stake.toFixed(2)}</div>
        <div className="text-[8px] text-gray-600">stake</div>
      </div>

      {/* P/L */}
      <div className="text-right flex-shrink-0 w-16">
        <div className={`font-bold text-[11px] ${bet.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {fmtPL(bet.profit)}
        </div>
        <div className="text-[8px] text-gray-600">
          {bet.won ? `${fmtPos(bet.finishing_position)}` : `${fmtPos(bet.finishing_position)}`}
        </div>
      </div>
    </div>
  )
}

function fmtPos(p: number) {
  if (p === 1) return '1st'
  if (p === 2) return '2nd'
  if (p === 3) return '3rd'
  return `${p}th`
}
