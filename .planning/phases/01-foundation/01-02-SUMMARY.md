---
phase: 01-foundation
plan: 02
subsystem: api
tags: [fastify, socket.io, redis, node-cron, usgs, nws, geojson, websocket]

# Dependency graph
requires:
  - phase: 01-foundation-01
    provides: Docker Compose stack, Fastify skeleton, GeoJSON types
provides:
  - Fastify 5 backend with REST API (/api/health, /api/layers/:layerId)
  - Redis cache service with TTL, pipeline writes, error tracking
  - Socket.IO /layers namespace with room-based subscribe/unsubscribe
  - BaseFetcher abstract class for fetch-normalize-cache-emit pattern
  - USGS earthquake fetcher (60s poll, 280+ features)
  - NWS weather alerts fetcher (120s poll, null-geometry filtering)
  - node-cron scheduler with staggered initial fetch jitter
  - Source configuration system for adding future data sources
affects: [01-foundation-03, 02-data-layers, 03-data-layers, 04-polish]

# Tech tracking
tech-stack:
  added: [fastify 5, socket.io 4.8, node-redis 5, node-cron 3]
  patterns: [BaseFetcher abstract class, fetch-normalize-cache-emit pipeline, room-based WebSocket broadcast, staggered cron startup]

key-files:
  created:
    - backend/src/config/env.ts
    - backend/src/config/sources.ts
    - backend/src/services/cache.ts
    - backend/src/services/websocket.ts
    - backend/src/services/scheduler.ts
    - backend/src/routes/health.ts
    - backend/src/routes/layers.ts
    - backend/src/server.ts
    - backend/src/fetchers/BaseFetcher.ts
    - backend/src/fetchers/usgs.ts
    - backend/src/fetchers/nws.ts
  modified:
    - backend/src/index.ts
    - backend/src/types/geojson.ts

key-decisions:
  - "Socket.IO attached AFTER Fastify listen (requires http.Server to be active)"
  - "Cache TTL slightly less than poll interval (55s for 60s poll) to ensure fresh data on next cycle"
  - "Random 0-5s jitter on initial fetch to prevent thundering herd on container restart"
  - "Updated LayerFeatureProperties severity from string to number|null for normalized 0-1 scale"

patterns-established:
  - "BaseFetcher: abstract class with fetchRaw/normalize overrides, shared execute() pipeline"
  - "CacheService: Redis pipeline writes with geo:layer:, geo:meta:, geo:error: key prefixes"
  - "Room-based WebSocket: clients subscribe to layer:{sourceId} rooms, receive data on emit"
  - "SourceConfig: declarative source definition (sourceId, interval, cacheTTL, enabled)"

requirements-completed: [BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, DEPL-03, EQKE-01, WTHR-01]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 1 Plan 02: Backend Infrastructure Summary

**Fastify 5 backend with Redis cache, Socket.IO rooms, USGS earthquake + NWS weather fetchers polling on cron with staggered jitter**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T18:01:48Z
- **Completed:** 2026-03-10T18:07:31Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Complete Fastify 5 backend with typed env config, Redis cache service, and Socket.IO /layers namespace
- BaseFetcher abstract class establishing the fetch-normalize-cache-emit pattern for all future data sources
- USGS earthquake fetcher polling every 60s, normalizing 280+ features with magnitude/depth/severity
- NWS weather alerts fetcher polling every 120s with required User-Agent header, filtering null-geometry alerts
- node-cron scheduler with random 0-5s jitter preventing thundering herd on container restart
- REST endpoints: /api/health (Redis status), /api/layers (all sources), /api/layers/:layerId (cached data)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fastify 5 server, Redis cache, Socket.IO, routes, config** - `8f1a751` (feat)
2. **Task 2: BaseFetcher pattern, USGS/NWS fetchers, scheduler** - `620c6be` (feat)

## Files Created/Modified
- `backend/src/config/env.ts` - Typed environment variable loading with defaults
- `backend/src/config/sources.ts` - Source configuration (earthquakes 60s, weather 120s)
- `backend/src/services/cache.ts` - Redis CacheService with get/set/setError/getStatus
- `backend/src/services/websocket.ts` - Socket.IO /layers namespace with room subscribe/unsubscribe
- `backend/src/services/scheduler.ts` - node-cron scheduler with staggered initial fetch jitter
- `backend/src/routes/health.ts` - GET /api/health with Redis connection status
- `backend/src/routes/layers.ts` - GET /api/layers and GET /api/layers/:layerId
- `backend/src/server.ts` - Fastify + CORS + Redis + routes + Socket.IO creation
- `backend/src/fetchers/BaseFetcher.ts` - Abstract class with fetch-normalize-cache-emit pattern
- `backend/src/fetchers/usgs.ts` - USGS earthquake fetcher, normalizes GeoJSON
- `backend/src/fetchers/nws.ts` - NWS weather alerts fetcher, User-Agent header, null-geometry filter
- `backend/src/index.ts` - Entry point wiring server + fetchers + scheduler + graceful shutdown
- `backend/src/types/geojson.ts` - Updated severity to number|null, label/category nullable

## Decisions Made
- Socket.IO attached AFTER Fastify listen -- Socket.IO requires the http.Server to be actively listening
- Cache TTL slightly less than poll interval (55s for 60s poll) to ensure data is refreshed on next cycle
- Random 0-5s jitter on initial fetch prevents thundering herd when container restarts (all 17+ future APIs)
- Updated LayerFeatureProperties severity from string to number|null for normalized 0-1 severity scale
- NWS severity mapping: extreme=1.0, severe=0.75, moderate=0.5, minor=0.25, unknown=0.1
- USGS severity mapping: magnitude/10 clamped to 0-1 range

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated LayerFeatureProperties types for correctness**
- **Found during:** Task 1 (server infrastructure)
- **Issue:** geojson.ts from 01-01 had severity as string, label/category as non-nullable string. Fetchers produce numeric severity (0-1) and NWS data can have null labels
- **Fix:** Changed severity to `number | null`, label/category to `string | null`
- **Files modified:** backend/src/types/geojson.ts
- **Verification:** TypeScript compiles cleanly, runtime data matches types
- **Committed in:** 8f1a751 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Type update necessary for correctness. No scope creep.

## Issues Encountered
None - all files compiled on first attempt, Docker build succeeded, both fetchers returned data immediately.

## Verification Results
- `GET /api/health` returns `{"status":"ok","redis":true,"uptime":...}`
- `GET /api/layers/earthquakes` returns FeatureCollection with 280 earthquake features
- `GET /api/layers/weather` returns FeatureCollection with 31 weather alert features (null-geometry filtered)
- `GET /api/layers` lists both sources with active status and feature counts
- Backend logs show staggered startup: earthquakes at 522ms, weather at 3647ms
- All weather features have non-null geometry (filtering confirmed)
- Severity values are numeric: earthquakes 0-1 (mag/10), weather 0.1-1.0 (severity map)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend data pipeline fully operational, ready for frontend integration (Plan 01-03)
- BaseFetcher pattern established -- adding new data sources in Phase 2+ requires only writing one fetcher file
- Socket.IO rooms ready for frontend subscription
- REST endpoints ready for initial data load on page load
- All 10 requirements completed (BACK-01 through BACK-07, DEPL-03, EQKE-01, WTHR-01)

## Self-Check: PASSED

All 13 files verified present. Both task commits (8f1a751, 620c6be) confirmed in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-10*
