import React, { useState, useRef, useEffect } from 'react'

export interface ModelDef {
  key: string
  field: string
  label: string
  color: string
  name: string
  description: string
  strengths: string[]
}

export const MODEL_DEFS: ModelDef[] = [
  {
    key: 'mlp',
    field: 'mlp_proba',
    label: 'MLP',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    name: 'Neural Network',
    description: 'A brain-inspired model that spots hidden patterns across hundreds of race factors at once.',
    strengths: [
      'Finds complex links between form, going, draw & class',
      'Best at spotting horses whose overall profile screams winner',
      'Learns non-obvious patterns humans would miss',
    ],
  },
  {
    key: 'rf',
    field: 'rf_proba',
    label: 'RF',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    name: 'Random Forest',
    description: 'Builds hundreds of decision trees that each independently assess the race, then takes a majority vote.',
    strengths: [
      'Very reliable — rarely swayed by one bad data point',
      'Great at weighing up recent form vs long-term ability',
      'Handles messy data well (missing runs, course switches)',
    ],
  },
  {
    key: 'xgboost',
    field: 'xgboost_proba',
    label: 'XGB',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    name: 'XGBoost',
    description: 'A precision model that learns round by round, fixing its own mistakes with each pass through the data.',
    strengths: [
      'Extremely sharp at separating contenders from no-hopers',
      'Excels in competitive handicaps with tight margins',
      'Often the most accurate single model on race day',
    ],
  },
  {
    key: 'benter',
    field: 'benter_proba',
    label: 'LGBM',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    name: 'LightGBM',
    description: 'A fast, efficient model that processes huge amounts of race data to find value others overlook.',
    strengths: [
      'Lightning fast — processes more features than other models',
      'Strong at identifying speed figure standouts',
      'Good at finding value in large, open fields',
    ],
  },
  {
    key: 'ensemble',
    field: 'ensemble_proba',
    label: 'ENS',
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    name: 'Ensemble (All Models)',
    description: 'Combines the predictions of all four models above into one consensus pick — strength in numbers.',
    strengths: [
      'Most consistent performer across all race types',
      'Smooths out individual model weaknesses',
      'When all models agree, confidence is highest',
    ],
  },
]

interface ModelBadgeProps {
  label: string
  color: string
  showCheck?: boolean
}

export function ModelBadge({ label, color, showCheck }: ModelBadgeProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const model = MODEL_DEFS.find(m => m.label === label)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open])

  // Reposition tooltip if it overflows viewport
  useEffect(() => {
    if (!open || !tooltipRef.current) return
    const rect = tooltipRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth - 8) {
      tooltipRef.current.style.left = 'auto'
      tooltipRef.current.style.right = '0'
    }
    if (rect.left < 8) {
      tooltipRef.current.style.left = '0'
      tooltipRef.current.style.right = 'auto'
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className={`text-[9px] px-1.5 py-0.5 rounded border font-bold cursor-help select-none ${color}`}
      >
        {label}{showCheck ? ' ✓' : ''}
      </span>

      {open && model && (
        <div
          ref={tooltipRef}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 border border-gray-600 rounded-xl shadow-2xl p-3.5 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 border-r border-b border-gray-600 rotate-45" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${color}`}>
                {label}
              </span>
              <span className="text-sm font-bold text-white">{model.name}</span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-2">
              {model.description}
            </p>

            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Strengths</span>
              {model.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400 leading-snug">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">+</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
