-- Add trigger to automatically populate ML performance data when race results are added
-- This trigger will fire the populate-ml-performance-data Edge Function when new race results are inserted

-- First, create a function that will call the Edge Function
CREATE OR REPLACE FUNCTION trigger_ml_performance_population()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  function_url TEXT;
  response_status INTEGER;
BEGIN
  -- Get Supabase URL and service role key from environment
  -- Note: In production, these should be set as Supabase secrets
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If environment variables are not set, use default (this might need adjustment)
  IF supabase_url IS NULL THEN
    supabase_url := 'https://zjqojacejstbqmxzstyk.supabase.co';
  END IF;
  
  -- Construct the function URL
  function_url := supabase_url || '/functions/v1/populate-ml-performance-data';
  
  -- Log the trigger execution
  RAISE LOG 'Race results trigger: New race result added for race_id: %', NEW.race_id;
  
  -- Use pg_net to call the Edge Function asynchronously
  -- This requires the pg_net extension to be enabled
  BEGIN
    PERFORM net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
      ),
      body := jsonb_build_object(
        'race_id', NEW.race_id,
        'triggered_by', 'race_results_insert',
        'timestamp', NOW()
      ),
      timeout_milliseconds := 30000
    );
    
    RAISE LOG 'Successfully triggered ML performance population for race_id: %', NEW.race_id;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to trigger ML performance population for race_id: %. Error: %', NEW.race_id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on race_results table
DROP TRIGGER IF EXISTS trigger_populate_ml_performance ON public.race_results;

CREATE TRIGGER trigger_populate_ml_performance
  AFTER INSERT ON public.race_results
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ml_performance_population();

-- Add comment for documentation
COMMENT ON FUNCTION trigger_ml_performance_population() IS 'Triggers ML performance data population when new race results are inserted';
COMMENT ON TRIGGER trigger_populate_ml_performance ON public.race_results IS 'Automatically populates ML performance data when race results are added';

-- Note: This trigger requires the pg_net extension to be enabled
-- If pg_net is not available, an alternative approach would be to use a scheduled job
-- that periodically checks for new race results and processes them
