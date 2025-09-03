import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })
    }

    const response = await fetch('https://zjqojacejstbqmxzstyk.supabase.co/functions/v1/race-results-scheduler', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}

