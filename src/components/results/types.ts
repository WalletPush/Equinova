import type { Race } from '@/lib/supabase'

export interface RaceRunner {
  id: number
  race_id: string
  position: number | null
  horse: string
  number: number
  sp: string
  btn: number | null
  ovr_btn: number | null
  time: string | null
  comment: string | null
}

export interface ResultsRace extends Race {
  runners?: RaceRunner[]
}
