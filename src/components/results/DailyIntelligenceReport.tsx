import React from 'react'
import {
  Brain,
  Loader2,
  ChevronUp,
  ChevronDown,
  Zap,
  Target,
  Lightbulb,
} from 'lucide-react'

const SIGNAL_LABELS: Record<string, string> = {
  steamer_ml_pick: 'Backed + ML Pick',
  ml_ratings_consensus: 'ML + RPR + TS',
  ratings_consensus: 'RPR + TS Consensus',
  ml_pick_top_rpr: 'ML Pick + Top RPR',
  ml_top_pick: 'ML Top Pick',
  top_rpr: 'Top RPR in Field',
  top_ts: 'Top Topspeed',
  steamer: 'Market Confidence',
  single_trainer: 'Single Trainer Entry',
  speed_standout: 'Speed Figure Standout',
  drifter: 'Market Drifter',
  trainer_form: 'Trainer in Form (21d)',
  jockey_form: 'Jockey in Form (21d)',
  course_specialist: 'Course Specialist',
  distance_form: 'Distance Specialist',
  steamer_single_trainer: 'Backed + Single Trainer',
  steamer_trainer_form: 'Backed + Trainer Form',
  triple_signal: 'Triple Signal',
  ml_pick_trainer_form: 'ML + Trainer Form',
  single_trainer_in_form: 'Single Trainer in Form',
  steamer_jockey_form: 'Backed + Jockey Form',
  ml_pick_course_specialist: 'ML + Course Specialist',
}

const ATOMIC_SIGNALS = new Set([
  'single_trainer', 'ml_top_pick', 'top_rpr', 'top_ts',
  'trainer_form', 'jockey_form', 'course_specialist',
  'distance_form', 'speed_standout',
])

interface Props {
  analysisData: any
  expanded: boolean
  onToggleExpanded: () => void
  onReRunAnalysis: () => void
  isAnalyzing: boolean
  pendingCount: number
}

export function DailyIntelligenceReport({
  analysisData,
  expanded,
  onToggleExpanded,
  onReRunAnalysis,
  isAnalyzing,
  pendingCount,
}: Props) {
  if (!analysisData) {
    return (
      <button
        onClick={onReRunAnalysis}
        disabled={isAnalyzing || pendingCount > 0}
        className="w-full bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/40 rounded-xl p-4 hover:from-yellow-500/30 hover:to-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-center space-x-3">
          {isAnalyzing ? (
            <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
          ) : (
            <Brain className="w-5 h-5 text-yellow-400" />
          )}
          <span className="text-yellow-400 font-semibold">
            {isAnalyzing ? 'Analyzing...' : 'Assess Results — Generate Daily Intelligence'}
          </span>
        </div>
        {pendingCount > 0 && !isAnalyzing && (
          <p className="text-xs text-gray-500 mt-1">Available once all races are completed</p>
        )}
      </button>
    )
  }

  const allStats: any[] = []
  const addStat = (data: any) => {
    if (data && data.occurrences > 0) allStats.push(data)
  }
  addStat(analysisData.steamer_stats)
  addStat(analysisData.single_trainer_stats)
  addStat(analysisData.top_rpr_stats)
  addStat(analysisData.top_ts_stats)
  addStat(analysisData.trainer_form_stats)
  addStat(analysisData.jockey_form_stats)
  addStat(analysisData.course_specialist_stats)
  addStat(analysisData.distance_specialist_stats)
  addStat(analysisData.speed_figure_stats)
  if (analysisData.combined_signal_stats) {
    for (const s of Object.values(analysisData.combined_signal_stats as Record<string, any>)) {
      addStat(s)
    }
  }
  allStats.sort((a, b) => b.win_rate - a.win_rate)

  return (
    <div className="bg-gray-800/90 border border-yellow-500/30 rounded-xl">
      <button
        onClick={onToggleExpanded}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <Brain className="w-5 h-5 text-yellow-400" />
          <h2 className="text-base font-semibold text-white">Daily Intelligence Report</h2>
          <span className="text-xs bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded">
            {analysisData.completed_races} races analyzed
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {analysisData.ml_accuracy && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ML Model Performance</h3>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(analysisData.ml_accuracy as Record<string, any>)
                  .sort(([,a]: any, [,b]: any) => b.win_rate - a.win_rate)
                  .map(([model, stats]: [string, any]) => (
                  <div key={model} className={`rounded-lg p-2.5 text-center ${
                    stats.win_rate >= 30 ? 'bg-green-500/10 border border-green-500/20' :
                    stats.win_rate >= 20 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                    'bg-gray-700/30 border border-gray-700'
                  }`}>
                    <div className="text-[10px] text-gray-400 uppercase font-medium">{model}</div>
                    <div className={`text-lg font-bold ${
                      stats.win_rate >= 30 ? 'text-green-400' : stats.win_rate >= 20 ? 'text-yellow-400' : 'text-gray-300'
                    }`}>{stats.win_rate}%</div>
                    <div className="text-[10px] text-gray-500">{stats.wins}/{stats.picks} wins</div>
                    {stats.roi_pct !== undefined && (
                      <div className={`text-[10px] font-semibold mt-0.5 ${
                        stats.roi_pct > 0 ? 'text-green-400' : stats.roi_pct < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {stats.roi_pct > 0 ? '+' : ''}{stats.roi_pct}% ROI
                      </div>
                    )}
                    {stats.profit !== undefined && (
                      <div className={`text-[10px] ${
                        stats.profit > 0 ? 'text-green-500/70' : stats.profit < 0 ? 'text-red-500/70' : 'text-gray-600'
                      }`}>
                        {stats.profit > 0 ? '+' : ''}&pound;{stats.profit.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {allStats.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Signal Performance &amp; ROI (£1 Level Stakes)</h3>
              <div className="flex items-center justify-between py-1 px-3 mb-1">
                <span className="text-[10px] text-gray-600 uppercase">Signal</span>
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] text-gray-600 uppercase min-w-[36px] text-right">Bets</span>
                  <span className="text-[10px] text-gray-600 uppercase min-w-[40px] text-right">Win%</span>
                  <span className="text-[10px] text-gray-600 uppercase min-w-[52px] text-right">P&amp;L</span>
                  <span className="text-[10px] text-gray-600 uppercase min-w-[44px] text-right">ROI</span>
                </div>
              </div>
              <div className="space-y-1">
                {allStats.map((s: any) => {
                  const label = SIGNAL_LABELS[s.signal_type] || s.signal_type
                  const isCompound = s.signal_type?.includes('_') && !ATOMIC_SIGNALS.has(s.signal_type)
                  const hasRoi = s.roi_pct !== undefined && s.roi_pct !== null
                  const profit = s.profit ?? 0
                  return (
                    <div key={s.signal_type} className={`flex items-center justify-between py-1.5 px-3 rounded ${
                      hasRoi && profit > 0 ? 'bg-green-500/10' : s.win_rate >= 40 ? 'bg-green-500/10' : s.win_rate >= 20 ? 'bg-gray-700/30' : 'bg-gray-800/30'
                    }`}>
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        {isCompound ? <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" /> : <Target className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                        <span className="text-sm text-gray-300 truncate">{label}</span>
                      </div>
                      <div className="flex items-center space-x-3 flex-shrink-0">
                        <span className="text-xs text-gray-500 min-w-[36px] text-right">{s.occurrences} bets</span>
                        <span className={`text-xs font-bold min-w-[40px] text-right ${
                          s.win_rate >= 40 ? 'text-green-400' : s.win_rate >= 20 ? 'text-yellow-400' : s.win_rate <= 10 ? 'text-red-400' : 'text-gray-300'
                        }`}>{s.win_rate}%</span>
                        {hasRoi && (
                          <>
                            <span className={`text-xs font-semibold min-w-[52px] text-right ${
                              profit > 0 ? 'text-green-400' : profit < 0 ? 'text-red-400' : 'text-gray-500'
                            }`}>
                              {profit > 0 ? '+' : ''}&pound;{profit.toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold min-w-[44px] text-right px-1 py-0.5 rounded ${
                              s.roi_pct > 0 ? 'bg-green-500/15 text-green-400' : s.roi_pct < -20 ? 'bg-red-500/15 text-red-400' : 'text-gray-500'
                            }`}>
                              {s.roi_pct > 0 ? '+' : ''}{s.roi_pct}%
                            </span>
                          </>
                        )}
                        {!hasRoi && (
                          <span className="text-xs text-gray-500 min-w-[40px] text-right">{s.wins}/{s.occurrences}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {analysisData.top_insights && (analysisData.top_insights as string[]).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Insights</h3>
              <div className="space-y-1.5">
                {(analysisData.top_insights as string[]).map((insight: string, i: number) => (
                  <div key={i} className="flex items-start space-x-2 text-sm">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300">{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onReRunAnalysis}
            disabled={isAnalyzing}
            className="text-xs text-gray-500 hover:text-gray-400 flex items-center space-x-1 transition-colors"
          >
            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
            <span>{isAnalyzing ? 'Re-analyzing...' : 'Re-run analysis'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
