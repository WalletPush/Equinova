-- Create race results tables
-- This script creates tables to store race results and update betting history

-- 1. Create race_results table
CREATE TABLE IF NOT EXISTS public.race_results (
  id SERIAL PRIMARY KEY,
  race_id TEXT NOT NULL UNIQUE,
  date DATE NOT NULL,
  region TEXT,
  course TEXT NOT NULL,
  course_id TEXT,
  off TEXT,
  off_dt TIMESTAMP WITH TIME ZONE,
  race_name TEXT,
  type TEXT,
  class TEXT,
  pattern TEXT,
  rating_band TEXT,
  age_band TEXT,
  sex_rest TEXT,
  dist TEXT,
  dist_y INTEGER,
  dist_m INTEGER,
  dist_f INTEGER,
  going TEXT,
  surface TEXT,
  jumps TEXT,
  winning_time_detail TEXT,
  comments TEXT,
  non_runners TEXT,
  tote_win TEXT,
  tote_pl TEXT,
  tote_ex TEXT,
  tote_csf TEXT,
  tote_tricast TEXT,
  tote_trifecta TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create race_runners table for individual horse results
CREATE TABLE IF NOT EXISTS public.race_runners (
  id SERIAL PRIMARY KEY,
  race_result_id INTEGER REFERENCES public.race_results(id) ON DELETE CASCADE,
  horse_id TEXT NOT NULL,
  horse TEXT NOT NULL,
  sp TEXT,
  sp_dec DECIMAL(10,2),
  number INTEGER,
  position INTEGER,
  draw INTEGER,
  btn DECIMAL(10,2),
  ovr_btn DECIMAL(10,2),
  age INTEGER,
  sex TEXT,
  weight TEXT,
  weight_lbs INTEGER,
  headgear TEXT,
  time TEXT,
                      or_rating INTEGER,
  rpr INTEGER,
  tsr INTEGER,
  prize DECIMAL(10,2),
  jockey TEXT,
  jockey_claim_lbs INTEGER DEFAULT 0,
  jockey_id TEXT,
  trainer TEXT,
  trainer_id TEXT,
  owner TEXT,
  owner_id TEXT,
  sire TEXT,
  sire_id TEXT,
  dam TEXT,
  dam_id TEXT,
  damsire TEXT,
  damsire_id TEXT,
  comment TEXT,
  silk_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_race_results_race_id ON public.race_results(race_id);
CREATE INDEX IF NOT EXISTS idx_race_results_date ON public.race_results(date);
CREATE INDEX IF NOT EXISTS idx_race_results_course ON public.race_results(course);
CREATE INDEX IF NOT EXISTS idx_race_runners_race_result_id ON public.race_runners(race_result_id);
CREATE INDEX IF NOT EXISTS idx_race_runners_horse_id ON public.race_runners(horse_id);
CREATE INDEX IF NOT EXISTS idx_race_runners_position ON public.race_runners(position);

-- 4. Add RLS policies
ALTER TABLE public.race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_runners ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read race results
CREATE POLICY "Allow authenticated users to read race results" ON public.race_results
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read race runners" ON public.race_runners
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update race results
CREATE POLICY "Allow service role to manage race results" ON public.race_results
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role to manage race runners" ON public.race_runners
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Add comments for documentation
COMMENT ON TABLE public.race_results IS 'Stores race results from the racing API';
COMMENT ON TABLE public.race_runners IS 'Stores individual horse results for each race';
COMMENT ON COLUMN public.race_results.race_id IS 'Unique race identifier from the API';
COMMENT ON COLUMN public.race_runners.position IS 'Finishing position (1 = winner, 2 = second, etc.)';

-- 6. Create function to update bet status based on results
CREATE OR REPLACE FUNCTION update_bet_results(race_id_param TEXT)
RETURNS VOID AS $$
DECLARE
  bet_record RECORD;
  winner_horse TEXT;
BEGIN
  -- Get the winning horse for this race
  SELECT horse INTO winner_horse
  FROM public.race_runners rr
  JOIN public.race_results r ON rr.race_result_id = r.id
  WHERE r.race_id = race_id_param AND rr.position = 1;
  
  -- Update all bets for this race
  FOR bet_record IN 
    SELECT id, horse_name, bet_amount, potential_return
    FROM public.bets 
    WHERE race_id = race_id_param AND status = 'pending'
  LOOP
    -- Update bet status based on whether the horse won
    UPDATE public.bets 
    SET 
      status = CASE 
        WHEN bet_record.horse_name = winner_horse THEN 'won'
        ELSE 'lost'
      END,
      updated_at = NOW()
    WHERE id = bet_record.id;
    
    -- If bet won, add winnings to bankroll
    IF bet_record.horse_name = winner_horse THEN
      UPDATE public.user_bankroll 
      SET 
        current_amount = current_amount + bet_record.potential_return,
        updated_at = NOW()
      WHERE user_id = (
        SELECT user_id FROM public.bets WHERE id = bet_record.id
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Verify tables created
SELECT 
  table_name,
  'CREATED' as status
FROM information_schema.tables 
WHERE table_name IN ('race_results', 'race_runners')
AND table_schema = 'public'
ORDER BY table_name;
