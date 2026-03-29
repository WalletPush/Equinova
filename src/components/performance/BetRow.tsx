import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { formatOdds } from '@/lib/odds'
import { fmtPL, formatDateShort } from '@/lib/performanceUtils'
import type { UserBet } from './types'

interface BetRowProps {
  bet: UserBet
  showDate?: boolean
}

export function BetRow({ bet, showDate = false }: BetRowProps) {
  const odds = bet.current_odds
  const amount = Number(bet.bet_amount)
  const potentialReturn = Number(bet.potential_return)

  let pl = 0
  if (bet.status === 'won') pl = potentialReturn - amount
  else if (bet.status === 'lost') pl = -amount

  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg text-xs ${
      bet.status === 'won' ? 'bg-green-500/5 border border-green-500/15' :
      bet.status === 'pending' ? 'bg-yellow-500/5 border border-yellow-500/15' :
      'bg-gray-800/30 border border-gray-700/30'
    }`}>
      <div className="flex-shrink-0">
        {bet.status === 'won' && <CheckCircle className="w-4 h-4 text-green-400" />}
        {bet.status === 'lost' && <XCircle className="w-4 h-4 text-gray-600" />}
        {bet.status === 'pending' && <Clock className="w-4 h-4 text-yellow-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold truncate ${
            bet.status === 'won' ? 'text-green-300' : bet.status === 'pending' ? 'text-white' : 'text-gray-300'
          }`}>
            {bet.horse_name}
          </span>
          {bet.trust_tier && (
            <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase leading-none flex-shrink-0 ${
              bet.trust_tier === 'Strong' ? 'bg-green-500/20 text-green-400' :
              bet.trust_tier === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {bet.trust_tier}
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
          {showDate && <span>{formatDateShort(bet.race_date || bet.created_at?.split('T')[0])}</span>}
          {showDate && <span className="text-gray-700">&middot;</span>}
          <span>{bet.off_time?.substring(0, 5)}</span>
          <span className="text-gray-700">&middot;</span>
          <span>{bet.course}</span>
          {bet.edge_pct != null && (
            <>
              <span className="text-gray-700">&middot;</span>
              <span className="text-cyan-400">{(Number(bet.edge_pct) * 100).toFixed(0)}% edge</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0 w-12">
        <div className="text-gray-300 font-mono text-[11px]">{formatOdds(odds)}</div>
      </div>

      <div className="text-right flex-shrink-0 w-14">
        <div className="text-gray-300 text-[11px]">£{amount.toFixed(2)}</div>
        <div className="text-[8px] text-gray-600">stake</div>
      </div>

      <div className="text-right flex-shrink-0 w-16">
        {bet.status === 'pending' ? (
          <div className="text-yellow-400 font-semibold text-[11px]">Pending</div>
        ) : (
          <div className={`font-bold text-[11px] ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtPL(pl)}
          </div>
        )}
      </div>
    </div>
  )
}
