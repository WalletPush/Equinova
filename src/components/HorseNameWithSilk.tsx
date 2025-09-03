import React from 'react'
import { RaceEntry } from '@/lib/supabase'

interface HorseNameWithSilkProps {
  horseName: string
  silkUrl?: string
  className?: string
  showNumber?: boolean
  number?: number
  clickable?: boolean
  onHorseClick?: (entry?: RaceEntry) => void
  horseEntry?: RaceEntry
}

export function HorseNameWithSilk({ 
  horseName, 
  silkUrl, 
  className = "text-white font-medium",
  showNumber = false,
  number,
  clickable = false,
  onHorseClick,
  horseEntry
}: HorseNameWithSilkProps) {
  const handleClick = () => {
    if (clickable && onHorseClick && horseEntry) {
      onHorseClick(horseEntry)
    }
  }

  const content = (
    <div className="flex items-center space-x-2">
      {silkUrl && (
        <img 
          src={silkUrl} 
          alt={`${horseName} silk`} 
          className="w-6 h-6 rounded-sm object-cover flex-shrink-0"
          onError={(e) => {
            // Hide the image if it fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      )}
      <span className={className}>
        {showNumber && number ? `#${number} ` : ''}{horseName}
      </span>
    </div>
  )

  if (clickable) {
    return (
      <button
        onClick={handleClick}
        className="group text-left hover:text-yellow-400 transition-colors cursor-pointer"
      >
        {content}
      </button>
    )
  }

  return content
}
