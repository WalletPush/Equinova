-- Create ML Model Performance Tracking Table
-- This table tracks the performance of all ML models (mlp, rf, xgboost, benter, ensemble)

CREATE TABLE IF NOT EXISTS public.ml_model_race_results (
  id SERIAL PRIMARY KEY,
  race_id TEXT NOT NULL,
  horse_id TEXT NOT NULL,
  horse_name TEXT NOT NULL,
  model_name TEXT NOT NULL CHECK (model_name IN ('mlp', 'rf', 'xgboost', 'benter', 'ensemble')),
  predicted_probability DECIMAL(5,4) NOT NULL,
  actual_position INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL,
  is_top3 BOOLEAN NOT NULL,
  prediction_correct BOOLEAN, -- Only for ensemble model winner predictions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ml_performance_race_id ON public.ml_model_race_results(race_id);
CREATE INDEX IF NOT EXISTS idx_ml_performance_horse_id ON public.ml_model_race_results(horse_id);
CREATE INDEX IF NOT EXISTS idx_ml_performance_model_name ON public.ml_model_race_results(model_name);
CREATE INDEX IF NOT EXISTS idx_ml_performance_created_at ON public.ml_model_race_results(created_at);
CREATE INDEX IF NOT EXISTS idx_ml_performance_is_winner ON public.ml_model_race_results(is_winner);
CREATE INDEX IF NOT EXISTS idx_ml_performance_is_top3 ON public.ml_model_race_results(is_top3);

-- Add RLS policies
ALTER TABLE public.ml_model_race_results ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read ML performance data
CREATE POLICY "Allow authenticated users to read ML performance" ON public.ml_model_race_results
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role to insert/update ML performance data
CREATE POLICY "Allow service role to manage ML performance" ON public.ml_model_race_results
  FOR ALL USING (auth.role() = 'service_role');

-- Add comments for documentation
COMMENT ON TABLE public.ml_model_race_results IS 'Tracks performance of ML models (mlp, rf, xgboost, benter, ensemble) for each horse in each race';
COMMENT ON COLUMN public.ml_model_race_results.model_name IS 'Name of the ML model (mlp, rf, xgboost, benter, ensemble)';
COMMENT ON COLUMN public.ml_model_race_results.predicted_probability IS 'Model predicted win probability (0.0000 to 1.0000)';
COMMENT ON COLUMN public.ml_model_race_results.actual_position IS 'Actual finishing position (1 = winner, 2 = second, etc.)';
COMMENT ON COLUMN public.ml_model_race_results.is_winner IS 'Whether the horse actually won (position = 1)';
COMMENT ON COLUMN public.ml_model_race_results.is_top3 IS 'Whether the horse finished in top 3 positions';
COMMENT ON COLUMN public.ml_model_race_results.prediction_correct IS 'For ensemble model: whether the winner prediction was correct';

-- Create view for ML model performance summary
CREATE OR REPLACE VIEW public.ml_model_summary AS
SELECT 
  model_name,
  COUNT(*) as total_predictions,
  COUNT(*) FILTER (WHERE is_winner) as correct_winner_predictions,
  COUNT(*) FILTER (WHERE is_top3) as correct_top3_predictions,
  ROUND(
    COUNT(*) FILTER (WHERE is_winner)::DECIMAL / COUNT(*) * 100, 2
  ) as winner_accuracy_percentage,
  ROUND(
    COUNT(*) FILTER (WHERE is_top3)::DECIMAL / COUNT(*) * 100, 2
  ) as top3_accuracy_percentage,
  ROUND(
    AVG(predicted_probability) * 100, 2
  ) as average_confidence_percentage,
  ROUND(
    AVG(predicted_probability) FILTER (WHERE is_winner) * 100, 2
  ) as average_confidence_when_correct,
  ROUND(
    AVG(predicted_probability) FILTER (WHERE NOT is_winner) * 100, 2
  ) as average_confidence_when_incorrect,
  COUNT(*) FILTER (WHERE prediction_correct = true) as ensemble_winner_predictions_correct,
  COUNT(*) FILTER (WHERE prediction_correct = false) as ensemble_winner_predictions_incorrect
FROM public.ml_model_race_results
GROUP BY model_name
ORDER BY winner_accuracy_percentage DESC;

-- Create function to get recent ML model performance (last 30 days)
CREATE OR REPLACE FUNCTION get_recent_ml_performance(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  model_name TEXT,
  total_predictions BIGINT,
  correct_winner_predictions BIGINT,
  winner_accuracy_percentage DECIMAL(5,2),
  average_confidence_percentage DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mmp.model_name,
    COUNT(*) as total_predictions,
    COUNT(*) FILTER (WHERE mmp.is_winner) as correct_winner_predictions,
    ROUND(
      COUNT(*) FILTER (WHERE mmp.is_winner)::DECIMAL / COUNT(*) * 100, 2
    ) as winner_accuracy_percentage,
    ROUND(
      AVG(mmp.predicted_probability) * 100, 2
    ) as average_confidence_percentage
  FROM public.ml_model_race_results mmp
  WHERE mmp.created_at >= NOW() - INTERVAL '1 day' * days_back
  GROUP BY mmp.model_name
  ORDER BY winner_accuracy_percentage DESC;
END;
$$ LANGUAGE plpgsql;

-- Verify table created
SELECT 
  table_name,
  'CREATED' as status
FROM information_schema.tables 
WHERE table_name = 'ml_model_race_results'
AND table_schema = 'public';
