---
phase: 01-foundation
plan: 01
subsystem: infra, ui
tags: [cesiumjs, resium, fastify5, redis, docker, nginx, vite, socket.io, typescript]

# Dependency graph
requires:
  - phase: none
    provides: first plan in project
provides:
  - Docker Compose stack with redis, backend, nginx (3 services)
  - CesiumJS globe with terrain, day/night lighting, atmosphere, fog
  - SearchBar with Ion geocoder and coordinate parsing
  - CoordinateDisplay with ScreenSpaceEventHandler
  - Shared LayerFeature/LayerFeatureCollection GeoJSON types
  - cesiumHelpers utility (magnitudeToColor, severityToColor)
  - Vite config with vite-plugin-static-copy for Cesium assets
  - nginx reverse proxy with WebSocket upgrade for /socket.io/
  - Backend stub with Fastify 5 /api/health endpoint on port 4010
affects: [01-02, 01-03, all-future-phases]

# Tech tracking
tech-stack:
  added: [cesium@1.139, resium@1.19, react@19, fastify@5, socket.io@4.8, redis@5, zustand@5, vite@6, vite-plugin-static-copy, node-cron@3]
  patterns: [viteStaticCopy for CesiumJS assets, Terrain.fromWorldTerrain(), requestRenderMode, useEffect for viewer configuration, getViewer callback pattern]

key-files:
  created:
    - .env.example
    - frontend/src/types/geojson.ts
    - frontend/src/utils/cesiumHelpers.ts
    - frontend/src/App.css
    - frontend/src/env.d.ts
    - frontend/src/components/Globe.tsx
    - frontend/src/components/SearchBar.tsx
    - frontend/src/components/CoordinateDisplay.tsx
    - backend/src/types/geojson.ts
    - nginx/Dockerfile
    - nginx/nginx.conf
  modified:
    - docker-compose.yml
    - .env
    - .gitignore
    - frontend/package.json
    - frontend/vite.config.ts
    - frontend/tsconfig.json
    - frontend/index.html
    - frontend/src/main.tsx
    - frontend/src/App.tsx
    - backend/package.json
    - backend/tsconfig.json
    - backend/Dockerfile
    - backend/src/index.ts

key-decisions:
  - "Used pre-built frontend approach instead of multi-stage Docker build due to Proxmox PVE kernel restrictions on esbuild process spawning"
  - "Added security_opt seccomp/apparmor unconfined for nginx container due to Proxmox socketpair restriction"
  - "Used useEffect with retry polling instead of Resium onReady prop for viewer configuration (onReady not in Resium types)"
  - "Used getViewer callback pattern to share viewer ref with child components"

patterns-established:
  - "viteStaticCopy: Copy Cesium Workers/Assets/ThirdParty/Widgets to cesiumStatic/ path"
  - "Globe children pattern: pass getViewer callback to child components for viewer access"
  - "CoordinateDisplay retry: poll for viewer availability with setTimeout retries on mount"
  - "No StrictMode: never wrap CesiumJS/Resium components in React.StrictMode"

requirements-completed: [GLOB-01, GLOB-02, GLOB-03, GLOB-06, GLOB-07, DEPL-01, DEPL-02, DEPL-04, DEPL-05, DEPL-06]

# Metrics
duration: 86min
completed: 2026-03-10
---

# Phase 1 Plan 01: Project Scaffolding Summary

**CesiumJS 3D globe with terrain/lighting/atmosphere, Docker Compose 3-service stack (redis + Fastify 5 backend + nginx), vite-plugin-static-copy replacing abandoned vite-plugin-cesium**

## Performance

- **Duration:** 86 min
- **Started:** 2026-03-10T16:21:41Z
- **Completed:** 2026-03-10T17:48:16Z
- **Tasks:** 3
- **Files modified:** 30

## Accomplishments
- Replaced broken skeleton with correct stack: Fastify 5, Socket.IO 4.8, node-redis v5, vite-plugin-static-copy (all 6 audit issues resolved)
- CesiumJS globe renders with Cesium Ion terrain, day/night lighting cycle, atmosphere, fog, and requestRenderMode for idle CPU savings
- SearchBar with Ion geocoder (city names) and direct coordinate parsing (lat, lng format)
- CoordinateDisplay shows live lat/lng as cursor moves over globe
- Docker Compose builds and runs all 3 services; nginx proxies /api/ and /socket.io/ to backend:4010
- Shared GeoJSON types (LayerFeature, LayerFeatureCollection) in both frontend and backend

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace skeleton with correct stack** - `266fc53` (feat)
2. **Task 2: CesiumJS globe with terrain, lighting, search, coordinate display** - `3e6c88d` (feat)
3. **Task 3: Docker build verified, TypeScript clean, all endpoints working** - `fa6c334` (feat)

## Files Created/Modified
- `docker-compose.yml` - 3-service stack: redis, backend, nginx
- `.env` / `.env.example` - Environment config with PORT=4010
- `.gitignore` - Cleaned up, removed .dockerignore entry
- `frontend/package.json` - cesium@1.139, resium@1.19, vite-plugin-static-copy
- `frontend/vite.config.ts` - viteStaticCopy for Cesium assets, server proxy
- `frontend/src/main.tsx` - No StrictMode, Ion token from env
- `frontend/src/App.tsx` - Renders Globe full screen
- `frontend/src/App.css` - Full screen styles, coordinate/search positioning
- `frontend/src/components/Globe.tsx` - Resium Viewer with Terrain.fromWorldTerrain()
- `frontend/src/components/SearchBar.tsx` - Ion geocoder + coordinate parsing
- `frontend/src/components/CoordinateDisplay.tsx` - ScreenSpaceEventHandler MOUSE_MOVE
- `frontend/src/types/geojson.ts` - LayerFeature, LayerFeatureCollection
- `frontend/src/utils/cesiumHelpers.ts` - magnitudeToColor, severityToColor
- `backend/package.json` - fastify@5, socket.io@4.8, redis@5
- `backend/src/index.ts` - Minimal Fastify stub with /api/health
- `backend/src/types/geojson.ts` - Shared GeoJSON types (same as frontend)
- `nginx/Dockerfile` - Copies pre-built frontend dist to nginx:alpine
- `nginx/nginx.conf` - Reverse proxy with WebSocket upgrade, cesiumStatic caching

## Decisions Made
- **Pre-built frontend instead of multi-stage Docker build**: Proxmox PVE kernel blocks esbuild process spawning (`spawn sh EACCES`) in Docker containers. The workaround is to build the frontend on the host and copy `dist/` into the nginx container. This affects deployment workflow (must run `npm run build` in frontend/ before `docker compose build`).
- **security_opt for nginx**: Proxmox blocks `socketpair()` in Docker, preventing nginx worker spawning. Added `seccomp:unconfined` and `apparmor:unconfined`.
- **useEffect instead of onReady**: Resium's TypeScript types don't include `onReady` prop. Used `useEffect` with retry polling to configure viewer scene after mount.
- **getViewer callback pattern**: Rather than React context or forwarded refs, pass a simple `() => Viewer | null` callback to child components for viewer access.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Docker esbuild spawn restriction on Proxmox**
- **Found during:** Task 3 (Docker build)
- **Issue:** node:22-alpine and node:22-slim both fail on `npm install` because esbuild postinstall tries to `spawn sh` which Proxmox PVE kernel blocks
- **Fix:** Used `--ignore-scripts` for backend builder stage, switched nginx to pre-built frontend approach
- **Files modified:** backend/Dockerfile, nginx/Dockerfile, docker-compose.yml
- **Verification:** `docker compose build` succeeds for all services
- **Committed in:** fa6c334

**2. [Rule 3 - Blocking] Nginx socketpair permission denied on Proxmox**
- **Found during:** Task 3 (Docker verification)
- **Issue:** nginx:alpine worker processes fail with `socketpair() failed (13: Permission denied)`
- **Fix:** Added `security_opt: [seccomp:unconfined, apparmor:unconfined]` to nginx service
- **Files modified:** docker-compose.yml
- **Verification:** nginx starts and serves requests successfully
- **Committed in:** fa6c334

**3. [Rule 1 - Bug] TypeScript errors in Globe.tsx**
- **Found during:** Task 3 (TypeScript verification)
- **Issue:** `skyAtmosphere` possibly undefined, `onReady` prop not in Resium Viewer types
- **Fix:** Added null check for skyAtmosphere, replaced onReady with useEffect retry pattern
- **Files modified:** frontend/src/components/Globe.tsx
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** fa6c334

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for the build to succeed in the Proxmox environment. The pre-built frontend approach is a pragmatic workaround; a future plan could add a build script or Makefile to automate `npm run build && docker compose build`.

## Issues Encountered
- Proxmox PVE kernel restricts `socketpair()` and process spawning in Docker containers, affecting both esbuild (build tools) and nginx (worker processes). This is a known Proxmox limitation. The workarounds are documented in Decisions Made above.

## User Setup Required
None - no external service configuration required. The CESIUM_ION_TOKEN in `.env` is optional for build/run (globe will show low-res ellipsoid without it).

## Next Phase Readiness
- Foundation is ready for Plan 01-02 (Fastify 5 backend with Redis, Socket.IO, BaseFetcher pattern)
- Globe renders and is accessible at http://localhost:3010
- Backend stub ready to be replaced with full implementation
- nginx proxy configured for both /api/ and /socket.io/ paths

## Self-Check: PASSED

All 10 key files verified present. All 3 task commits verified in git log.

---
*Phase: 01-foundation*
*Completed: 2026-03-10*
