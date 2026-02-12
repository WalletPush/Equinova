import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Star, Bot, CheckCircle2, XCircle, Trophy, Target, Users, Zap, ArrowRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { RaceEntry, supabase } from '@/lib/supabase'
import { TabContentProps } from './HorseDetailTabs'
import {
  normalizeAllModels,
  getNormalizedColor,
  getNormalizedStars,
  formatNormalized,
  type ProbaField,
} from '@/lib/normalize'
import { formatTime } from '@/lib/dateUtils'
import { formatOdds } from '@/lib/odds'

const getPerformanceIndicator = (value: number | null | undefined, threshold: number = 50) => {
  if (!value) return <Minus className="w-4 h-4 text-gray-500" />
  if (value > threshold) return <TrendingUp className="w-4 h-4 text-green-500" />
  return <TrendingDown className="w-4 h-4 text-red-500" />
}

const formatPercentage = (value: number | null | undefined) => {
  if (!value) return 'N/A'
  // Check if value is already a percentage (> 1) or a decimal (0-1)
  const percentage = value > 1 ? value : value * 100
  return `${percentage.toFixed(1)}%`
}

const formatNumber = (value: number | null | undefined, decimals: number = 1) => {
  if (value === null || value === undefined) return 'N/A'
  return value.toFixed(decimals)
}

export function ConnectionsTab({ entry }: TabContentProps) {
  return (
    <div className="space-y-6">
      {/* Trainer Information */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Trainer: {entry.trainer_name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">21-Day Win %</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.trainer_21_days_win_percentage, 0.15)}
                <span className="text-white font-medium">
                  {formatPercentage(entry.trainer_21_days_win_percentage)}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Win % at Distance</span>
              <span className="text-white font-medium">
                {formatPercentage(entry.trainer_win_percentage_at_distance)}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Win % at Course</span>
              <span className="text-white font-medium">
                {formatPercentage(entry.trainer_win_percentage_at_course)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Avg Finish at Course</span>
              <span className="text-white font-medium">
                {formatNumber(entry.trainer_avg_finishing_position_at_course)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Jockey Information */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Jockey: {entry.jockey_name}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">21-Day Win %</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.jockey_21_days_win_percentage, 0.15)}
                <span className="text-white font-medium">
                  {formatPercentage(entry.jockey_21_days_win_percentage)}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Win % at Distance</span>
              <span className="text-white font-medium">
                {formatPercentage(entry.jockey_win_percentage_at_distance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Information */}
      {entry.owner_name && (
        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Owner</h3>
          <p className="text-white font-medium">{entry.owner_name}</p>
        </div>
      )}
    </div>
  )
}

export function PredictionsTab({ entry, raceId, patternAlerts, smartSignals }: TabContentProps) {
  // Fetch all runners in this race for comparative analysis
  const { data: allEntries, isLoading: loadingEntries } = useQuery({
    queryKey: ['race-entries-analysis', raceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_entries')
        .select('horse_name,horse_id,ensemble_proba,benter_proba,mlp_proba,rf_proba,xgboost_proba,current_odds,predicted_winner,jockey_name,trainer_name,silk_url,number')
        .eq('race_id', raceId!)
      if (error) {
        console.error('Error fetching race entries for analysis:', error)
        return []
      }
      return data ?? []
    },
    enabled: !!raceId,
    staleTime: 60_000,
  })

  // ── Computed analysis (with normalized probabilities) ─────────────
  const analysis = useMemo(() => {
    if (!allEntries?.length || !entry.ensemble_proba) return null

    const runners = [...allEntries].filter((e) => e.ensemble_proba > 0)
    const totalRunners = allEntries.length

    // ── Normalize all model probabilities across the field ──
    const norm = normalizeAllModels(allEntries)
    const horseId = String(entry.horse_id)

    // Normalized ensemble probability for this horse
    const normEnsemble = norm.ensemble_proba.get(horseId) ?? 0

    // Sort by NORMALIZED ensemble proba desc
    const sortedByEnsemble = [...runners]
      .map((e) => ({
        ...e,
        norm_ensemble: norm.ensemble_proba.get(String(e.horse_id)) ?? 0,
      }))
      .sort((a, b) => b.norm_ensemble - a.norm_ensemble)

    // This horse's rank (by normalized ensemble)
    const ensembleRank =
      sortedByEnsemble.findIndex((e) => String(e.horse_id) === horseId) + 1

    // Odds rank (lower odds = higher favourite)
    const sortedByOdds = [...allEntries]
      .filter((e) => e.current_odds && e.current_odds > 0)
      .sort((a, b) => (a.current_odds ?? Infinity) - (b.current_odds ?? Infinity))
    const oddsRank =
      sortedByOdds.findIndex((e) => String(e.horse_id) === horseId) + 1

    // Value bet: compare NORMALIZED probability to market implied probability
    const odds = Number(entry.current_odds)
    const mlProb = normEnsemble
    const impliedProb = odds > 0 ? 1 / (odds + 1) : 0
    const edge = mlProb - impliedProb
    const isValueBet = edge > 0.02 // 2%+ edge to avoid noise

    // Model-by-model analysis using normalized probabilities
    const models: { key: string; label: string; field: ProbaField }[] = [
      { key: 'ensemble', label: 'Ensemble', field: 'ensemble_proba' },
      { key: 'benter', label: 'Benter', field: 'benter_proba' },
      { key: 'mlp', label: 'MLP', field: 'mlp_proba' },
      { key: 'rf', label: 'Random Forest', field: 'rf_proba' },
      { key: 'xgboost', label: 'XGBoost', field: 'xgboost_proba' },
    ]

    const modelAnalysis = models.map((m) => {
      const normMap = norm[m.field]
      // Build sorted list by normalized probability for this model
      const sorted = [...runners]
        .filter((e) => (e[m.field] ?? 0) > 0)
        .map((e) => ({
          ...e,
          normProb: normMap.get(String(e.horse_id)) ?? 0,
        }))
        .sort((a, b) => b.normProb - a.normProb)

      const rank = sorted.findIndex((e) => String(e.horse_id) === horseId) + 1
      const normProb = normMap.get(horseId) ?? 0
      const leader = sorted[0]
      const leaderProb = leader ? leader.normProb : 0
      const isTop = rank === 1
      const gapToLeader = isTop ? 0 : leaderProb - normProb
      return { ...m, rank, prob: normProb, isTop, gapToLeader, totalRanked: sorted.length }
    })

    const modelsWhereTop = modelAnalysis.filter((m) => m.isTop)

    // Top 3 competitors (by normalized ensemble, excluding this horse)
    const competitors = sortedByEnsemble
      .filter((e) => String(e.horse_id) !== horseId)
      .slice(0, 3)

    // Field leader (by normalized ensemble)
    const fieldLeader = sortedByEnsemble[0] ?? null
    const isFieldLeader = fieldLeader ? String(fieldLeader.horse_id) === horseId : false

    return {
      totalRunners,
      runnersWithPredictions: runners.length,
      ensembleRank,
      oddsRank,
      odds,
      mlProb,        // normalized win probability
      impliedProb,
      edge,
      isValueBet,
      modelAnalysis,
      modelsWhereTop,
      competitors,   // each has norm_ensemble
      isFieldLeader,
      fieldLeader,   // has norm_ensemble
      normEnsemble,
    }
  }, [allEntries, entry])

  // ── Match this horse to any pattern alerts / smart signals ─────
  const matchedPattern = useMemo(() => {
    if (!patternAlerts?.length) return null
    return patternAlerts.find(a => String(a.horse_id) === String(entry.horse_id)) ?? null
  }, [patternAlerts, entry.horse_id])

  const matchedSignal = useMemo(() => {
    if (!smartSignals?.length) return null
    return smartSignals.find(s => String(s.horse_id) === String(entry.horse_id)) ?? null
  }, [smartSignals, entry.horse_id])

  // Fetch price history for this horse (from enrichment)
  const { data: priceHistory } = useQuery({
    queryKey: ['price-history', raceId, entry.horse_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('horse_odds_history')
        .select('bookmaker,decimal_odds,fractional_odds,recorded_at')
        .eq('race_id', raceId!)
        .eq('horse_id', String(entry.horse_id))
        .order('recorded_at', { ascending: true })
        .limit(50)
      if (error) return []
      return data ?? []
    },
    enabled: !!raceId && !!entry.horse_id,
    staleTime: 60_000,
  })

  // Using shared formatOdds from @/lib/odds

  // ── No predictions fallback ────────────────────────────────────
  if (!entry.ensemble_proba || entry.ensemble_proba === 0) {
    return (
      <div className="text-center py-12">
        <Bot className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-gray-300 font-medium mb-2">No AI Analysis</h3>
        <p className="text-gray-500">Machine learning predictions are not available for this horse.</p>
      </div>
    )
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loadingEntries) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
        <span className="text-gray-400 ml-3">Analyzing field...</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Section 1: VALUE BET VERDICT ─────────────────────── */}
      {analysis && analysis.odds > 0 ? (
        <div
          className={`rounded-xl p-5 border-2 ${
            analysis.isValueBet
              ? 'bg-green-500/5 border-green-500/40'
              : 'bg-red-500/5 border-red-500/30'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {analysis.isValueBet ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <h3 className={`text-lg font-bold ${analysis.isValueBet ? 'text-green-400' : 'text-red-400'}`}>
                {analysis.isValueBet ? 'VALUE BET' : 'NOT A VALUE BET'}
              </h3>
            </div>
            <div className="flex items-center space-x-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < getNormalizedStars(analysis.normEnsemble)
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center bg-gray-800/60 rounded-lg py-3 px-2">
              <div className="text-xs text-gray-400 mb-1">Win Probability</div>
              <div className={`text-xl font-bold ${getNormalizedColor(analysis.mlProb)}`}>
                {formatNormalized(analysis.mlProb)}
              </div>
            </div>
            <div className="text-center bg-gray-800/60 rounded-lg py-3 px-2">
              <div className="text-xs text-gray-400 mb-1">Market Implied</div>
              <div className="text-xl font-bold text-gray-300">
                {formatNormalized(analysis.impliedProb)}
              </div>
            </div>
            <div className="text-center bg-gray-800/60 rounded-lg py-3 px-2">
              <div className="text-xs text-gray-400 mb-1">Edge</div>
              <div className={`text-xl font-bold ${analysis.edge > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {analysis.edge > 0 ? '+' : ''}{(analysis.edge * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed">
            {analysis.isValueBet
              ? `Our ML models rate ${entry.horse_name} at ${formatNormalized(analysis.mlProb)} win probability, but the current odds of ${formatOdds(analysis.odds)} imply only ${formatNormalized(analysis.impliedProb)}. That's a ${(analysis.edge * 100).toFixed(1)}% edge — the market is undervaluing this horse.`
              : `At ${formatOdds(analysis.odds)}, the market implies a ${formatNormalized(analysis.impliedProb)} chance. Our ML models rate ${entry.horse_name} at ${formatNormalized(analysis.mlProb)} — there is no significant edge at current odds.`}
          </p>
        </div>
      ) : (
        /* Fallback when no odds available - just show normalized probability */
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h3 className="text-yellow-400 font-bold text-lg">Win Probability</h3>
            </div>
            <div className="flex items-center space-x-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < getNormalizedStars(analysis?.normEnsemble ?? 0)
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold ${getNormalizedColor(analysis?.normEnsemble ?? 0)} mb-1`}>
              {formatNormalized(analysis?.normEnsemble ?? 0)}
            </div>
            <div className="text-gray-400 text-sm">Normalized across {analysis?.runnersWithPredictions ?? '?'} runners</div>
          </div>
        </div>
      )}

      {/* ── Section 2: PROFITABLE PATTERN ALERT ─────────────── */}
      {matchedPattern && (
        <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-green-400" />
            <h3 className="text-green-400 font-bold">Profitable Pattern Match</h3>
          </div>

          {/* Best pattern */}
          <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
            <div className="text-sm font-semibold text-green-300 mb-1">
              {matchedPattern.best_pattern.label}
            </div>
            {matchedPattern.reasons.length > 0 && (
              <p className="text-xs text-gray-400 mb-2">
                {matchedPattern.reasons.join(' + ')}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold px-2 py-1 rounded bg-green-500/20 text-green-400">
                +{matchedPattern.best_pattern.roi_pct}% ROI
              </span>
              <span className="text-xs font-medium px-2 py-1 rounded bg-green-500/10 text-green-500/80">
                {matchedPattern.best_pattern.win_rate}% Win Rate
              </span>
              <span className="text-[10px] text-gray-500">
                {matchedPattern.best_pattern.occurrences} samples
              </span>
            </div>
          </div>

          {/* Additional matched patterns */}
          {matchedPattern.matched_patterns.length > 1 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-gray-400 font-medium">Also matches:</div>
              {matchedPattern.matched_patterns.slice(1).map((p, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-300">{p.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-green-400">+{p.roi_pct}% ROI</span>
                    <span className="text-[10px] text-gray-500">{p.win_rate}% WR</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: MARKET MOVEMENT ────────────────────────── */}
      {(matchedSignal || entry.odds_movement === 'steaming' || entry.odds_movement === 'drifting') && (
        <div className={`rounded-xl p-4 border ${
          (matchedSignal || entry.odds_movement === 'steaming')
            ? 'bg-yellow-500/5 border-yellow-500/30'
            : 'bg-red-500/5 border-red-500/30'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className={`w-5 h-5 ${entry.odds_movement === 'drifting' ? 'text-red-400' : 'text-yellow-400'}`} />
              <h3 className={`font-bold ${entry.odds_movement === 'drifting' ? 'text-red-400' : 'text-yellow-400'}`}>
                Market Movement
              </h3>
            </div>
            {matchedSignal && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                matchedSignal.signal_strength === 'strong'
                  ? (matchedSignal.is_single_trainer_entry && matchedSignal.is_ml_top_pick ? 'bg-yellow-500/30 text-yellow-300' : 'bg-green-500/20 text-green-400')
                  : 'bg-gray-600/40 text-gray-300'
              }`}>
                {matchedSignal.signal_strength === 'strong'
                  ? (matchedSignal.is_single_trainer_entry && matchedSignal.is_ml_top_pick ? 'Very High' : 'High')
                  : 'Medium'}
              </span>
            )}
          </div>

          {/* Odds movement display */}
          {matchedSignal && (
            <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-mono font-bold text-lg">
                  {formatOdds(matchedSignal.initial_odds)}
                </span>
                <ArrowRight className="w-4 h-4 text-gray-500" />
                <span className={`font-mono font-bold text-lg ${
                  entry.odds_movement === 'steaming' ? 'text-green-400' :
                  entry.odds_movement === 'drifting' ? 'text-red-400' :
                  'text-white'
                }`}>
                  {formatOdds(matchedSignal.current_odds)}
                </span>
                {matchedSignal.movement_pct && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    matchedSignal.movement_pct < 0
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {matchedSignal.movement_pct > 0 ? '+' : ''}{matchedSignal.movement_pct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-500">
                {matchedSignal.change_count} price change{matchedSignal.change_count !== 1 ? 's' : ''} detected
              </div>
            </div>
          )}

          {/* Fallback for entry-level movement without full signal data */}
          {!matchedSignal && entry.odds_movement && (
            <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                {entry.odds_movement === 'steaming' ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-sm font-semibold ${
                  entry.odds_movement === 'steaming' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {entry.odds_movement === 'steaming' ? 'Steaming' : 'Drifting'}
                </span>
                {entry.odds_movement_pct && (
                  <span className="text-xs text-gray-400">
                    ({entry.odds_movement_pct > 0 ? '+' : ''}{entry.odds_movement_pct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Signal reasons */}
          {matchedSignal && (
            <div className="space-y-1.5">
              {matchedSignal.is_ml_top_pick && (
                <div className="flex items-center gap-2 text-xs">
                  <Bot className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                  <span className="text-gray-300">
                    AI top pick — {matchedSignal.ml_models_agreeing.length} model{matchedSignal.ml_models_agreeing.length > 1 ? 's' : ''} agree ({(matchedSignal.ml_top_probability * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
              {matchedSignal.is_single_trainer_entry && matchedSignal.trainer_name && (
                <div className="flex items-center gap-2 text-xs">
                  <Trophy className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-300">Only runner for {matchedSignal.trainer_name}</span>
                </div>
              )}
              {matchedSignal.is_top_rpr && (
                <div className="flex items-center gap-2 text-xs">
                  <Star className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  <span className="text-gray-300">Top RPR in field</span>
                </div>
              )}
              {matchedSignal.historical_pattern && (
                <div className="flex items-center gap-2 text-xs mt-2 pt-2 border-t border-gray-700/50">
                  <Target className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                  <span className="text-yellow-500/80 font-medium">
                    {matchedSignal.historical_pattern.historical_win_rate}% historical win rate
                  </span>
                  <span className="text-gray-600">({matchedSignal.historical_pattern.occurrences} samples)</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section 3b: PRICE HISTORY TIMELINE ─────────────────── */}
      {priceHistory && priceHistory.length > 1 && (
        <div className="bg-gray-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-semibold">Price History</h3>
            <span className="text-xs text-gray-500 ml-auto">{priceHistory.length} snapshots</span>
          </div>

          {/* Compact price timeline */}
          <div className="space-y-1">
            {(() => {
              // Deduplicate by bookmaker and show latest movements
              const betfairPrices = priceHistory.filter((p: any) => /betfair/i.test(p.bookmaker))
              const displayPrices = betfairPrices.length > 1 ? betfairPrices : priceHistory
              // Show last 8 price points
              const recent = displayPrices.slice(-8)
              return recent.map((p: any, idx: number) => {
                const prev = idx > 0 ? recent[idx - 1] : null
                const isUp = prev ? p.decimal_odds > prev.decimal_odds : false
                const isDown = prev ? p.decimal_odds < prev.decimal_odds : false
                const time = new Date(p.recorded_at).toLocaleTimeString('en-GB', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                })
                return (
                  <div key={`${p.recorded_at}-${idx}`} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] text-gray-500 w-12">{time}</span>
                    <div className="flex-1 mx-2 h-px bg-gray-600/30" />
                    <span className={`text-xs font-mono font-bold ${
                      isDown ? 'text-green-400' : isUp ? 'text-red-400' : 'text-gray-300'
                    }`}>
                      {p.fractional_odds || formatOdds(p.decimal_odds)}
                    </span>
                    {isDown && <TrendingDown className="w-3 h-3 text-green-400 ml-1" />}
                    {isUp && <TrendingUp className="w-3 h-3 text-red-400 ml-1" />}
                    {!isDown && !isUp && <Minus className="w-3 h-3 text-gray-600 ml-1" />}
                  </div>
                )
              })
            })()}
          </div>

          {/* Bookmaker breakdown if multiple */}
          {(() => {
            const bookmakers = [...new Set(priceHistory.map((p: any) => p.bookmaker))]
            if (bookmakers.length <= 1) return null
            // Show latest price per bookmaker
            const latestByBk: Record<string, any> = {}
            for (const p of priceHistory) {
              latestByBk[p.bookmaker] = p
            }
            return (
              <div className="mt-3 pt-3 border-t border-gray-700/50">
                <div className="text-[10px] text-gray-500 mb-1">Across bookmakers:</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(latestByBk).map(([bk, p]: [string, any]) => (
                    <span key={bk} className="text-[10px] bg-gray-800 rounded px-2 py-0.5">
                      <span className="text-gray-400">{bk}:</span>{' '}
                      <span className="text-white font-mono font-bold">{p.fractional_odds || formatOdds(p.decimal_odds)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Section 4: FIELD POSITION ────────────────────────── */}
      {analysis && (
        <div className="bg-gray-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">Field Position</h3>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">ML Rank</div>
              <div className={`text-lg font-bold ${analysis.ensembleRank === 1 ? 'text-yellow-400' : analysis.ensembleRank <= 3 ? 'text-green-400' : 'text-gray-300'}`}>
                #{analysis.ensembleRank}
              </div>
              <div className="text-[10px] text-gray-500">of {analysis.runnersWithPredictions}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Market Rank</div>
              <div className={`text-lg font-bold ${analysis.oddsRank === 1 ? 'text-yellow-400' : analysis.oddsRank <= 3 ? 'text-green-400' : 'text-gray-300'}`}>
                {analysis.oddsRank > 0 ? `#${analysis.oddsRank}` : 'N/A'}
              </div>
              <div className="text-[10px] text-gray-500">{analysis.oddsRank === 1 ? 'Favourite' : analysis.oddsRank <= 3 ? 'Fancied' : 'of field'}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Models #1</div>
              <div className={`text-lg font-bold ${analysis.modelsWhereTop.length >= 3 ? 'text-yellow-400' : analysis.modelsWhereTop.length >= 1 ? 'text-green-400' : 'text-gray-400'}`}>
                {analysis.modelsWhereTop.length}/5
              </div>
              <div className="text-[10px] text-gray-500">top pick</div>
            </div>
          </div>

          {/* Win probability bar relative to field leader */}
          {analysis.fieldLeader && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>Win probability</span>
                <span>{analysis.isFieldLeader ? 'Leading the field' : `Leader: ${analysis.fieldLeader.horse_name}`}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    analysis.isFieldLeader
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                      : 'bg-gradient-to-r from-blue-400 to-blue-500'
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      analysis.fieldLeader.norm_ensemble > 0
                        ? (analysis.normEnsemble / analysis.fieldLeader.norm_ensemble) * 100
                        : 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: MODEL BREAKDOWN ───────────────────────── */}
      {analysis && (
        <div className="bg-gray-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">Model Breakdown</h3>
          </div>

          <div className="space-y-2.5">
            {analysis.modelAnalysis.map((m) => (
              <div
                key={m.key}
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                  m.isTop ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  {m.isTop && (
                    <span className="bg-yellow-500 text-gray-900 text-[9px] font-bold px-1.5 py-0.5 rounded">
                      #1
                    </span>
                  )}
                  <span className={`text-sm font-medium ${m.isTop ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {m.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${getNormalizedColor(m.prob)}`}>
                    {formatNormalized(m.prob)}
                  </span>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {m.isTop
                      ? 'Top pick'
                      : m.rank > 0
                        ? `#${m.rank} (−${(m.gapToLeader * 100).toFixed(1)}%)`
                        : 'N/A'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: KEY COMPETITORS ───────────────────────── */}
      {analysis && analysis.competitors.length > 0 && (
        <div className="bg-gray-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">Key Competitors</h3>
          </div>

          <div className="space-y-2">
            {analysis.competitors.map((comp, idx) => {
              return (
                <div
                  key={comp.horse_id}
                  className="flex items-center justify-between py-2.5 px-3 bg-gray-800/40 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {comp.horse_name}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {comp.jockey_name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${getNormalizedColor(comp.norm_ensemble)}`}>
                        {formatNormalized(comp.norm_ensemble)}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {comp.current_odds ? formatOdds(comp.current_odds) : '—'}
                      </div>
                    </div>
                    {comp.norm_ensemble > analysis.normEnsemble ? (
                      <TrendingUp className="w-4 h-4 text-red-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {analysis.competitors[0] && analysis.normEnsemble > 0 && (
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">
              {analysis.isFieldLeader
                ? `${entry.horse_name} leads the field with ${formatNormalized(analysis.normEnsemble)} win probability. Nearest threat is ${analysis.competitors[0].horse_name} at ${formatNormalized(analysis.competitors[0].norm_ensemble)} — a ${((analysis.normEnsemble - analysis.competitors[0].norm_ensemble) * 100).toFixed(1)}% gap.`
                : `${analysis.fieldLeader?.horse_name ?? 'The leader'} tops the ML rankings at ${formatNormalized(analysis.fieldLeader?.norm_ensemble ?? 0)}. ${entry.horse_name} sits ${((( analysis.fieldLeader?.norm_ensemble ?? 0) - analysis.normEnsemble) * 100).toFixed(1)}% behind.`}
            </p>
          )}
        </div>
      )}

      {/* ── Section 5: EXPERT INSIGHT ────────────────────────── */}
      {(entry.spotlight || entry.comment) && (
        <div className="bg-gray-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h3 className="text-white font-semibold">Expert Insight</h3>
          </div>
          {entry.spotlight && (
            <p className="text-gray-200 text-sm leading-relaxed mb-3">{entry.spotlight}</p>
          )}
          {entry.comment && entry.comment !== entry.spotlight && (
            <p className="text-gray-400 text-sm leading-relaxed italic border-t border-gray-600 pt-3">
              {entry.comment}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function StatisticsTab({ entry }: TabContentProps) {
  return (
    <div className="space-y-6">
      {/* Distance & Going Performance */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Distance & Going Performance</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Best Speed at Course/Going/Distance</span>
            <span className="text-white font-medium">
              {formatNumber(entry.best_speed_figure_on_course_going_distance)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Last Speed on Going/Distance</span>
            <span className="text-white font-medium">
              {formatNumber(entry.last_speed_figure_on_going_distance)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Avg Finish on Going</span>
            <span className="text-white font-medium">
              {formatNumber(entry.avg_finishing_position_going)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Avg Overall Button on Going</span>
            <span className="text-white font-medium">
              {formatNumber(entry.avg_ovr_button_on_going)}
            </span>
          </div>
        </div>
      </div>

      {/* Trainer Course Performance */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Trainer at Course</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Average Overall Button</span>
            <span className="text-white font-medium">
              {formatNumber(entry.trainer_avg_ovr_btn_at_course)}
            </span>
          </div>
        </div>
      </div>

      {/* Additional Statistics */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Additional Stats</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Past Results Flags</span>
            <span className="text-white font-medium font-mono">
              {entry.past_results_flags || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Distance Yards</span>
            <span className="text-white font-medium">
              {entry.dist_y ? `${entry.dist_y} yards` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Quotes */}
      {entry.quotes && (
        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Quotes</h3>
          <p className="text-gray-100 leading-relaxed italic">"{entry.quotes}"</p>
        </div>
      )}
    </div>
  )
}
