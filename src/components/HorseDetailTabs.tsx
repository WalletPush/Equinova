import React from 'react'
import { TrendingUp, TrendingDown, Minus, Star, Bot, Trophy } from 'lucide-react'
import { RaceEntry } from '@/lib/supabase'

export interface TabContentProps {
  entry: RaceEntry
  raceId?: string
}

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

const getPerformanceIndicator = (value: number | null | undefined, threshold: number = 50) => {
  if (!value) return <Minus className="w-4 h-4 text-gray-500" />
  if (value > threshold) return <TrendingUp className="w-4 h-4 text-green-500" />
  return <TrendingDown className="w-4 h-4 text-red-500" />
}

const formatPercentage = (value: number | null | undefined) => {
  if (!value) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

const formatNumber = (value: number | null | undefined, decimals: number = 1) => {
  if (value === null || value === undefined) return 'N/A'
  return value.toFixed(decimals)
}

export function OverviewTab({ entry }: TabContentProps) {
  return (
    <div className="space-y-6">
      {/* Horse Basic Info */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3">Horse Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-gray-400 text-sm">Age</div>
            <div className="text-white font-medium">{entry.age} years old</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Sex</div>
            <div className="text-white font-medium">{entry.sex}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Weight</div>
            <div className="text-white font-medium">{entry.lbs} lbs</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Draw</div>
            <div className="text-white font-medium">{entry.draw || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Current Odds & Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Current Status</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Current Odds</span>
              <span className="text-white font-bold font-mono text-lg">
                {entry.current_odds ? `${entry.current_odds}/1` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Number</span>
              <span className="text-white font-medium">#{entry.number}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Rating Figures</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">RPR</span>
              <span className="text-white font-medium">{entry.rpr || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">TS</span>
              <span className="text-white font-medium">{entry.ts || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">OFR</span>
              <span className="text-white font-medium">{entry.ofr || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick AI Prediction */}
      {entry.ensemble_proba > 0 && (
        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-yellow-400" />
              <h3 className="text-yellow-400 font-semibold">AI Prediction</h3>
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
          <div className="flex items-center justify-between">
            <span className="text-white">Win Probability</span>
            <span className={`text-xl font-bold ${getConfidenceColor(entry.ensemble_proba)}`}>
              {formatPercentage(entry.ensemble_proba)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function FormTab({ entry }: TabContentProps) {
  return (
    <div className="space-y-6">
      {/* Recent Form */}
      {entry.form && (
        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Recent Form</h3>
          <div className="font-mono text-white text-lg bg-gray-800/50 px-4 py-3 rounded border">
            {entry.form}
          </div>
          <div className="text-sm text-gray-400 mt-2">
            Last run: {entry.last_run ? `${entry.last_run} days ago` : 'Unknown'}
          </div>
        </div>
      )}

      {/* Speed Figures */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Speed Figures</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Mean Speed Figure</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.mean_speed_figure, 80)}
                <span className="text-white font-medium">
                  {formatNumber(entry.mean_speed_figure)}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Last Speed Figure</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.last_speed_figure, 80)}
                <span className="text-white font-medium">
                  {formatNumber(entry.last_speed_figure)}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Best at Distance</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.best_speed_figure_at_distance, 90)}
                <span className="text-white font-medium">
                  {formatNumber(entry.best_speed_figure_at_distance)}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Best at Track</span>
              <div className="flex items-center space-x-2">
                {getPerformanceIndicator(entry.best_speed_figure_at_track, 90)}
                <span className="text-white font-medium">
                  {formatNumber(entry.best_speed_figure_at_track)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Avg Finishing Position</span>
              <span className="text-white font-medium">
                {formatNumber(entry.avg_finishing_position)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Avg Overall Button</span>
              <span className="text-white font-medium">
                {formatNumber(entry.avg_ovr_btn)}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Win % at Distance</span>
              <span className="text-white font-medium">
                {formatPercentage(entry.horse_win_percentage_at_distance)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">A/E at Distance</span>
              <span className="text-white font-medium">
                {formatNumber(entry.horse_ae_at_distance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Comments */}
      {(entry.comment || entry.spotlight) && (
        <div className="space-y-4">
          {entry.comment && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Expert Comment</h3>
              <p className="text-gray-100 leading-relaxed">{entry.comment}</p>
            </div>
          )}
          {entry.spotlight && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3">Spotlight</h3>
              <p className="text-gray-100 leading-relaxed">{entry.spotlight}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
