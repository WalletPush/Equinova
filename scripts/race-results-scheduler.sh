#!/bin/bash

# Race Results Scheduler Cron Job
# Add this to your crontab: */5 * * * * /path/to/this/script.sh

# Your Supabase service role key
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# Supabase project URL
SUPABASE_URL="https://zjqojacejstbqmxzstyk.supabase.co"

# Log file
LOG_FILE="/var/log/race-results-scheduler.log"

# Current timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting race results scheduler..." >> $LOG_FILE

# Call the scheduler function
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/race-results-scheduler" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json")

echo "[$TIMESTAMP] Response: $RESPONSE" >> $LOG_FILE

# Check if successful
if [[ $RESPONSE == *"success"* ]]; then
  echo "[$TIMESTAMP] Scheduler completed successfully" >> $LOG_FILE
else
  echo "[$TIMESTAMP] Scheduler failed: $RESPONSE" >> $LOG_FILE
fi
