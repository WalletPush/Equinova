#!/bin/bash

# Simple Race Results Scheduler
# Run this script every 5 minutes with cron: */5 * * * * /path/to/this/script.sh

# Configuration
SUPABASE_URL="https://zjqojacejstbqmxzstyk.supabase.co"
SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"  # Replace with your actual key

# Log file
LOG_FILE="./race-scheduler.log"

# Current timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting race results scheduler..." >> $LOG_FILE

# Call the scheduler function
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/race-results-scheduler" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json")

echo "[$TIMESTAMP] Response: $RESPONSE" >> $LOG_FILE

if [[ $RESPONSE == *"success"* ]] || [[ $RESPONSE == *"processed"* ]]; then
  echo "[$TIMESTAMP] ✅ Scheduler completed successfully" >> $LOG_FILE
else
  echo "[$TIMESTAMP] ❌ Scheduler failed: $RESPONSE" >> $LOG_FILE
fi
