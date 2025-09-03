import React from 'react'
import { TrendingUp, TrendingDown, Minus, Star, Bot } from 'lucide-react'
import { RaceEntry } from '@/lib/supabase'
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

export function PredictionsTab({ entry }: TabContentProps) {
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

  return (
    <div className="space-y-6">
      {entry.ensemble_proba > 0 ? (
        <>
          {/* Ensemble Prediction */}
          <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-yellow-400 font-semibold text-lg">Ensemble Model</h3>
              <div className="flex items-center space-x-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star 
                    key={i}
                    className={`w-5 h-5 ${
                      i < getConfidenceStars(entry.ensemble_proba) 
                        ? 'text-yellow-400 fill-current' 
                        : 'text-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${getConfidenceColor(entry.ensemble_proba)} mb-2`}>
                {formatPercentage(entry.ensemble_proba)}
              </div>
              <div className="text-gray-300">Win Probability</div>
            </div>
          </div>

          {/* Individual Model Predictions */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-4">Individual Models</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {entry.benter_proba > 0 && (
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Benter</div>
                  <div className="text-white font-bold">
                    {formatPercentage(entry.benter_proba)}
                  </div>
                </div>
              )}
              {entry.mlp_proba > 0 && (
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">MLP</div>
                  <div className="text-white font-bold">
                    {formatPercentage(entry.mlp_proba)}
                  </div>
                </div>
              )}
              {entry.rf_proba > 0 && (
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">Random Forest</div>
                  <div className="text-white font-bold">
                    {formatPercentage(entry.rf_proba)}
                  </div>
                </div>
              )}
              {entry.xgboost_proba > 0 && (
                <div className="text-center">
                  <div className="text-gray-400 text-sm mb-1">XGBoost</div>
                  <div className="text-white font-bold">
                    {formatPercentage(entry.xgboost_proba)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Model Consensus */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3">Model Analysis</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Predicted Winner</span>
                <span className={`font-bold ${
                  entry.predicted_winner === 1 ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {entry.predicted_winner === 1 ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="text-sm text-gray-400 mt-3">
                The ensemble model combines multiple ML algorithms to provide the most accurate prediction possible.
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <Bot className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-gray-300 font-medium mb-2">No AI Predictions</h3>
          <p className="text-gray-500">Machine learning predictions are not available for this horse.</p>
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
