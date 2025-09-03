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

    // Check if cron job was triggered recently (within last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    
    const { data: cronLog, error: cronError } = await supabase
      .from('cron_log')
      .select('*')
      .eq('job_name', 'race_results_scheduler')
      .gte('executed_at', tenMinutesAgo.toISOString())
      .single()

    if (cronError && cronError.code !== 'PGRST116') {
      console.error('Error checking cron log:', cronError)
      return new Response(
        JSON.stringify({ error: 'Failed to check cron log' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If cron job was triggered recently, process race results
    if (cronLog) {
      console.log('Cron job triggered, processing race results...')
      
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

      // Update cron log status
      await supabase
        .from('cron_log')
        .update({ status: 'completed' })
        .eq('job_name', 'race_results_scheduler')

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Race results processed successfully',
          result: schedulerResult 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No recent cron trigger found, skipping processing' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

