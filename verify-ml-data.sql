-- Verification Queries for ML Performance Data

-- A) Check winners have correct flags
select race_id, horse_id, actual_position, is_winner, is_top3, prediction_correct
from public.ml_model_race_results
where actual_position = 1
order by created_at desc
limit 20;

-- B) Sanity check on all records
select 
  count(*) filter (where is_winner) as winners,
  count(*) filter (where is_top3) as top3s,
  count(*) as total,
  count(*) filter (where actual_position = 1) as position_1_count
from public.ml_model_race_results;

-- C) Check for any inconsistencies (should return 0 rows)
select race_id, horse_id, model_name, actual_position, is_winner, is_top3, prediction_correct
from public.ml_model_race_results
where (actual_position = 1 and (not is_winner or not prediction_correct))
   or (actual_position <= 3 and not is_top3)
   or (actual_position > 3 and is_top3)
order by created_at desc;

