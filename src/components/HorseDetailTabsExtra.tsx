import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, Star, Bot, CheckCircle2, XCircle, Trophy, Target, Users, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { RaceEntry, supabase } from '@/lib/supabase'
import { TabContentProps } from './HorseDetailTabs'

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

export function PredictionsTab({ entry, raceId }: TabContentProps) {
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

  // ── Computed analysis ──────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!allEntries?.length || !entry.ensemble_proba) return null

    const runners = [...allEntries].filter((e) => e.ensemble_proba > 0)
    const totalRunners = allEntries.length

    // Sort by ensemble proba desc
    const sortedByEnsemble = [...runners].sort(
      (a, b) => (b.ensemble_proba ?? 0) - (a.ensemble_proba ?? 0)
    )

    // This horse's rank
    const ensembleRank =
      sortedByEnsemble.findIndex(
        (e) => e.horse_id === entry.horse_id
      ) + 1

    // Odds rank (lower odds = higher favourite)
    const sortedByOdds = [...allEntries]
      .filter((e) => e.current_odds && e.current_odds > 0)
      .sort((a, b) => (a.current_odds ?? Infinity) - (b.current_odds ?? Infinity))
    const oddsRank =
      sortedByOdds.findIndex((e) => e.horse_id === entry.horse_id) + 1

    // Value bet calculation
    const odds = Number(entry.current_odds)
    const mlProb = entry.ensemble_proba
    const impliedProb = odds > 0 ? 1 / (odds + 1) : 0
    const edge = mlProb - impliedProb
    const isValueBet = edge > 0.02 // 2%+ edge to avoid noise

    // Model-by-model top picks & ranks
    const models = [
      { key: 'ensemble', label: 'Ensemble', field: 'ensemble_proba' as const },
      { key: 'benter', label: 'Benter', field: 'benter_proba' as const },
      { key: 'mlp', label: 'MLP', field: 'mlp_proba' as const },
      { key: 'rf', label: 'Random Forest', field: 'rf_proba' as const },
      { key: 'xgboost', label: 'XGBoost', field: 'xgboost_proba' as const },
    ]

    const modelAnalysis = models.map((m) => {
      const sorted = [...runners]
        .filter((e) => (e[m.field] ?? 0) > 0)
        .sort((a, b) => (b[m.field] ?? 0) - (a[m.field] ?? 0))
      const rank = sorted.findIndex((e) => e.horse_id === entry.horse_id) + 1
      const prob = Number(entry[m.field] ?? 0)
      const leader = sorted[0]
      const leaderProb = leader ? Number(leader[m.field] ?? 0) : 0
      const isTop = rank === 1
      const gapToLeader = isTop ? 0 : leaderProb - prob
      return { ...m, rank, prob, isTop, gapToLeader, totalRanked: sorted.length }
    })

    const modelsWhereTop = modelAnalysis.filter((m) => m.isTop)

    // Top 3 competitors (by ensemble, excluding this horse)
    const competitors = sortedByEnsemble
      .filter((e) => e.horse_id !== entry.horse_id)
      .slice(0, 3)

    // Field leader
    const fieldLeader = sortedByEnsemble[0]
    const isFieldLeader = fieldLeader?.horse_id === entry.horse_id

    return {
      totalRunners,
      runnersWithPredictions: runners.length,
      ensembleRank,
      oddsRank,
      odds,
      mlProb,
      impliedProb,
      edge,
      isValueBet,
      modelAnalysis,
      modelsWhereTop,
      competitors,
      isFieldLeader,
      fieldLeader,
    }
  }, [allEntries, entry])

  // ── Helpers ────────────────────────────────────────────────────
  const getConfidenceColor = (proba: number) => {
    if (proba >= 0.7) return 'text-green-400'
    if (proba >= 0.5) return 'text-yellow-400'
    return 'text-gray-400'
  }

  const getConfidenceStars = (proba: number) => {
    if (proba >= 0.8) return 5
    if (proba >= 0.6) return 4
    if (proba >= 0.4) return 3
    if (proba >= 0.2) return 2
    return 1
  }

  // ── No predictions fallback ────────────────────────────────────
  if (!entry.ensemble_proba || entry.ensemble_proba === 0) {
    return (
      <div className="text-center py-12">
        <Bot className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-gray-300 font-medium mb-2">No AI Predictions</h3>
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
                    i < getConfidenceStars(entry.ensemble_proba)
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center bg-gray-800/60 rounded-lg py-3 px-2">
              <div className="text-xs text-gray-400 mb-1">ML Probability</div>
              <div className={`text-xl font-bold ${getConfidenceColor(analysis.mlProb)}`}>
                {(analysis.mlProb * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-center bg-gray-800/60 rounded-lg py-3 px-2">
              <div className="text-xs text-gray-400 mb-1">Market Implied</div>
              <div className="text-xl font-bold text-gray-300">
                {(analysis.impliedProb * 100).toFixed(1)}%
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
              ? `Our ML models rate ${entry.horse_name} at ${(analysis.mlProb * 100).toFixed(1)}% win probability, but the current odds of ${analysis.odds}/1 imply only ${(analysis.impliedProb * 100).toFixed(1)}%. That's a ${(analysis.edge * 100).toFixed(1)}% edge — the market is undervaluing this horse.`
              : `At ${analysis.odds}/1, the market implies a ${(analysis.impliedProb * 100).toFixed(1)}% chance. Our ML models rate ${entry.horse_name} at ${(analysis.mlProb * 100).toFixed(1)}% — there is no significant edge at current odds.`}
          </p>
        </div>
      ) : (
        /* Fallback when no odds available - just show ML probability */
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              <h3 className="text-yellow-400 font-bold text-lg">ML Win Probability</h3>
            </div>
            <div className="flex items-center space-x-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < getConfidenceStars(entry.ensemble_proba)
                      ? 'text-yellow-400 fill-current'
                      : 'text-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold ${getConfidenceColor(entry.ensemble_proba)} mb-1`}>
              {(entry.ensemble_proba * 100).toFixed(1)}%
            </div>
            <div className="text-gray-400 text-sm">Ensemble Model Confidence</div>
          </div>
        </div>
      )}

      {/* ── Section 2: FIELD POSITION ────────────────────────── */}
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

          {/* Ensemble probability bar relative to field */}
          {analysis.fieldLeader && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>Field strength</span>
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
                      analysis.fieldLeader.ensemble_proba > 0
                        ? (entry.ensemble_proba / analysis.fieldLeader.ensemble_proba) * 100
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
                  <span className={`text-sm font-bold ${getConfidenceColor(m.prob)}`}>
                    {(m.prob * 100).toFixed(1)}%
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
                      <div className={`text-sm font-bold ${getConfidenceColor(comp.ensemble_proba)}`}>
                        {(comp.ensemble_proba * 100).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {comp.current_odds ? `${comp.current_odds}/1` : '—'}
                      </div>
                    </div>
                    {comp.ensemble_proba > entry.ensemble_proba ? (
                      <TrendingUp className="w-4 h-4 text-red-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {analysis.competitors[0] && entry.ensemble_proba > 0 && (
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">
              {analysis.isFieldLeader
                ? `${entry.horse_name} leads the field. Nearest threat is ${analysis.competitors[0].horse_name} at ${(analysis.competitors[0].ensemble_proba * 100).toFixed(1)}% — a ${((entry.ensemble_proba - analysis.competitors[0].ensemble_proba) * 100).toFixed(1)}% gap.`
                : `${analysis.fieldLeader?.horse_name ?? 'The leader'} tops the ML rankings at ${(analysis.fieldLeader?.ensemble_proba * 100).toFixed(1)}%. ${entry.horse_name} sits ${((analysis.fieldLeader?.ensemble_proba - entry.ensemble_proba) * 100).toFixed(1)}% behind.`}
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
