-- Create a function to automatically set race_id and horse_id
CREATE OR REPLACE FUNCTION set_shortlist_race_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if race_id is NULL
  IF NEW.race_id IS NULL THEN
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

-- Create trigger to run this function before insert/update
DROP TRIGGER IF EXISTS trigger_set_shortlist_race_ids ON shortlist;
CREATE TRIGGER trigger_set_shortlist_race_ids
  BEFORE INSERT OR UPDATE ON shortlist
  FOR EACH ROW
  EXECUTE FUNCTION set_shortlist_race_ids();
