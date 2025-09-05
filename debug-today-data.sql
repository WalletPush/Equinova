-- Simple query to check what data we have for today
-- Run this first to see if we have any races and entries

-- 1. Check races for today
SELECT 
  COUNT(*) as total_races,
  MIN(off_time) as earliest_race,
  MAX(off_time) as latest_race
FROM races 
WHERE date = CURRENT_DATE;

-- 2. Check race entries for today's races
SELECT 
  COUNT(*) as total_entries,
  COUNT(DISTINCT re.race_id) as races_with_entries,
  COUNT(CASE WHEN re.mlp_proba IS NOT NULL THEN 1 END) as mlp_count,
  COUNT(CASE WHEN re.rf_proba IS NOT NULL THEN 1 END) as rf_count,
  COUNT(CASE WHEN re.xgboost_proba IS NOT NULL THEN 1 END) as xgboost_count,
  COUNT(CASE WHEN re.benter_proba IS NOT NULL THEN 1 END) as benter_count,
  COUNT(CASE WHEN re.ensemble_proba IS NOT NULL THEN 1 END) as ensemble_count,
  COUNT(CASE WHEN re.predicted_winner = 1 THEN 1 END) as predicted_winners
FROM race_entries re
JOIN races r ON re.race_id = r.race_id
WHERE r.date = CURRENT_DATE;

-- 3. Sample of today's data
SELECT 
  r.course_name,
  r.off_time,
  re.horse_name,
  re.mlp_proba,
  re.rf_proba,
  re.xgboost_proba,
  re.benter_proba,
  re.ensemble_proba,
  re.predicted_winner
FROM race_entries re
JOIN races r ON re.race_id = r.race_id
WHERE r.date = CURRENT_DATE
ORDER BY r.off_time, re.horse_name
LIMIT 10;
