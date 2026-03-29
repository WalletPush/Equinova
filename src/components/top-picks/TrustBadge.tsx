import {
  Brain,
  Shield,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

export function TrustBadge({ score, tier }: { score: number; tier: string }) {
  const config = {
    high:   { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400', icon: ShieldCheck, label: 'Strong' },
    medium: { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: Shield, label: 'Moderate' },
    low:    { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', icon: AlertTriangle, label: 'Weak' },
    none:   { bg: 'bg-gray-700/50', border: 'border-gray-600', text: 'text-gray-500', icon: Brain, label: 'No signals' },
  }[tier] ?? { bg: 'bg-gray-700/50', border: 'border-gray-600', text: 'text-gray-500', icon: Brain, label: 'No signals' }

  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${config.bg} ${config.text} border ${config.border}`}>
      <Icon className="w-3 h-3" />
      {config.label} {score > 0 ? `(${score})` : ''}
    </span>
  )
}
