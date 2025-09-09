import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the check_scheduled_jobs function
    const { data: result, error } = await supabase.rpc('check_scheduled_jobs')

    if (error) {
      console.error('Error calling check_scheduled_jobs:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to check scheduled jobs', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if any jobs were triggered
    const { data: schedulerJobs } = await supabase
      .from('scheduler_jobs')
      .select('*')
      .eq('job_name', 'race-results-scheduler')
      .single()

    if (schedulerJobs && schedulerJobs.last_run) {
      // Check if the job was recently run (within last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      const lastRun = new Date(schedulerJobs.last_run)
      
      if (lastRun > tenMinutesAgo) {
        console.log('Scheduler job triggered, processing race results...')
        
        // Call the race results scheduler
        const { data: schedulerResult, error: schedulerError } = await supabase.functions.invoke('race-results-scheduler', {
          body: {}
        })

        if (schedulerError) {
          console.error('Error calling race results scheduler:', schedulerError)
          return new Response(
            JSON.stringify({ error: 'Failed to process race results', details: schedulerError }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Race results processed successfully',
            result: schedulerResult,
            last_run: schedulerJobs.last_run
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Scheduler checked, no jobs ready to run',
        next_run: schedulerJobs?.next_run
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})






