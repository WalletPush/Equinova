import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatOdds } from '@/lib/odds'
import type { RaceEntry } from '@/lib/supabase'

// ─── Badge: clear visual indicator of market movement ─────────────

interface MarketMovementBadgeProps {
  movement: 'steaming' | 'drifting' | 'stable' | string | null | undefined
  pct: number | null | undefined
  size?: 'sm' | 'md'
}

export function MarketMovementBadge({ movement, pct, size = 'sm' }: MarketMovementBadgeProps) {
  if (!movement || movement === 'stable' || !pct) return null

  const absPct = Math.abs(pct)
  if (absPct < 3) return null

  const isSteaming = movement === 'steaming'
  const isHeavy = absPct >= 15
  const isMedium = absPct >= 8

  const bgColor = isSteaming
    ? isHeavy ? 'bg-green-500/20 border-green-400/50' : isMedium ? 'bg-green-500/15 border-green-500/30' : 'bg-green-500/10 border-green-500/20'
    : isHeavy ? 'bg-red-500/20 border-red-400/50' : isMedium ? 'bg-red-500/15 border-red-500/30' : 'bg-red-500/10 border-red-500/20'

  const textColor = isSteaming ? 'text-green-400' : 'text-red-400'
  const Icon = isSteaming ? TrendingUp : TrendingDown
  const label = isSteaming ? 'Backed' : 'Drifting'

  const sizeClasses = size === 'md'
    ? 'text-xs px-2 py-1 gap-1.5'
    : 'text-[10px] px-1.5 py-0.5 gap-1'

  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full border font-bold ${bgColor} ${textColor} ${isHeavy ? 'animate-pulse' : ''}`}>
      <Icon className={iconSize} />
      <span>{label} {absPct.toFixed(0)}%</span>
    </span>
  )
}

// ─── Intelligent market commentary per race ───────────────────────

interface MarketCommentInput {
  entries: RaceEntry[]
  modelPicksMap: Map<string, { label: string; color: string }[]>
}

export function buildMarketComment({ entries, modelPicksMap }: MarketCommentInput): string | null {
  if (!entries || entries.length === 0) return null

  const steamers = entries
    .filter(e => e.odds_movement === 'steaming' && Math.abs(e.odds_movement_pct || 0) >= 5)
    .sort((a, b) => Math.abs(b.odds_movement_pct || 0) - Math.abs(a.odds_movement_pct || 0))

  const drifters = entries
    .filter(e => e.odds_movement === 'drifting' && Math.abs(e.odds_movement_pct || 0) >= 5)
    .sort((a, b) => Math.abs(b.odds_movement_pct || 0) - Math.abs(a.odds_movement_pct || 0))

  if (steamers.length === 0 && drifters.length === 0) return null

  const topMlPick = findTopMlPick(entries, modelPicksMap)
  const parts: string[] = []

  if (topMlPick) {
    const topIsStreaming = steamers.some(s => s.horse_id === topMlPick.horse_id)
    const topIsDrifting = drifters.some(d => d.horse_id === topMlPick.horse_id)
    const topPct = Math.abs(topMlPick.odds_movement_pct || 0)

    if (topIsStreaming && topPct >= 5) {
      parts.push(`${topMlPick.horse_name} is the AI top pick and the market agrees — odds have shortened ${topPct.toFixed(0)}%`)
    } else if (topIsDrifting && topPct >= 5) {
      const bestSteamer = steamers.find(s => s.horse_id !== topMlPick.horse_id)
      if (bestSteamer) {
        const steamerPct = Math.abs(bestSteamer.odds_movement_pct || 0)
        parts.push(
          `The AI top pick ${topMlPick.horse_name} is drifting (${topPct.toFixed(0)}% out) while ${bestSteamer.horse_name} is being heavily backed (${steamerPct.toFixed(0)}% in)`,
        )
      } else {
        parts.push(`Caution: AI top pick ${topMlPick.horse_name} is drifting in the market (odds out ${topPct.toFixed(0)}%)`)
      }
    } else {
      // ML pick is stable — note other movement
      if (steamers.length > 0) {
        const steamer = steamers[0]
        const steamerPct = Math.abs(steamer.odds_movement_pct || 0)
        const steamerBadges = modelPicksMap.get(steamer.horse_id) || []
        if (steamerBadges.length > 0) {
          parts.push(`${steamer.horse_name} is being backed (${steamerPct.toFixed(0)}% in) and is also an AI pick`)
        } else {
          parts.push(`${steamer.horse_name} is attracting money (${steamerPct.toFixed(0)}% in) but isn't an AI pick — the market sees something our models don't`)
        }
      }
    }
  } else {
    // No clear ML pick — just report movement
    if (steamers.length > 0) {
      const s = steamers[0]
      parts.push(`${s.horse_name} is being heavily backed (odds in ${Math.abs(s.odds_movement_pct || 0).toFixed(0)}%)`)
    }
  }

  // Additional drifters worth noting (not the ML pick)
  const notableDrifters = drifters
    .filter(d => topMlPick ? d.horse_id !== topMlPick.horse_id : true)
    .slice(0, 1)

  if (notableDrifters.length > 0 && parts.length < 2) {
    const d = notableDrifters[0]
    const dBadges = modelPicksMap.get(d.horse_id) || []
    const dPct = Math.abs(d.odds_movement_pct || 0)
    if (dBadges.length > 0) {
      parts.push(`${d.horse_name} is drifting (${dPct.toFixed(0)}% out) despite being an AI pick`)
    }
  }

  if (parts.length === 0) return null
  return parts.join('. ') + '.'
}

function findTopMlPick(
  entries: RaceEntry[],
  modelPicksMap: Map<string, { label: string; color: string }[]>,
): RaceEntry | null {
  let best: RaceEntry | null = null
  let bestCount = 0

  for (const entry of entries) {
    const badges = modelPicksMap.get(entry.horse_id) || []
    if (badges.length > bestCount) {
      bestCount = badges.length
      best = entry
    }
  }

  return bestCount > 0 ? best : null
}

// ─── Race-level market summary for collapsed headers ──────────────

export function getRaceMarketSummary(entries: RaceEntry[]): {
  steamCount: number
  driftCount: number
  topSteamer: { name: string; pct: number } | null
  topDrifter: { name: string; pct: number } | null
} {
  const steamers = entries.filter(e => e.odds_movement === 'steaming' && Math.abs(e.odds_movement_pct || 0) >= 5)
  const drifters = entries.filter(e => e.odds_movement === 'drifting' && Math.abs(e.odds_movement_pct || 0) >= 5)

  const sortedSteamers = [...steamers].sort((a, b) => Math.abs(b.odds_movement_pct || 0) - Math.abs(a.odds_movement_pct || 0))
  const sortedDrifters = [...drifters].sort((a, b) => Math.abs(b.odds_movement_pct || 0) - Math.abs(a.odds_movement_pct || 0))

  return {
    steamCount: steamers.length,
    driftCount: drifters.length,
    topSteamer: sortedSteamers[0] ? { name: sortedSteamers[0].horse_name, pct: Math.abs(sortedSteamers[0].odds_movement_pct || 0) } : null,
    topDrifter: sortedDrifters[0] ? { name: sortedDrifters[0].horse_name, pct: Math.abs(sortedDrifters[0].odds_movement_pct || 0) } : null,
  }
}
