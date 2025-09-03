-- Migration: add horse_id column to shortlist table

ALTER TABLE public.shortlist 
ADD COLUMN horse_id TEXT;

-- Add an index for better performance
CREATE INDEX IF NOT EXISTS idx_shortlist_horse_id ON public.shortlist(horse_id);

-- Add a comment to document the column
COMMENT ON COLUMN public.shortlist.horse_id IS 'References the horse_id from race_entries table for proper data consistency';

-- Update the trigger function to handle both race_id and horse_id properly
CREATE OR REPLACE FUNCTION set_shortlist_race_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if race_id or horse_id is NULL
  IF NEW.race_id IS NULL OR NEW.horse_id IS NULL THEN
    -- Look up race entry by horse_name
    SELECT race_id, horse_id 
    INTO NEW.race_id, NEW.horse_id
    FROM race_entries 
    WHERE horse_name = NEW.horse_name 
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
