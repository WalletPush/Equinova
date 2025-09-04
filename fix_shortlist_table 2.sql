-- Fix Shortlist Table Structure
-- Run this in your Supabase SQL Editor to add the missing horse_id column

-- Step 1: Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_set_shortlist_race_ids ON shortlist;
DROP FUNCTION IF EXISTS set_shortlist_race_ids();

-- Step 2: Add horse_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'shortlist' AND column_name = 'horse_id') THEN
        ALTER TABLE public.shortlist ADD COLUMN horse_id TEXT;
    END IF;
END $$;

-- Step 3: Add index for horse_id
CREATE INDEX IF NOT EXISTS idx_shortlist_horse_id ON public.shortlist(horse_id);

-- Step 4: Add comment for horse_id column
COMMENT ON COLUMN public.shortlist.horse_id IS 'References the horse_id from race_entries table for proper data consistency';

-- Step 5: Recreate the trigger function to handle both race_id and horse_id properly
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

-- Step 6: Recreate the trigger
CREATE TRIGGER trigger_set_shortlist_race_ids
  BEFORE INSERT OR UPDATE ON shortlist
  FOR EACH ROW
  EXECUTE FUNCTION set_shortlist_race_ids();

-- Step 7: Verify the fix
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'shortlist' 
AND column_name IN ('horse_id', 'race_id')
ORDER BY column_name;


