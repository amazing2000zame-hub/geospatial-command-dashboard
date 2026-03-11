#!/bin/bash
# Agent 2: Frontend & UX Monitor
# Checks frontend build, asset loading, WebSocket connections, NAS for new videos
# Reports issues and auto-fixes where possible

BOT_TOKEN="8289970213:AAH4O-sedpTPK6YfCi0ghUpNJeiYSgV8JMY"
CHAT_ID="8231301805"
CHECK_INTERVAL=300  # 5 minutes
DASHBOARD_URL="http://localhost:3010"
NAS_TRANSCRIBE="/mnt/external-hdd/Tran"
LOG_FILE="/root/geospatial-dashboard/scripts/agent-frontend.log"
KNOWN_VIDEOS_FILE="/root/geospatial-dashboard/scripts/.known-videos"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": ${CHAT_ID}, \"text\": \"$1\", \"parse_mode\": \"Markdown\"}" > /dev/null 2>&1
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_static_assets() {
  local issues=""
  # Check main JS bundle loads
  index_html=$(curl -s --max-time 10 "${DASHBOARD_URL}/" 2>/dev/null)
  js_file=$(echo "$index_html" | grep -oP 'src="/assets/index-[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
  css_file=$(echo "$index_html" | grep -oP 'href="/assets/index-[^"]+\.css"' | head -1 | sed 's/href="//;s/"//')

  if [ -n "$js_file" ]; then
    js_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${DASHBOARD_URL}${js_file}" 2>/dev/null)
    if [ "$js_code" != "200" ]; then
      issues="${issues}\n- JS bundle \`${js_file}\` returned ${js_code}"
      log "ISSUE: JS bundle returned $js_code"
    fi
  else
    issues="${issues}\n- Cannot find JS bundle in HTML"
    log "ISSUE: No JS bundle found in HTML"
  fi

  if [ -n "$css_file" ]; then
    css_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${DASHBOARD_URL}${css_file}" 2>/dev/null)
    if [ "$css_code" != "200" ]; then
      issues="${issues}\n- CSS bundle \`${css_file}\` returned ${css_code}"
      log "ISSUE: CSS bundle returned $css_code"
    fi
  fi

  # Check Cesium assets
  cesium_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${DASHBOARD_URL}/Cesium/Cesium.js" 2>/dev/null)
  if [ "$cesium_code" != "200" ]; then
    issues="${issues}\n- Cesium assets not loading (${cesium_code})"
    log "ISSUE: Cesium assets returned $cesium_code"
  fi

  # Check icons
  for icon in aircraft.svg satellite.svg; do
    icon_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${DASHBOARD_URL}/icons/${icon}" 2>/dev/null)
    if [ "$icon_code" != "200" ]; then
      issues="${issues}\n- Icon \`/icons/${icon}\` returned ${icon_code}"
      log "ISSUE: Icon $icon returned $icon_code"
    fi
  done

  echo "$issues"
}

check_websocket() {
  local issues=""
  # Socket.IO polling returns 200 with session data or 400 for bad request (both OK)
  ws_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${DASHBOARD_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null)
  if [ "$ws_code" = "000" ] || [ "$ws_code" = "502" ] || [ "$ws_code" = "503" ]; then
    issues="${issues}\n- WebSocket/Socket.IO endpoint unreachable (${ws_code})"
    log "ISSUE: WebSocket endpoint returned $ws_code"
  fi
  echo "$issues"
}

check_typescript_errors() {
  local issues=""
  # Quick check for TypeScript compilation
  cd /root/geospatial-dashboard/frontend
  tsc_output=$(npx tsc --noEmit 2>&1 | head -20)
  error_count=$(echo "$tsc_output" | grep -c "error TS" || true)
  if [ "$error_count" -gt 0 ]; then
    first_errors=$(echo "$tsc_output" | grep "error TS" | head -5)
    issues="${issues}\n- ${error_count} TypeScript errors:\n\`\`\`\n${first_errors}\n\`\`\`"
    log "ISSUE: $error_count TypeScript errors found"
  fi
  echo "$issues"
}

check_docker_resources() {
  local issues=""
  # Check memory/CPU usage
  for container in geospatial-backend geospatial-nginx geospatial-redis; do
    mem=$(docker stats --no-stream --format "{{.MemPerc}}" "$container" 2>/dev/null | sed 's/%//')
    if [ -n "$mem" ]; then
      mem_int=${mem%.*}
      if [ "$mem_int" -gt 80 ]; then
        issues="${issues}\n- Container \`${container}\` using ${mem}% memory"
        log "ISSUE: $container using ${mem}% memory"
      fi
    fi
  done
  echo "$issues"
}

check_nas_videos() {
  # Check for new videos in transcribe folder
  touch "$KNOWN_VIDEOS_FILE" 2>/dev/null
  if [ -d "$NAS_TRANSCRIBE" ]; then
    for video in "$NAS_TRANSCRIBE"/*.MP4 "$NAS_TRANSCRIBE"/*.mp4 "$NAS_TRANSCRIBE"/*.MOV "$NAS_TRANSCRIBE"/*.mov "$NAS_TRANSCRIBE"/*.mkv "$NAS_TRANSCRIBE"/*.avi; do
      [ ! -f "$video" ] && continue
      basename=$(basename "$video")
      if ! grep -qF "$basename" "$KNOWN_VIDEOS_FILE" 2>/dev/null; then
        echo "$basename" >> "$KNOWN_VIDEOS_FILE"
        size=$(du -sh "$video" | cut -f1)
        send_telegram "📹 *New Video Detected on NAS*\nFile: \`${basename}\`\nSize: ${size}\nPath: \`${video}\`\n\nReady for review."
        log "New video detected: $basename ($size)"
      fi
    done
  fi
}

check_build_freshness() {
  local issues=""
  # Check if source files are newer than last build
  src_newest=$(find /root/geospatial-dashboard/frontend/src -name "*.tsx" -o -name "*.ts" -o -name "*.css" | xargs stat -c %Y 2>/dev/null | sort -n | tail -1)
  dist_newest=$(stat -c %Y /root/geospatial-dashboard/frontend/dist/index.html 2>/dev/null)

  if [ -n "$src_newest" ] && [ -n "$dist_newest" ] && [ "$src_newest" -gt "$dist_newest" ]; then
    issues="${issues}\n- Source files modified after last build — rebuild needed"
    log "ISSUE: Source files newer than build"

    # Auto-fix: rebuild and redeploy
    log "AUTO-FIX: Rebuilding frontend..."
    cd /root/geospatial-dashboard/frontend
    build_output=$(npm run build 2>&1)
    if echo "$build_output" | grep -q "built in"; then
      cd /root/geospatial-dashboard
      docker compose up -d --build nginx 2>&1
      log "AUTO-FIX: Frontend rebuilt and deployed"
      send_telegram "🔄 *Auto-Fix: Frontend Rebuilt*\nSource changes detected and automatically deployed."
    else
      errors=$(echo "$build_output" | grep "error" | head -5)
      issues="${issues}\n- Auto-rebuild FAILED:\n\`\`\`\n${errors}\n\`\`\`"
      log "AUTO-FIX FAILED: Build errors"
    fi
  fi
  echo "$issues"
}

# Initialize known videos
if [ -d "$NAS_TRANSCRIBE" ]; then
  for video in "$NAS_TRANSCRIBE"/*.MP4 "$NAS_TRANSCRIBE"/*.mp4 "$NAS_TRANSCRIBE"/*.MOV "$NAS_TRANSCRIBE"/*.mov "$NAS_TRANSCRIBE"/*.mkv "$NAS_TRANSCRIBE"/*.avi; do
    [ -f "$video" ] && basename "$video" >> "$KNOWN_VIDEOS_FILE" 2>/dev/null
  done
  sort -u "$KNOWN_VIDEOS_FILE" -o "$KNOWN_VIDEOS_FILE" 2>/dev/null
fi

# Main loop
log "=== Frontend Monitor Agent started ==="
send_telegram "🤖 *Frontend Monitor Agent* started. Checking every ${CHECK_INTERVAL}s.\nAlso watching NAS for new videos."
cycle=0

while true; do
  cycle=$((cycle + 1))
  all_issues=""

  asset_issues=$(check_static_assets)
  [ -n "$asset_issues" ] && all_issues="${all_issues}${asset_issues}"

  ws_issues=$(check_websocket)
  [ -n "$ws_issues" ] && all_issues="${all_issues}${ws_issues}"

  resource_issues=$(check_docker_resources)
  [ -n "$resource_issues" ] && all_issues="${all_issues}${resource_issues}"

  # Check for new videos every cycle
  check_nas_videos

  # Check build freshness and TypeScript every 6 cycles (30 min)
  if [ $((cycle % 6)) -eq 0 ]; then
    build_issues=$(check_build_freshness)
    [ -n "$build_issues" ] && all_issues="${all_issues}${build_issues}"

    ts_issues=$(check_typescript_errors)
    [ -n "$ts_issues" ] && all_issues="${all_issues}${ts_issues}"
  fi

  if [ -n "$all_issues" ]; then
    send_telegram "⚠️ *Frontend Monitor - Issues Found*\n${all_issues}"
    log "Reported issues to Telegram"
  else
    log "Cycle $cycle: All checks passed"
    # Hourly heartbeat
    if [ $((cycle % 12)) -eq 0 ]; then
      send_telegram "💚 *Frontend Monitor - Hourly Status*\nAll frontend systems operational.\nCycle: ${cycle}"
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
