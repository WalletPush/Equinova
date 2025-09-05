-- Debug query to check Maneuver specifically
-- Run this in Supabase SQL Editor

-- First, let's see all horses in the 2:55 AM Ascot race
SELECT 
  r.course_name,
  r.off_time,
  re.horse_name,
  re.mlp_proba,
  re.rf_proba,
  re.xgboost_proba,
  re.benter_proba,
  re.ensemble_proba
FROM race_entries re
JOIN races r ON re.race_id = r.race_id
WHERE r.date = CURRENT_DATE
  AND r.course_name ILIKE '%ascot%'
  AND r.off_time = '02:55:00'
ORDER BY re.horse_name;

-- Now let's see the top horse for each model in this race
WITH race_data AS (
  SELECT 
    re.race_id,
    re.horse_name,
    re.mlp_proba,
    re.rf_proba,
    re.xgboost_proba,
    re.benter_proba,
    re.ensemble_proba
  FROM race_entries re
  JOIN races r ON re.race_id = r.race_id
  WHERE r.date = CURRENT_DATE
    AND r.course_name ILIKE '%ascot%'
    AND r.off_time = '02:55:00'
)
SELECT 
  'MLP Top' as model,
  horse_name,
  mlp_proba as probability
FROM race_data
WHERE mlp_proba = (SELECT MAX(mlp_proba) FROM race_data WHERE mlp_proba IS NOT NULL)

UNION ALL

SELECT 
  'RF Top' as model,
  horse_name,
  rf_proba as probability
FROM race_data
WHERE rf_proba = (SELECT MAX(rf_proba) FROM race_data WHERE rf_proba IS NOT NULL)

UNION ALL

SELECT 
  'XGBoost Top' as model,
  horse_name,
  xgboost_proba as probability
FROM race_data
WHERE xgboost_proba = (SELECT MAX(xgboost_proba) FROM race_data WHERE xgboost_proba IS NOT NULL)

UNION ALL

SELECT 
  'Benter Top' as model,
  horse_name,
  benter_proba as probability
FROM race_data
WHERE benter_proba = (SELECT MAX(benter_proba) FROM race_data WHERE benter_proba IS NOT NULL)

UNION ALL

SELECT 
  'Ensemble Top' as model,
  horse_name,
  ensemble_proba as probability
FROM race_data
WHERE ensemble_proba = (SELECT MAX(ensemble_proba) FROM race_data WHERE ensemble_proba IS NOT NULL)

ORDER BY model;
