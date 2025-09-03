-- First, enable the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
  'race-results-scheduler',           -- unique job name
  '*/5 * * * *',                      -- cron schedule (every 5 minutes)
  'SELECT public.race_results_cron_job();'  -- function to call
);

-- To check if it's scheduled:
SELECT * FROM cron.job WHERE jobname = 'race-results-scheduler';

-- To unschedule if needed:
-- SELECT cron.unschedule('race-results-scheduler');
