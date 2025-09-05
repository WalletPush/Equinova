-- Debug query to see what races we have today
-- Run this in Supabase SQL Editor

-- First, let's see ALL races for today
SELECT 
  race_id,
  course_name,
  off_time,
  race_name,
  class,
  dist,
  going
FROM races 
WHERE date = CURRENT_DATE
ORDER BY off_time;

-- Now let's see if there are any Ascot races today
SELECT 
  race_id,
  course_name,
  off_time,
  race_name,
  class,
  dist,
  going
FROM races 
WHERE date = CURRENT_DATE
  AND course_name ILIKE '%ascot%'
ORDER BY off_time;

-- Let's also check what time format off_time uses
SELECT 
  course_name,
  off_time,
  EXTRACT(HOUR FROM off_time) as hour,
  EXTRACT(MINUTE FROM off_time) as minute
FROM races 
WHERE date = CURRENT_DATE
ORDER BY off_time
LIMIT 10;
