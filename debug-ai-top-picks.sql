-- SQL Query to find horses with 3+ ML models agreeing (same top probability)
-- Run this in Supabase SQL Editor

-- First, find the top horse for each race in each ML model
WITH mlp_tops AS (
  SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, mlp_proba
  FROM race_entries re1
  WHERE mlp_proba = (
    SELECT MAX(mlp_proba) 
    FROM race_entries re2 
    WHERE re2.race_id = re1.race_id AND re2.mlp_proba IS NOT NULL
  )
),
rf_tops AS (
  SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, rf_proba
  FROM race_entries re1
  WHERE rf_proba = (
    SELECT MAX(rf_proba) 
    FROM race_entries re2 
    WHERE re2.race_id = re1.race_id AND re2.rf_proba IS NOT NULL
  )
),
xgboost_tops AS (
  SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, xgboost_proba
  FROM race_entries re1
  WHERE xgboost_proba = (
    SELECT MAX(xgboost_proba) 
    FROM race_entries re2 
    WHERE re2.race_id = re1.race_id AND re2.xgboost_proba IS NOT NULL
  )
),
benter_tops AS (
  SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, benter_proba
  FROM race_entries re1
  WHERE benter_proba = (
    SELECT MAX(benter_proba) 
    FROM race_entries re2 
    WHERE re2.race_id = re1.race_id AND re2.benter_proba IS NOT NULL
  )
),
ensemble_tops AS (
  SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, ensemble_proba
  FROM race_entries re1
  WHERE ensemble_proba = (
    SELECT MAX(ensemble_proba) 
    FROM race_entries re2 
    WHERE re2.race_id = re1.race_id AND re2.ensemble_proba IS NOT NULL
  )
),
-- Combine all top picks and count agreements
model_agreements AS (
  SELECT 
    race_id,
    horse_id,
    horse_name,
    trainer_name,
    jockey_name,
    current_odds,
    COUNT(*) as models_agreeing,
    STRING_AGG(model_name, ', ') as agreeing_models
  FROM (
    SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, 'MLP' as model_name FROM mlp_tops
    UNION ALL
    SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, 'RF' as model_name FROM rf_tops
    UNION ALL
    SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, 'XGBoost' as model_name FROM xgboost_tops
    UNION ALL
    SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, 'Benter' as model_name FROM benter_tops
    UNION ALL
    SELECT race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds, 'Ensemble' as model_name FROM ensemble_tops
  ) all_tops
  GROUP BY race_id, horse_id, horse_name, trainer_name, jockey_name, current_odds
)
SELECT 
  r.course_name,
  r.off_time,
  r.race_name,
  r.class,
  r.dist,
  r.going,
  ma.horse_name,
  ma.trainer_name,
  ma.jockey_name,
  ma.current_odds,
  ma.models_agreeing,
  ma.agreeing_models,
  CASE 
    WHEN ma.models_agreeing >= 3 THEN '3+ Models Agree'
    WHEN ma.models_agreeing >= 2 THEN '2 Models Agree'
    ELSE 'Single Model Pick'
  END as ai_reason
FROM model_agreements ma
JOIN races r ON ma.race_id = r.race_id
WHERE r.date = CURRENT_DATE
  AND ma.models_agreeing >= 2  -- Show horses with 2+ models agreeing
ORDER BY r.off_time, ma.models_agreeing DESC;
