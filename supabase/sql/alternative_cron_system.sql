-- Alternative cron system using a simple table
CREATE TABLE IF NOT EXISTS public.scheduler_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL UNIQUE,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ NOT NULL,
  schedule TEXT NOT NULL, -- cron-like schedule
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert our race results job
INSERT INTO public.scheduler_jobs (job_name, next_run, schedule)
VALUES (
  'race-results-scheduler',
  NOW() + INTERVAL '5 minutes',
  '*/5 * * * *'
)
ON CONFLICT (job_name) 
DO UPDATE SET 
  next_run = NOW() + INTERVAL '5 minutes',
  is_active = true;

-- Function to check and run scheduled jobs
CREATE OR REPLACE FUNCTION public.check_scheduled_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Find jobs that need to run
  FOR job_record IN 
    SELECT * FROM public.scheduler_jobs 
    WHERE is_active = true AND next_run <= NOW()
  LOOP
    -- Update last_run and next_run
    UPDATE public.scheduler_jobs 
    SET 
      last_run = NOW(),
      next_run = NOW() + INTERVAL '5 minutes'
    WHERE id = job_record.id;
    
    -- Call the appropriate function based on job name
    IF job_record.job_name = 'race-results-scheduler' THEN
      PERFORM public.race_results_cron_job();
    END IF;
  END LOOP;
END;
$$;
