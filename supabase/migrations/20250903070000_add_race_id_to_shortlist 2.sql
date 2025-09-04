-- Migration: add race_id column to shortlist table

ALTER TABLE public.shortlist 
ADD COLUMN race_id TEXT;

-- Add an index for better performance
CREATE INDEX IF NOT EXISTS idx_shortlist_race_id ON public.shortlist(race_id);

-- Add a comment to document the column
COMMENT ON COLUMN public.shortlist.race_id IS 'References the race_id from race_entries table for proper data consistency';
