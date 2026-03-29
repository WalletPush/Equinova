import React from 'react'
import { Link } from 'react-router-dom'
import { Zap, Clock, CheckCircle, XCircle } from 'lucide-react'
import { formatOdds } from '@/lib/odds'

interface TodayBetsPanelProps {
  bets: any[]
}

export function TodayBetsPanel({ bets }: TodayBetsPanelProps) {
  if (bets.length === 0) return null

  return (
    <div className="bg-gray-800/60 border border-yellow-500/20 rounded-xl">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold text-yellow-400">My Bets Today</span>
          <span className="text-[10px] text-gray-500">{bets.length} {bets.length === 1 ? 'bet' : 'bets'}</span>
        </div>
        <Link to="/performance" className="text-[10px] text-gray-500 hover:text-yellow-400 transition-colors">
          Full History →
        </Link>
      </div>
      <div className="divide-y divide-gray-700/30">
        {bets.map((bet: any) => {
          const won = bet.status === 'won'
          const lost = bet.status === 'lost'
          const pending = bet.status === 'pending'
          const pl = won ? Number(bet.potential_return) : lost ? -Number(bet.bet_amount) : 0
          return (
            <div key={bet.id} className="px-4 py-2 flex items-center gap-3 text-xs">
              <div className="flex-shrink-0">
                {pending
                  ? <Clock className="w-3.5 h-3.5 text-yellow-400" />
                  : won
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <XCircle className="w-3.5 h-3.5 text-gray-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`font-medium truncate block ${won ? 'text-green-300' : pending ? 'text-white' : 'text-gray-400'}`}>
                  {bet.horse_name}
                </span>
              </div>
              <span className="text-gray-400 font-mono">{formatOdds(String(bet.odds))}</span>
              <span className="text-gray-400">£{Number(bet.bet_amount).toFixed(2)}</span>
              <span className={`font-bold w-14 text-right ${
                pending ? 'text-yellow-400' : pl >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {pending ? 'pending' : `${pl >= 0 ? '+' : '-'}£${Math.abs(pl).toFixed(2)}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
