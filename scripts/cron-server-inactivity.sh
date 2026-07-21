#!/bin/bash
# Server Inactivity Check - Run via crontab
# Add to crontab: */30 * * * * /home/akmed/Desktop/MGS/cloudops-crm/scripts/cron-server-inactivity.sh
#
# This script checks all active servers for email sending activity in the last 24 hours.
# If a server has no sends, it creates notifications for the assigned mailer or all active users.

APP_URL="${APP_URL:-http://localhost:3001}"
CRON_API_KEY="${CRON_API_KEY:-cloudops-cron-key-change-me}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $CRON_API_KEY" \
  "$APP_URL/api/cron/server-inactivity" 2>/dev/null)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  ALERTS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('alerts', 0))" 2>/dev/null)
  CHECKED=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('checked', 0))" 2>/dev/null)
  echo "[$(date -Iseconds)] Inactivity check: $CHECKED servers checked, $ALERTS alerts"
else
  echo "[$(date -Iseconds)] ERROR: HTTP $HTTP_CODE - $BODY"
fi
