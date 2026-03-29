export function EdgeGauge({ edge, impliedProb, benterProba }: { edge: number; impliedProb: number; benterProba: number }) {
  const edgePct = (edge * 100).toFixed(1)
  const radius = 40
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const normScore = Math.min(edge / 0.30, 1) * 100
  const progress = (normScore / 100) * circumference
  const color = edge >= 0.15 ? '#22c55e' : edge >= 0.08 ? '#eab308' : '#f97316'

  return (
    <div className="relative flex items-center justify-center flex-shrink-0">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${progress} ${circumference - progress}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white">+{edgePct}%</span>
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Edge</span>
      </div>
    </div>
  )
}
