import { PlaceBetButton } from '@/components/PlaceBetButton'
import { formatOdds } from '@/lib/odds'
import {
  CheckCircle,
  Flame,
} from 'lucide-react'
import type { SmartMoneyAlert } from './types'

export function SmartMoneyCard({ alert, bet, needsSetup }: {
  alert: SmartMoneyAlert
  bet?: any
  needsSetup: boolean
}) {
  const hasBet = !!bet

  return (
    <div className="relative bg-gray-900/90 backdrop-blur-sm border-2 border-amber-500/40 rounded-2xl overflow-hidden animate-[pulse_3s_ease-in-out_infinite]"
      style={{ boxShadow: '0 0 20px rgba(245,158,11,0.15), inset 0 1px 0 rgba(245,158,11,0.1)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

      <div className="px-4 py-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Smart Money Confirmed
            </span>
          </div>
          <span className="text-[10px] text-amber-400/70">
            {new Date(alert.triggered_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="p-4 relative">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <span className="font-medium text-gray-300">{alert.course}</span>
          <span>·</span>
          <span>{alert.off_time?.substring(0, 5)}</span>
        </div>

        <h3 className="text-lg font-bold text-white mb-3">{alert.horse_name}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-800/80 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Live Edge</div>
            <div className="text-sm font-bold text-green-400">+{(alert.live_edge * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-gray-800/80 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Backed</div>
            <div className="text-sm font-bold text-amber-400">{alert.pct_backed.toFixed(0)}%</div>
          </div>
          <div className="bg-gray-800/80 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Odds</div>
            <div className="text-sm font-bold text-white">
              <span className="text-gray-500 line-through text-[10px] mr-1">{formatOdds(String(alert.opening_odds))}</span>
              {formatOdds(String(alert.current_odds))}
            </div>
          </div>
          <div className="bg-gray-800/80 rounded-lg p-2.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Kelly Stake</div>
            <div className="text-sm font-bold text-yellow-400">£{alert.kelly_stake.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-3">
          <span>Morning: {(alert.morning_ensemble * 100).toFixed(1)}%</span>
          <span>→</span>
          <span className="text-green-400">Live: {(alert.live_ensemble * 100).toFixed(1)}%</span>
        </div>

        {hasBet ? (
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30 w-full justify-center">
            <CheckCircle className="w-4 h-4" />
            Bet Placed
          </span>
        ) : !needsSetup ? (
          <PlaceBetButton
            horseName={alert.horse_name}
            horseId={alert.horse_id}
            raceId={alert.race_id}
            raceContext={{ race_id: alert.race_id, course_name: alert.course, off_time: alert.off_time }}
            odds={alert.current_odds}
            size="normal"
            kellyStake={alert.kelly_stake}
            edgePct={alert.live_edge > 0 ? alert.live_edge : null}
            ensembleProba={alert.live_ensemble}
          />
        ) : null}
      </div>
    </div>
  )
}
