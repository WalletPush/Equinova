-- Migration: Fix shortlist table structure with proper horse_id and race_id columns

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS trigger_set_shortlist_race_ids ON shortlist;

-- Drop the existing function
DROP FUNCTION IF EXISTS set_shortlist_race_ids();

-- Add horse_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shortlist' AND column_name = 'horse_id') THEN
        ALTER TABLE public.shortlist ADD COLUMN horse_id TEXT;
    END IF;
END $$;

-- Add index for horse_id
CREATE INDEX IF NOT EXISTS idx_shortlist_horse_id ON public.shortlist(horse_id);

-- Add comment for horse_id column
COMMENT ON COLUMN public.shortlist.horse_id IS 'References the horse_id from race_entries table for proper data consistency';

-- Recreate the trigger function to handle both race_id and horse_id properly
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

-- Recreate the trigger
CREATE TRIGGER trigger_set_shortlist_race_ids
  BEFORE INSERT OR UPDATE ON shortlist
  FOR EACH ROW
  EXECUTE FUNCTION set_shortlist_race_ids();



