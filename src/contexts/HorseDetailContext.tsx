import React, { createContext, useContext, useState } from 'react'
import { RaceEntry } from '@/lib/supabase'
import { HorseDetailModal } from '@/components/HorseDetailModal'

interface RaceContext {
  course_name?: string
  off_time?: string
  race_id?: string
}

interface HorseDetailContextType {
  selectedHorse: RaceEntry | null
  raceContext: RaceContext | null
  isModalOpen: boolean
  openHorseDetail: (entry: RaceEntry, raceContext?: RaceContext) => void
  closeHorseDetail: () => void
}

const HorseDetailContext = createContext<HorseDetailContextType | undefined>(undefined)

export function HorseDetailProvider({ children }: { children: React.ReactNode }) {
  const [selectedHorse, setSelectedHorse] = useState<RaceEntry | null>(null)
  const [raceContext, setRaceContext] = useState<RaceContext | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const openHorseDetail = (entry: RaceEntry, raceCtx?: RaceContext) => {
    setSelectedHorse(entry)
    setRaceContext(raceCtx || null)
    setIsModalOpen(true)
  }

  const closeHorseDetail = () => {
    setIsModalOpen(false)
    // Keep selectedHorse for a moment to allow smooth closing animation
    setTimeout(() => {
      setSelectedHorse(null)
      setRaceContext(null)
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
