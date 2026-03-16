import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/AppLayout'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { supabase } from '@/lib/supabase'
import { formatOdds } from '@/lib/odds'
import { useDynamicSignals, type DynamicMatch, type DynamicCombo } from '@/hooks/useDynamicSignals'
import {
  Zap,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Target,
  Wallet,
  ChevronRight,
  CalendarDays,
  Brain,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  proven:   { bg: 'bg-green-500/20 border-green-500/40', text: 'text-green-400', label: 'PROVEN' },
  strong:   { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-400', label: 'STRONG' },
  emerging: { bg: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-400', label: 'EMERGING' },
}

export function AutoBetsPage() {
  const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { matches: dynamicMatches, meta, isLoading: loadingSignals } = useDynamicSignals()

  const { data: todayBets, isLoading: loadingBets } = useQuery({
    queryKey: ['auto-bets-today', todayUK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_bet_ledger')
        .select('*')
        .eq('bet_date', todayUK)
        .order('id', { ascending: true })
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })

  const { data: bankrollSummary } = useQuery({
    queryKey: ['auto-bet-summary'],
    queryFn: async () => {
      const { data: lastBet } = await supabase
        .from('auto_bet_ledger')
        .select('bankroll_after')
        .order('id', { ascending: false })
        .limit(1)
      const { data: allBets } = await supabase
        .from('auto_bet_ledger')
        .select('profit,stake,won')
      const totalPL = allBets?.reduce((s, b) => s + Number(b.profit), 0) || 0
      const totalStaked = allBets?.reduce((s, b) => s + Number(b.stake), 0) || 0
      const totalWins = allBets?.filter(b => b.won).length || 0
      const totalBets = allBets?.length || 0
      return {
        bankroll: lastBet?.[0] ? Number(lastBet[0].bankroll_after) : 200,
        totalPL,
        roi: totalStaked > 0 ? (totalPL / totalStaked) * 100 : 0,
        winRate: totalBets > 0 ? (totalWins / totalBets) * 100 : 0,
        totalBets,
        totalWins,
      }
    },
    staleTime: 60_000,
  })

  const betsByHorse = useMemo(() => {
    const map = new Map<string, any>()
    for (const b of todayBets || []) {
      map.set(`${b.race_id}:${b.horse_id}`, b)
    }
    return map
  }, [todayBets])

  const plays = todayBets || []
  const todayPL = plays.reduce((s, b) => s + Number(b.profit), 0)
  const todayWins = plays.filter(b => b.won).length
  const todayPending = plays.filter(b => Number(b.finishing_position) === 0).length

  // Group dynamic matches by race (off_time + course)
  const matchesByRace = useMemo(() => {
    const grouped = new Map<string, { course: string; off_time: string; race_type: string; matches: DynamicMatch[] }>()
    for (const m of dynamicMatches) {
      const key = m.race_id
      if (!grouped.has(key)) {
        grouped.set(key, { course: m.course, off_time: m.off_time, race_type: m.race_type, matches: [] })
      }
      grouped.get(key)!.matches.push(m)
    }
    const sorted = [...grouped.entries()].sort(([, a], [, b]) => (a.off_time || '').localeCompare(b.off_time || ''))
    return sorted
  }, [dynamicMatches])

  const isLoading = loadingSignals || loadingBets

  return (
    <AppLayout>
      <div className="p-4 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Smart Picks
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Self-learning system matching horses to historically profitable patterns
          </p>
        </div>

        {/* Self-learning banner */}
        {meta && (
          <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-3 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <div className="text-xs text-gray-300">
              <span className="text-purple-300 font-semibold">{meta.combos_available?.toLocaleString()}</span> profitable patterns discovered across{' '}
              <span className="text-purple-300 font-semibold">12,000+</span> races.{' '}
              Patterns update daily as new results come in.
            </div>
          </div>
        )}

        {/* Bankroll Summary Cards */}
        {bankrollSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Bankroll</span>
              </div>
              <div className="text-lg font-bold text-white">£{bankrollSummary.bankroll.toFixed(2)}</div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {bankrollSummary.roi >= 0
                  ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  : <Target className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">ROI</span>
              </div>
              <div className={`text-lg font-bold ${bankrollSummary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {bankrollSummary.roi >= 0 ? '+' : ''}{bankrollSummary.roi.toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Win Rate</span>
              </div>
              <div className="text-lg font-bold text-white">
                {bankrollSummary.winRate.toFixed(0)}%
              </div>
              <div className="text-[10px] text-gray-500">{bankrollSummary.totalWins}W / {bankrollSummary.totalBets}R</div>
            </div>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {todayPL >= 0
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Today P/L</span>
              </div>
              <div className={`text-lg font-bold ${todayPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {todayPL >= 0 ? '+' : '-'}£{Math.abs(todayPL).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" />
              <span className="text-gray-400">Scanning patterns...</span>
            </div>
          </div>
        )}

        {/* No matches */}
        {!isLoading && dynamicMatches.length === 0 && plays.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Brain className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">No pattern matches today</h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              The system will highlight selections when horses match historically profitable signal combinations
            </p>
          </div>
        )}

        {/* Today's Pattern Matches — grouped by race */}
        {!isLoading && matchesByRace.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">
                Pattern Matches
              </h2>
              <span className="text-xs text-gray-500">
                {dynamicMatches.length} horses across {matchesByRace.length} races
              </span>
            </div>
            <div className="space-y-4">
              {matchesByRace.map(([raceId, race]) => (
                <div key={raceId} className="bg-gray-800/40 border border-gray-700/50 rounded-xl overflow-hidden">
                  {/* Race header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/30 bg-gray-800/60">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs text-white font-semibold">{race.off_time?.substring(0, 5)}</span>
                      <span className="text-xs text-gray-500">·</span>
                      <span className="text-xs text-gray-300">{race.course}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase">{race.race_type}</span>
                  </div>

                  {/* Horses matching patterns */}
                  <div className="divide-y divide-gray-700/20">
                    {race.matches.map((match) => {
                      const bet = betsByHorse.get(`${raceId}:${match.horse_id}`)
                      const isAutoBet = !!bet
                      const betStatus = bet
                        ? Number(bet.finishing_position) === 0
                          ? 'pending'
                          : bet.won ? 'won' : 'lost'
                        : null

                      return (
                        <MatchCard
                          key={match.horse_id}
                          match={match}
                          bet={bet}
                          isAutoBet={isAutoBet}
                          betStatus={betStatus}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-bet settled (from ledger, not in dynamic matches) */}
        {plays.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Auto-bet Ledger</h2>
              <span className="text-xs text-gray-500">
                {todayWins}W {plays.length - todayWins - todayPending}L {todayPending > 0 ? `${todayPending}P` : ''}
              </span>
            </div>
            <div className="space-y-2">
              {plays.map((bet: any) => (
                <LedgerRow key={bet.id} bet={bet} />
              ))}
            </div>
          </div>
        )}

        {/* Performance link */}
        {(plays.length > 0 || dynamicMatches.length > 0) && (
          <Link
            to="/performance"
            className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-xl p-4 hover:border-purple-500/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-gray-500 group-hover:text-purple-400 transition-colors" />
              <div>
                <span className="text-white font-medium text-sm">Full Performance History</span>
                <p className="text-gray-500 text-xs">Equity curve, daily breakdown, all bets</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 transition-colors" />
          </Link>
        )}
      </div>
    </AppLayout>
  )
}


function MatchCard({ match, bet, isAutoBet, betStatus }: {
  match: DynamicMatch
  bet: any | null
  isAutoBet: boolean
  betStatus: 'pending' | 'won' | 'lost' | null
}) {
  const topCombo = match.matching_combos[0]
  const odds = match.current_odds || 0

  return (
    <div className={`p-4 ${isAutoBet ? 'bg-purple-500/5' : ''}`}>
      {/* Horse row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <HorseNameWithSilk
              horseName={match.horse_name}
              silkUrl={match.silk_url}
              className="text-white text-sm font-semibold"
            />
            {isAutoBet && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <ShieldCheck className="w-2.5 h-2.5" />
                AUTO
              </span>
            )}
            {betStatus === 'won' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400">
                <CheckCircle className="w-2.5 h-2.5" />
                WON
              </span>
            )}
            {betStatus === 'lost' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-700 text-gray-500">
                <XCircle className="w-2.5 h-2.5" />
                LOST
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
            {match.jockey && <span>{match.jockey}</span>}
            {match.trainer && <><span>·</span><span>{match.trainer}</span></>}
            {odds > 0 && <><span>·</span><span className="text-white font-mono">{formatOdds(String(odds))}</span></>}
          </div>
        </div>

        {/* Auto-bet P/L */}
        {bet && betStatus !== 'pending' && (
          <div className="text-right flex-shrink-0">
            <div className={`font-bold text-sm ${Number(bet.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {Number(bet.profit) >= 0 ? '+' : '-'}£{Math.abs(Number(bet.profit)).toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-500">£{Number(bet.stake).toFixed(2)} stake</div>
          </div>
        )}
        {bet && betStatus === 'pending' && (
          <div className="text-right flex-shrink-0">
            <div className="text-yellow-400 font-semibold text-sm">£{Number(bet.stake).toFixed(2)}</div>
            <div className="text-[10px] text-gray-500">staked</div>
          </div>
        )}
      </div>

      {/* Pattern badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {match.matching_combos.slice(0, 4).map((combo, i) => {
          const style = STATUS_BADGE[combo.status] || STATUS_BADGE.emerging
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${style.bg} ${style.text}`}
              title={`${combo.total_bets} bets, ${combo.win_rate}% WR, p=${combo.p_value?.toFixed(4) ?? '—'}`}
            >
              <span className="truncate max-w-[160px]">{combo.combo_label}</span>
              <span className="opacity-60">·</span>
              <span>{combo.win_rate}%</span>
              <span className="opacity-60">·</span>
              <span>{combo.roi_pct > 0 ? '+' : ''}{combo.roi_pct}%</span>
            </span>
          )
        })}
        {match.matching_combos.length > 4 && (
          <span className="text-[10px] text-gray-500 self-center">+{match.matching_combos.length - 4} more</span>
        )}
      </div>
    </div>
  )
}


function LedgerRow({ bet }: { bet: any }) {
  const won = bet.won
  const pending = Number(bet.finishing_position) === 0
  const profit = Number(bet.profit)
  const signalLabel = bet.signal_combo_label

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
      won ? 'bg-green-500/5 border border-green-500/20' :
      pending ? 'bg-gray-800/40 border border-gray-700/30' :
      'bg-gray-800/30 border border-gray-700/20'
    }`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {pending && <Clock className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
        {won && <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />}
        {!won && !pending && <XCircle className="w-3 h-3 text-gray-500 flex-shrink-0" />}
        <span className={`font-medium truncate ${won ? 'text-green-300' : pending ? 'text-white' : 'text-gray-400'}`}>
          {bet.horse_name}
        </span>
        <span className="text-[10px] text-gray-500 flex-shrink-0">
          {bet.off_time?.substring(0, 5)} {bet.course}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {signalLabel && (
          <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded max-w-[120px] truncate">
            {signalLabel}
          </span>
        )}
        <span className="text-xs font-mono text-gray-400">{formatOdds(String(bet.current_odds))}</span>
        {pending ? (
          <span className="text-xs text-yellow-400 font-semibold w-16 text-right">£{Number(bet.stake).toFixed(2)}</span>
        ) : (
          <span className={`text-xs font-bold w-16 text-right ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {profit >= 0 ? '+' : '-'}£{Math.abs(profit).toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
