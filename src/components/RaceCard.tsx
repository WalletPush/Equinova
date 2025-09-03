import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHorseDetail } from '@/contexts/HorseDetailContext'
import { HorseNameWithSilk } from '@/components/HorseNameWithSilk'
import { ShortlistButton } from '@/components/ShortlistButton'
import { Race } from '@/lib/supabase'
import { 
  Clock, 
  MapPin, 
  Trophy, 
  Users, 
  ChevronRight,
  ChevronDown,
  Bot,
  Star
} from 'lucide-react'

interface RaceCardProps {
  race: Race
  userShortlist?: any[]
  isExpanded?: boolean
  onToggleExpanded?: (raceId: string) => void
}

export function RaceCard({ 
  race, 
  userShortlist = [], 
  isExpanded = false, 
  onToggleExpanded 
}: RaceCardProps) {
  const { openHorseDetail } = useHorseDetail()
  
  const formatTime = (timeString: string) => {
    if (!timeString) return ''
    return timeString.substring(0, 5)
  }

  const formatPrize = (prize: string) => {
    if (!prize) return ''
    return prize.replace(/[£,]/g, '')
  }

  const getConfidenceStars = (proba: number) => {
    if (proba >= 0.8) return 5
    if (proba >= 0.6) return 4
    if (proba >= 0.4) return 3
    if (proba >= 0.2) return 2
    return 1
  }

  // Helper function to check if horse is in shortlist
  const isHorseInShortlist = (horseName: string, course: string): boolean => {
    if (!userShortlist || !Array.isArray(userShortlist)) return false
    return userShortlist.some(item => 
      item.horse_name === horseName && item.course === course
    )
  }

  // Get the best AI prediction (highest ensemble_proba > 0)
  const aiPredictions = race.topEntries?.filter(entry => entry.ensemble_proba > 0) || []
  const topPrediction = aiPredictions.length > 0 ? aiPredictions[0] : null
  const hasAI = topPrediction && topPrediction.ensemble_proba > 0

  // Create race context for child components
  const raceContext = {
    race_id: race.race_id,
    course_name: race.course_name,
    off_time: race.off_time,
    race_time: race.off_time // alias for compatibility
  }

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 hover:border-yellow-400/30 rounded-lg transition-all duration-200">
      {/* Compact Race Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => onToggleExpanded?.(race.race_id)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Line 1: Race name + class + off time */}
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-lg font-semibold text-white">
                {race.course_name}
              </h3>
              <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded text-xs font-medium">
                {race.race_class}
              </span>
              <div className="flex items-center space-x-1 text-yellow-400">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{formatTime(race.off_time)}</span>
              </div>
            </div>
            
            {/* Line 2: Distance, runners, prize, surface, View button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 text-sm text-gray-400">
                <div className="flex items-center space-x-1">
                  <MapPin className="w-4 h-4" />
                  <span>{race.distance}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{race.field_size}</span>
                </div>
                {race.prize && (
                  <div className="flex items-center space-x-1">
                    <Trophy className="w-4 h-4" />
                    <span className="text-green-400 font-medium">£{formatPrize(race.prize)}</span>
                  </div>
                )}
              </div>
              
              <Link
                to={`/race/${race.race_id}`}
                className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex-shrink-0 ml-3"
                onClick={(e) => e.stopPropagation()}
              >
                Analyse
              </Link>
            </div>
          </div>
          
          <div className="ml-3 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* AI Prediction */}
          {hasAI && topPrediction && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">AI Top Pick</span>
                </div>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star 
                      key={i}
                      className={`w-3 h-3 ${
                        i < getConfidenceStars(topPrediction.ensemble_proba) 
                          ? 'text-yellow-400 fill-current' 
                          : 'text-gray-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <HorseNameWithSilk 
                    horseName={topPrediction.horse_name}
                    silkUrl={topPrediction.silk_url}
                    className="text-white font-medium"
                    showNumber={true}
                    number={topPrediction.number}
                    clickable={true}
                    onHorseClick={(entry) => openHorseDetail(entry, raceContext)}
                    horseEntry={topPrediction}
                  />
                  <div className="text-sm text-gray-400 mt-1">
                    {topPrediction.jockey_name}
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-green-400 font-bold">
                      {(topPrediction.ensemble_proba * 100).toFixed(0)}% confident
                    </div>
                    <div className="text-yellow-400 font-medium text-sm">
                      {topPrediction.current_odds || 'TBC'}
                    </div>
                  </div>
                  
                  <ShortlistButton
                    horseName={topPrediction.horse_name}
                    raceContext={raceContext}
                    odds={topPrediction.current_odds}
                    jockeyName={topPrediction.jockey_name}
                    trainerName={topPrediction.trainer_name}
                    isInShortlist={isHorseInShortlist(topPrediction.horse_name, race.course_name)}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Show other entries if available */}
          {race.topEntries && race.topEntries.length > 1 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-400">Other Entries</h4>
              <div className="grid gap-2">
                {race.topEntries.slice(1, 5).map((entry) => (
                  <div key={entry.horse_name} className="bg-gray-700/30 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <HorseNameWithSilk 
                        horseName={entry.horse_name}
                        silkUrl={entry.silk_url}
                        className="text-white font-medium text-sm"
                        showNumber={true}
                        number={entry.number}
                        clickable={true}
                        onHorseClick={(entry) => openHorseDetail(entry, raceContext)}
                        horseEntry={entry}
                      />
                      <div className="text-xs text-gray-400 mt-1">
                        {entry.jockey_name}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-yellow-400 font-medium text-sm">
                          {entry.current_odds || 'TBC'}
                        </div>
                        {entry.ensemble_proba > 0 && (
                          <div className="text-green-400 text-xs">
                            {(entry.ensemble_proba * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                      
                      <ShortlistButton
                        horseName={entry.horse_name}
                        raceContext={raceContext}
                        odds={entry.current_odds}
                        jockeyName={entry.jockey_name}
                        trainerName={entry.trainer_name}
                        isInShortlist={isHorseInShortlist(entry.horse_name, race.course_name)}
                        size="small"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}