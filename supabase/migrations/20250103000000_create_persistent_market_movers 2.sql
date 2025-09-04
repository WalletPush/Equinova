-- Create persistent market movers tracking table
CREATE TABLE IF NOT EXISTS public.persistent_market_movers (
    id SERIAL PRIMARY KEY,
    horse_id TEXT NOT NULL,
    race_id TEXT NOT NULL,
    horse_name TEXT NOT NULL,
    course_name TEXT NOT NULL,
    off_time TEXT NOT NULL,
    jockey_name TEXT,
    trainer_name TEXT,
    bookmaker TEXT DEFAULT 'Ladbrokes',
    initial_odds TEXT NOT NULL,
    current_odds TEXT NOT NULL,
    odds_movement TEXT NOT NULL, -- 'steaming' or 'drifting'
    odds_movement_pct NUMERIC(5,2) NOT NULL,
    first_detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique horse per race
    UNIQUE(horse_id, race_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_persistent_market_movers_active ON public.persistent_market_movers(is_active);
CREATE INDEX IF NOT EXISTS idx_persistent_market_movers_race_time ON public.persistent_market_movers(off_time);
CREATE INDEX IF NOT EXISTS idx_persistent_market_movers_movement ON public.persistent_market_movers(odds_movement_pct);

-- Add RLS policies
ALTER TABLE public.persistent_market_movers ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Allow authenticated users to read persistent market movers" ON public.persistent_market_movers
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update/delete
CREATE POLICY "Allow service role full access to persistent market movers" ON public.persistent_market_movers
    FOR ALL USING (auth.role() = 'service_role');

-- Add comments
COMMENT ON TABLE public.persistent_market_movers IS 'Persistent tracking of horses with 20%+ inward market movement';
COMMENT ON COLUMN public.persistent_market_movers.odds_movement IS 'steaming = odds shortened (more likely), drifting = odds lengthened (less likely)';
COMMENT ON COLUMN public.persistent_market_movers.odds_movement_pct IS 'Percentage change in odds (positive = steaming, negative = drifting)';
COMMENT ON COLUMN public.persistent_market_movers.is_active IS 'TRUE if horse still meets 20%+ criteria, FALSE if dropped below threshold';
