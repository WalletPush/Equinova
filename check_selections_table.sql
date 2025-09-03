-- Check and Fix Selections Table Structure
-- Run this in your Supabase SQL Editor to verify the selections table

-- Step 1: Check current selections table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'selections' 
ORDER BY ordinal_position;

-- Step 2: Check if race_entry_id column exists and what it's for
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'selections' 
AND column_name = 'race_entry_id';

-- Step 3: Show recent selections to see what data is actually being stored
SELECT 
    id,
    user_id,
    horse_name,
    horse_id,
    race_id,
    course_name,
    race_time,
    created_at
FROM selections 
ORDER BY created_at DESC 
LIMIT 5;

-- Step 4: If race_entry_id is causing issues, we can remove it
-- Uncomment the line below if you want to remove the race_entry_id column
-- ALTER TABLE selections DROP COLUMN IF EXISTS race_entry_id;

