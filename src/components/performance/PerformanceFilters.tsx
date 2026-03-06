import React from 'react'
import { Calendar, Filter } from 'lucide-react'

export interface PerformanceFilters {
  period: '7d' | '14d' | '30d' | 'custom' | 'lifetime'
  startDate: string
  endDate: string
  raceType: 'all' | 'flat' | 'aw' | 'hurdles' | 'chase'
  model: string
  signal: string
}

interface PerformanceFiltersBarProps {
  filters: PerformanceFilters
  onChange: (filters: PerformanceFilters) => void
}

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'custom', label: 'Custom' },
  { value: 'lifetime', label: 'Lifetime' },
] as const

const RACE_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'flat', label: 'Flat' },
  { value: 'aw', label: 'AW' },
  { value: 'hurdles', label: 'Hurdles' },
  { value: 'chase', label: 'Chase' },
] as const

const MODEL_OPTIONS = [
  { value: 'all', label: 'All Models' },
  { value: 'benter', label: 'Benter' },
  { value: 'rf', label: 'Random Forest' },
  { value: 'mlp', label: 'MLP' },
  { value: 'xgboost', label: 'XGBoost' },
  { value: 'ensemble', label: 'Ensemble' },
]

export const SIGNAL_OPTIONS = [
  { value: 'all', label: 'All Signals' },
  { value: 'cd_ml_value', label: 'C&D + ML Pick + Value' },
  { value: 'cd_ml_backed', label: 'C&D + ML Pick + Backed' },
  { value: 'cd_ml_pick', label: 'C&D + ML Pick' },
  { value: 'cd_value', label: 'C&D + Value Bet' },
  { value: 'cd_backed', label: 'C&D + Backed' },
  { value: 'cd_top_rated', label: 'C&D + Top Rated' },
  { value: 'value_ml_backed_rated', label: 'Value + ML + Backed + Top Rated' },
  { value: 'value_ml_top_rated', label: 'Value + ML Pick + Top Rated' },
  { value: 'value_ml_backed', label: 'Value + ML Pick + Backed' },
  { value: 'triple_signal', label: 'Triple Signal (Backed + ML + Top Rated)' },
  { value: 'value_ml_pick', label: 'Value + ML Pick' },
  { value: 'value_top_rated', label: 'Value + Top Rated' },
  { value: 'steamer_ml_pick', label: 'Backed + ML Pick' },
  { value: 'steamer_trainer_form', label: 'Backed + Trainer in Form' },
  { value: 'ml_ratings_consensus', label: 'ML Pick + Top RPR + Top TS' },
  { value: 'ml_pick_top_rpr', label: 'ML Pick + Top RPR' },
  { value: 'ml_pick_course_specialist', label: 'ML Pick + Course Specialist' },
  { value: 'ml_pick_trainer_form', label: 'ML Pick + Trainer in Form' },
  { value: 'ratings_consensus', label: 'Top RPR + Top TS' },
  { value: 'value_bet', label: 'Value Bet (AI Edge)' },
  { value: 'value_backed', label: 'Value + Backed' },
  { value: 'ml_top_pick', label: 'ML Top Pick' },
  { value: 'top_rpr', label: 'Top RPR in Field' },
  { value: 'top_ts', label: 'Top Topspeed in Field' },
  { value: 'steamer', label: 'Backed (Odds Shortening)' },
  { value: 'cd_specialist', label: 'C&D Specialist' },
  { value: 'course_specialist', label: 'Course Specialist' },
  { value: 'trainer_form', label: 'Trainer in Form (21d)' },
  { value: 'speed_standout', label: 'Speed Figure Standout' },
]

export const SIGNAL_LABELS: Record<string, string> = {}
for (const o of SIGNAL_OPTIONS) {
  SIGNAL_LABELS[o.value] = o.label
}

export const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  cd_ml_value: 'Course & distance winner/form + ML top pick + AI value edge — elite C&D signal',
  cd_ml_backed: 'Course & distance winner/form + ML top pick + odds shortening',
  cd_ml_pick: 'Course & distance winner/form + ML model top pick',
  cd_value: 'Course & distance winner/form + AI value edge vs bookmaker odds',
  cd_backed: 'Course & distance winner/form + odds shortening from forecast to SP',
  cd_top_rated: 'Course & distance winner/form + highest RPR or Topspeed in field',
  cd_specialist: 'Horse has won or placed at this course and distance (from expert comment)',
  value_ml_backed_rated: 'AI value edge + ML top pick + odds shortening + top RPR/TS — strongest combo signal',
  value_ml_top_rated: 'AI value edge + ML top pick + highest RPR or Topspeed in field',
  value_ml_backed: 'AI value edge + ML top pick + odds shortening from forecast to SP',
  value_ml_pick: 'AI probability exceeds bookmaker odds + ML model top pick',
  value_top_rated: 'AI probability exceeds bookmaker odds + highest RPR or Topspeed in field',
  value_bet: 'AI ensemble probability 5%+ higher than bookmaker implied probability',
  value_backed: 'AI value edge + odds shortened from forecast to SP',
  triple_signal: 'Odds shortening + ML top pick + highest RPR or Topspeed in field',
  steamer_ml_pick: 'Odds shortening + ML model top pick',
  steamer_trainer_form: 'Odds shortening + trainer win rate ≥15% last 21 days',
  ml_ratings_consensus: 'ML top pick + best RPR + best Topspeed in field',
  ml_pick_top_rpr: 'ML model top pick + highest Racing Post Rating in field',
  ml_pick_course_specialist: 'ML top pick + proven horse/trainer at course & distance',
  ml_pick_trainer_form: 'ML top pick + trainer win rate ≥15% last 21 days',
  ratings_consensus: 'Highest RPR + highest Topspeed in the field',
  ml_top_pick: 'Top pick by at least one ML model',
  top_rpr: 'Highest Racing Post Rating in the field',
  top_ts: 'Highest Topspeed figure in the field',
  steamer: 'Odds shortened significantly (SP lower than forecast)',
  course_specialist: 'Horse/trainer has strong course & distance record',
  trainer_form: 'Trainer win rate ≥15% over last 21 days',
  speed_standout: 'Speed figures 5%+ above field average',
}

export function PerformanceFiltersBar({ filters, onChange }: PerformanceFiltersBarProps) {
  const update = (partial: Partial<PerformanceFilters>) =>
    onChange({ ...filters, ...partial })

  return (
    <div className="space-y-3">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ period: opt.value })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                filters.period === opt.value
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {filters.period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={e => update({ startDate: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
            />
            <span className="text-gray-600 text-xs">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => update({ endDate: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:border-yellow-500/50 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Race type + Model + Signal filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />

        {/* Race type chips */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {RACE_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ raceType: opt.value })}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filters.raceType === opt.value
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Model dropdown */}
        <select
          value={filters.model}
          onChange={e => update({ model: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:border-yellow-500/50 focus:outline-none cursor-pointer appearance-none"
        >
          {MODEL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Signal dropdown */}
        <select
          value={filters.signal}
          onChange={e => update({ signal: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:border-yellow-500/50 focus:outline-none cursor-pointer appearance-none"
        >
          {SIGNAL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
