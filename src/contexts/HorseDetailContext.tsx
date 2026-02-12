import React, { createContext, useContext, useState } from 'react'
import { RaceEntry } from '@/lib/supabase'
import { HorseDetailModal } from '@/components/HorseDetailModal'
import type { SmartSignal, PatternAlert } from '@/types/signals'

interface RaceContext {
  course_name?: string
  off_time?: string
  race_id?: string
}

interface SignalData {
  patternAlerts?: PatternAlert[]
  smartSignals?: SmartSignal[]
}

interface HorseDetailContextType {
  selectedHorse: RaceEntry | null
  raceContext: RaceContext | null
  isModalOpen: boolean
  openHorseDetail: (entry: RaceEntry, raceContext?: RaceContext, signals?: SignalData) => void
  closeHorseDetail: () => void
}

const HorseDetailContext = createContext<HorseDetailContextType | undefined>(undefined)

export function HorseDetailProvider({ children }: { children: React.ReactNode }) {
  const [selectedHorse, setSelectedHorse] = useState<RaceEntry | null>(null)
  const [raceContext, setRaceContext] = useState<RaceContext | null>(null)
  const [signalData, setSignalData] = useState<SignalData>({})
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openHorseDetail = (entry: RaceEntry, raceCtx?: RaceContext, signals?: SignalData) => {
    setSelectedHorse(entry)
    setRaceContext(raceCtx || null)
    setSignalData(signals || {})
    setIsModalOpen(true)
  }

  const closeHorseDetail = () => {
    setIsModalOpen(false)
    // Keep selectedHorse for a moment to allow smooth closing animation
    setTimeout(() => {
      setSelectedHorse(null)
      setRaceContext(null)
      setSignalData({})
    }, 300)
  }

  return (
    <HorseDetailContext.Provider value={{
      selectedHorse,
      raceContext,
      isModalOpen,
      openHorseDetail,
      closeHorseDetail
    }}>
      {children}
      {selectedHorse && (
        <HorseDetailModal
          entry={selectedHorse}
          raceContext={raceContext}
          patternAlerts={signalData.patternAlerts}
          smartSignals={signalData.smartSignals}
          isOpen={isModalOpen}
          onClose={closeHorseDetail}
        />
      )}
    </HorseDetailContext.Provider>
  )
}

export function useHorseDetail() {
  const context = useContext(HorseDetailContext)
  if (context === undefined) {
    throw new Error('useHorseDetail must be used within a HorseDetailProvider')
  }
  return context
}
