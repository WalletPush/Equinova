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
  { value: 'triple_signal', label: 'Triple Signal' },
  { value: 'steamer_ml_pick', label: 'Backed + ML Pick' },
  { value: 'steamer_trainer_form', label: 'Backed + Trainer Form' },
  { value: 'ml_ratings_consensus', label: 'ML + RPR + TS' },
  { value: 'ml_pick_top_rpr', label: 'ML Pick + Top RPR' },
  { value: 'ml_pick_course_specialist', label: 'ML + Course Specialist' },
  { value: 'ml_pick_trainer_form', label: 'ML + Trainer Form' },
  { value: 'ratings_consensus', label: 'RPR + TS Consensus' },
  { value: 'ml_top_pick', label: 'ML Top Pick' },
  { value: 'top_rpr', label: 'Top RPR' },
  { value: 'top_ts', label: 'Top Topspeed' },
  { value: 'steamer', label: 'Market Confidence' },
  { value: 'course_specialist', label: 'Course Specialist' },
  { value: 'trainer_form', label: 'Trainer in Form' },
  { value: 'speed_standout', label: 'Speed Figure Standout' },
]

export const SIGNAL_LABELS: Record<string, string> = {}
for (const o of SIGNAL_OPTIONS) {
  SIGNAL_LABELS[o.value] = o.label
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
