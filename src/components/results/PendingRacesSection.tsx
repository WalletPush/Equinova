import React from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from '@/lib/dateUtils'
import type { ResultsRace } from './types'
import { Timer, Clock, MapPin, Users } from 'lucide-react'

interface Props {
  races: ResultsRace[]
}

export function PendingRacesSection({ races }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Timer className="w-5 h-5 text-gray-400" />
        <h2 className="text-base font-semibold text-gray-300">Awaiting Results</h2>
      </div>

      {races.map(race => (
        <Link key={race.race_id} to={`/race/${race.race_id}`} className="block">
          <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 opacity-60 hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-1">
                  <h3 className="text-base font-medium text-gray-300">{race.course_name}</h3>
                  <span className="bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded text-xs">{race.race_class}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTime(race.off_time)}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{race.distance}</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{race.field_size} runners</span>
                </div>
              </div>
              <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-1 rounded">Awaiting Result</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}
