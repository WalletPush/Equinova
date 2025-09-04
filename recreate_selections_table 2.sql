-- Drop and Recreate Selections Table
-- Run this in your Supabase SQL Editor to completely rebuild the selections table

-- Step 1: Drop the existing selections table
DROP TABLE IF EXISTS selections CASCADE;

-- Step 2: Create a new, clean selections table
CREATE TABLE selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    horse_name TEXT NOT NULL,
    horse_id TEXT,
    race_id TEXT,
    race_time TEXT NOT NULL,
    course_name TEXT NOT NULL,
    jockey_name TEXT,
    trainer_name TEXT,
    current_odds TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Add indexes for better performance
CREATE INDEX idx_selections_user_id ON selections(user_id);
CREATE INDEX idx_selections_horse_name ON selections(horse_name);
CREATE INDEX idx_selections_course_name ON selections(course_name);
CREATE INDEX idx_selections_created_at ON selections(created_at);

-- Step 4: Add RLS (Row Level Security) policies
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own selections
CREATE POLICY "Users can view own selections" ON selections
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own selections
CREATE POLICY "Users can insert own selections" ON selections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own selections
CREATE POLICY "Users can update own selections" ON selections
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own selections
CREATE POLICY "Users can delete own selections" ON selections
    FOR DELETE USING (auth.uid() = user_id);

-- Step 5: Add comments for documentation
COMMENT ON TABLE selections IS 'User selections for horses they want to bet on';
COMMENT ON COLUMN selections.user_id IS 'Reference to the user who created this selection';
COMMENT ON COLUMN selections.horse_name IS 'Name of the horse';
COMMENT ON COLUMN selections.horse_id IS 'Reference to horse_id from race_entries table';
COMMENT ON COLUMN selections.race_id IS 'Reference to race_id from race_entries table';
COMMENT ON COLUMN selections.race_time IS 'Time of the race';
COMMENT ON COLUMN selections.course_name IS 'Name of the racecourse';
COMMENT ON COLUMN selections.current_odds IS 'Current odds for the horse';

-- Step 6: Verify the table was created correctly
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'selections' 
ORDER BY ordinal_position;


