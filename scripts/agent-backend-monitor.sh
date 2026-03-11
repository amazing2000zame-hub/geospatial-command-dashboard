#!/bin/bash
# Agent 1: Backend Health Monitor
# Runs continuously, checks backend health, data freshness, container status
# Reports issues to Telegram

BOT_TOKEN="8289970213:AAH4O-sedpTPK6YfCi0ghUpNJeiYSgV8JMY"
CHAT_ID="8231301805"
CHECK_INTERVAL=300  # 5 minutes
DASHBOARD_URL="http://localhost:3010"
LOG_FILE="/root/geospatial-dashboard/scripts/agent-backend.log"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": ${CHAT_ID}, \"text\": \"$1\", \"parse_mode\": \"Markdown\"}" > /dev/null 2>&1
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_containers() {
  local issues=""
  for svc in geospatial-backend geospatial-nginx geospatial-redis; do
    status=$(docker inspect --format='{{.State.Status}}' "$svc" 2>/dev/null)
    if [ "$status" != "running" ]; then
      issues="${issues}\n- Container \`${svc}\` is ${status:-missing}"
      log "ISSUE: Container $svc is ${status:-missing}"
      docker compose -f /root/geospatial-dashboard/docker-compose.yml restart "$svc" 2>/dev/null
      log "AUTO-FIX: Restarted $svc"
    fi
  done
  echo "$issues"
}

check_data_freshness() {
  local issues=""
  # Data is served via Redis + Socket.IO, not REST. Check Redis directly.
  local layers=("earthquakes" "weather" "satellites" "traffic_cameras" "active_fires" "conflict_events" "alpr" "speed_cameras")

  for layer in "${layers[@]}"; do
    size=$(docker exec geospatial-redis redis-cli --raw strlen "geo:layer:${layer}" 2>/dev/null)
    if [ -z "$size" ] || [ "$size" = "0" ]; then
      issues="${issues}\n- Layer \`${layer}\` has no data in Redis"
      log "ISSUE: Layer $layer has no data in Redis"
    fi
  done
  echo "$issues"
}

check_frontend() {
  local issues=""
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${DASHBOARD_URL}/" 2>/dev/null)
  if [ "$http_code" != "200" ]; then
    issues="${issues}\n- Frontend returned ${http_code} (expected 200)"
    log "ISSUE: Frontend returned $http_code"
  fi
  echo "$issues"
}

check_error_logs() {
  local issues=""
  error_count=$(docker logs geospatial-backend --since "${CHECK_INTERVAL}s" 2>&1 | grep -ciE "unhandled|crash|ECONNREFUSED|FATAL|TypeError|ReferenceError" || true)
  if [ "$error_count" -gt 0 ]; then
    errors=$(docker logs geospatial-backend --since "${CHECK_INTERVAL}s" 2>&1 | grep -iE "unhandled|crash|ECONNREFUSED|FATAL|TypeError|ReferenceError" | head -3)
    issues="${issues}\n- ${error_count} critical errors in backend logs:\n\`\`\`\n${errors}\n\`\`\`"
    log "ISSUE: $error_count critical errors in backend logs"
  fi
  echo "$issues"
}

check_redis_health() {
  local issues=""
  pong=$(docker exec geospatial-redis redis-cli ping 2>/dev/null)
  if [ "$pong" != "PONG" ]; then
    issues="${issues}\n- Redis not responding to PING"
    log "ISSUE: Redis not responding"
  fi
  echo "$issues"
}

# Main loop
log "=== Backend Monitor Agent started ==="
send_telegram "🤖 *Backend Monitor Agent* started. Checking every ${CHECK_INTERVAL}s."
cycle=0

while true; do
  cycle=$((cycle + 1))
  all_issues=""

  container_issues=$(check_containers)
  [ -n "$container_issues" ] && all_issues="${all_issues}${container_issues}"

  frontend_issues=$(check_frontend)
  [ -n "$frontend_issues" ] && all_issues="${all_issues}${frontend_issues}"

  redis_issues=$(check_redis_health)
  [ -n "$redis_issues" ] && all_issues="${all_issues}${redis_issues}"

  data_issues=$(check_data_freshness)
  [ -n "$data_issues" ] && all_issues="${all_issues}${data_issues}"

  error_issues=$(check_error_logs)
  [ -n "$error_issues" ] && all_issues="${all_issues}${error_issues}"

  if [ -n "$all_issues" ]; then
    send_telegram "⚠️ *Backend Monitor - Issues Found*\n${all_issues}"
    log "Reported issues to Telegram"
  else
    log "Cycle $cycle: All checks passed"
    # Send heartbeat every 12 cycles (1 hour)
    if [ $((cycle % 12)) -eq 0 ]; then
      layer_counts=""
      for layer in earthquakes weather satellites traffic_cameras active_fires conflict_events alpr speed_cameras flights; do
        size=$(docker exec geospatial-redis redis-cli --raw strlen "geo:layer:${layer}" 2>/dev/null)
        size_kb=$((size / 1024))
        layer_counts="${layer_counts}\n  ${layer}: ${size_kb}KB"
      done
      send_telegram "💚 *Backend Monitor - Hourly Status*\nAll systems operational.\nCycle: ${cycle}\nData sizes:${layer_counts}"
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
