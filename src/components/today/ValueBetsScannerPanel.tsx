import React from 'react'
import { Link } from 'react-router-dom'
import { Zap, X, Search } from 'lucide-react'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { formatOdds } from '@/lib/odds'
import { formatTime } from '@/lib/dateUtils'
import type { ValueBetResult } from '@/lib/valueBets'
import type { SmartSignal, PatternAlert } from '@/types/signals'

interface ValueBetsScannerPanelProps {
  valueBets: ValueBetResult[]
  onClose: () => void
  openHorseDetail: (entry: any, raceContext: any, signals: any) => void
  allPatternAlerts: PatternAlert[]
  allSmartSignals: SmartSignal[]
}

export function ValueBetsScannerPanel({
  valueBets,
  onClose,
  openHorseDetail,
  allPatternAlerts,
  allSmartSignals,
}: ValueBetsScannerPanelProps) {
  return (
    <div className="bg-gray-800/90 border border-green-500/30 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-green-400" />
          <h3 className="text-white font-bold text-sm">Top Picks</h3>
          <span className="text-gray-400 text-xs">
            {valueBets.length} {valueBets.length === 1 ? 'pick' : 'picks'} — Benter edge, one per race
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {valueBets.length === 0 ? (
        <div className="text-center py-8 px-4">
          <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No top picks today</p>
          <p className="text-gray-500 text-sm mt-1">No horses meet the Benter edge criteria (5%+ edge, 2+ models agree, Kelly-qualified)</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-700/50 max-h-[60vh] overflow-y-auto">
          {valueBets.map((vb, idx) => (
            <div
              key={`${vb.race_id}::${vb.horse_id}`}
              className="px-4 py-3 hover:bg-gray-700/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    idx === 0 ? 'bg-yellow-500 text-gray-900' :
                    idx === 1 ? 'bg-gray-400 text-gray-900' :
                    idx === 2 ? 'bg-amber-600 text-white' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <HorseNameWithSilk
                        horseName={vb.horse_name}
                        silkUrl={vb.silk_url}
                        className="text-white font-semibold text-sm"
                        clickable={true}
                        onHorseClick={() => openHorseDetail(vb.entry, {
                          course_name: vb.course_name,
                          off_time: vb.off_time,
                          race_id: vb.race_id,
                        }, {
                          patternAlerts: allPatternAlerts,
                          smartSignals: allSmartSignals,
                        })}
                        horseEntry={vb.entry}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Link
                        to={`/race/${vb.race_id}`}
                        className="text-[11px] text-gray-400 hover:text-yellow-400 transition-colors"
                      >
                        {formatTime(vb.off_time)} {vb.course_name}
                      </Link>
                      <span className="text-[11px] text-gray-500">
                        {vb.jockey_name}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className={`font-bold text-sm ${
                      vb.edge >= 0.15 ? 'text-green-400' :
                      vb.edge >= 0.08 ? 'text-emerald-400' :
                      'text-yellow-400'
                    }`}>
                      +{(vb.edge * 100).toFixed(1)}% edge
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Benter {(vb.ensembleProba * 100).toFixed(1)}% · Kelly £{vb.kellyStake.toFixed(2)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-white font-mono font-bold text-sm">
                      {formatOdds(vb.current_odds)}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Link
                      to={`/race/${vb.race_id}`}
                      className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/30 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors text-center"
                    >
                      Race
                    </Link>
                    <button
                      onClick={() => openHorseDetail(vb.entry, {
                        course_name: vb.course_name,
                        off_time: vb.off_time,
                        race_id: vb.race_id,
                      }, {
                        patternAlerts: allPatternAlerts,
                        smartSignals: allSmartSignals,
                      })}
                      className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                    >
                      Form
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
