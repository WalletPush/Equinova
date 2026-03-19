import React, { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { callSupabaseFunction } from '@/lib/supabase'
import {
  X, ChevronUp, ChevronDown, PoundSterling, Loader2,
  Layers, Zap, Trophy, AlertCircle,
} from 'lucide-react'
import { formatOdds } from '@/lib/odds'
import type { Selection, ExoticBetPackage } from '@/lib/exoticKelly'
import { buildDouble, buildPatent, buildLucky15 } from '@/lib/exoticKelly'

interface BetSlipProps {
  selections: Selection[]
  bankroll: number
  onRemove: (horseId: string) => void
  onClear: () => void
}

const BET_TYPE_INFO: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
  double:  { label: 'Double',   desc: '1 bet — both must win',                                     icon: Layers },
  patent:  { label: 'Patent',   desc: '7 bets — 3 singles + 3 doubles + 1 treble',                 icon: Zap },
  lucky15: { label: 'Lucky 15', desc: '15 bets — 4 singles + 6 doubles + 4 trebles + 1 fourfold',  icon: Trophy },
}

export function BetSlip({ selections, bankroll, onRemove, onClear }: BetSlipProps) {
  const [expanded, setExpanded] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [placed, setPlaced] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const packages = useMemo<ExoticBetPackage[]>(() => {
    const pkgs: ExoticBetPackage[] = []
    if (selections.length === 2) {
      const d = buildDouble(selections, bankroll)
      if (d) pkgs.push(d)
    }
    if (selections.length === 3) {
      const p = buildPatent(selections, bankroll)
      if (p) pkgs.push(p)
    }
    if (selections.length === 4) {
      const l = buildLucky15(selections, bankroll)
      if (l) pkgs.push(l)
    }
    return pkgs
  }, [selections, bankroll])

  const placeMutation = useMutation({
    mutationFn: async (pkg: ExoticBetPackage) => {
      const payload = {
        bet_type: pkg.type,
        selections: pkg.components[0]?.legs?.length
          ? selections.map(s => ({
              horse_id: s.horse_id,
              race_id: s.race_id,
              horse_name: s.horse_name,
              course: s.course,
              off_time: s.off_time,
              jockey_name: s.jockey,
              trainer_name: s.trainer,
              odds: s.odds,
            }))
          : [],
        unit_stake: pkg.unitStake,
      }
      return await callSupabaseFunction('place-exotic-bet', payload)
    },
    onSuccess: (_data, pkg) => {
      setPlaced(pkg.type)
      setPlacing(false)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['user-bankroll'] })
      queryClient.invalidateQueries({ queryKey: ['user-bets-summary'] })
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to place exotic bet')
      setPlacing(false)
    },
  })

  const handlePlace = (pkg: ExoticBetPackage) => {
    setPlacing(true)
    setError(null)
    placeMutation.mutate(pkg)
  }

  if (selections.length < 2) return null

  const content = (
    <div className="fixed bottom-16 left-0 right-0 z-50 px-3 pb-2">
      <div className="max-w-lg mx-auto bg-gray-900/95 backdrop-blur-md border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-500/10 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-b border-purple-500/20"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">
              Bet Slip
            </span>
            <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full font-medium">
              {selections.length} picks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onClear() }}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Selected horses */}
            <div className="space-y-1.5">
              {selections.map(s => (
                <div key={s.horse_id} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium truncate block">{s.horse_name}</span>
                    <span className="text-[10px] text-gray-500">{s.course} · {s.off_time?.substring(0, 5)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-bold text-yellow-400">{formatOdds(String(s.odds))}</span>
                    <button
                      onClick={() => onRemove(s.horse_id)}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Exotic bet options */}
            {packages.length > 0 && (
              <div className="space-y-2 pt-1">
                {packages.map(pkg => {
                  const info = BET_TYPE_INFO[pkg.type]
                  const Icon = info.icon
                  const isPlaced = placed === pkg.type

                  return (
                    <div
                      key={pkg.type}
                      className={`border rounded-xl p-3 ${
                        isPlaced
                          ? 'border-green-500/30 bg-green-500/10'
                          : 'border-gray-700 bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${isPlaced ? 'text-green-400' : 'text-purple-400'}`} />
                          <span className="text-sm font-semibold text-white">{info.label}</span>
                        </div>
                        <span className="text-[10px] text-gray-500">{info.desc}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center mb-3">
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Unit Stake</div>
                          <div className="text-sm font-bold text-yellow-400">£{pkg.unitStake.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Total Outlay</div>
                          <div className="text-sm font-bold text-white">£{pkg.totalOutlay.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase">Max Return</div>
                          <div className="text-sm font-bold text-green-400">£{pkg.maxReturn.toFixed(2)}</div>
                        </div>
                      </div>

                      {isPlaced ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-semibold">
                          <Trophy className="w-4 h-4" />
                          Bet Placed
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePlace(pkg)}
                          disabled={placing}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          {placing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <PoundSterling className="w-4 h-4" />
                          )}
                          Place {info.label} — £{pkg.totalOutlay.toFixed(2)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {packages.length === 0 && (
              <div className="text-center py-2">
                <p className="text-xs text-gray-500">
                  {selections.length === 2
                    ? 'No qualifying double — edge too small for Kelly sizing'
                    : selections.length === 3
                    ? 'No qualifying patent — edge too small for Kelly sizing'
                    : selections.length > 4
                    ? 'Select exactly 2 (double), 3 (patent), or 4 (lucky 15) picks'
                    : 'No qualifying bets at current bankroll'}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
