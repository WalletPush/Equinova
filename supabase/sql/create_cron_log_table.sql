-- Create cron_log table to track cron executions
CREATE TABLE IF NOT EXISTS public.cron_log (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'triggered',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cron_log_job_name ON public.cron_log(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_log_executed_at ON public.cron_log(executed_at);

-- Enable RLS
ALTER TABLE public.cron_log ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow service role full access" ON public.cron_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated users to view" ON public.cron_log
  FOR SELECT USING (auth.role() = 'authenticated');
