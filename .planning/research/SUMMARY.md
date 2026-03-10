# Research Summary

**Project:** Real-Time 3D Geospatial Command Dashboard
**Synthesized:** 2026-03-10
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Critical Decisions (Validated by Research)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Globe engine | CesiumJS 1.139.1 + Resium 1.19.4 | Native 3D Tiles, satellite orbit support, PostProcessStage for shaders, Apache 2.0 |
| Build tool | Vite 6.x + `vite-plugin-static-copy` | `vite-plugin-cesium` is abandoned. Use official CesiumGS approach |
| Backend framework | Fastify 5.x | 2-3x faster than Express, first-class TypeScript, JSON schema validation |
| WebSocket | Socket.IO 4.8.3 (manual attach to `fastify.server`) | `fastify-socket.io` plugin doesn't support Fastify 5. Manual attach is 3 lines |
| Cache | node-redis 5.11.0 | Official Redis recommendation over ioredis for new projects |
| State management | Zustand 5.x | Lighter than Redux for layer toggles and visual mode state |
| Clustering | Supercluster 8.0.1 in Web Worker | Handles 336K+ ALPR points; EntityCluster caps at ~10K |
| Satellite math | satellite.js 6.0.2 | SGP4/SDP4 propagation; returns km (CesiumJS expects meters — multiply by 1000) |
| Rendering strategy | Imperative (BillboardCollection/PointPrimitiveCollection) | Entity API leaks memory on dynamic updates; Primitive API allows in-place updates |

## Architecture Summary

### System Overview
```
Browser (React + CesiumJS)
    |
    | HTTP (initial load) + WebSocket (live updates)
    |
nginx reverse proxy (:3010)
    |
    +---> /            -> frontend static files (Vite build)
    +---> /api/*       -> backend container (:3011)
    +---> /socket.io/* -> backend container (:3011, WebSocket upgrade)
    |
Backend (Fastify + Socket.IO) (:3011)
    |
    +---> Redis (:6379) - TTL cache per data source
    +---> 17 External APIs (polled on independent schedules)
```

### Data Flow
1. Scheduler triggers fetcher (per-source cron interval)
2. Fetcher calls external API
3. Fetcher normalizes response → unified GeoJSON FeatureCollection
4. Normalized data written to Redis with source-specific TTL
5. Socket.IO emits to layer-specific room (e.g., `layer:flights`)
6. Connected browsers in that room receive FeatureCollection
7. Frontend updates CesiumJS primitives imperatively (no React re-render)

### Key Patterns
- **One CustomDataSource per layer** — O(1) toggle via `dataSource.show`
- **One fetcher file per API source** — crash isolation, one source failing doesn't affect others
- **`suspendEvents()` / `resumeEvents()`** — mandatory for bulk entity updates (prevents 6700 events per flight update)
- **Full layer replacement** over delta patches — data is small enough when compressed, avoids state divergence
- **`requestRenderMode: true`** — drops idle CPU from ~100% to ~0%

## Data Source Readiness

### Tier 1 — Ready for Phase 1 (free, well-documented, no auth complexity)
| Source | API | Auth | Rate Limit | Format |
|--------|-----|------|------------|--------|
| USGS Earthquakes | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson` | None | Unlimited | GeoJSON |
| NWS Weather Alerts | `api.weather.gov/alerts/active` | None (User-Agent required) | Generous | GeoJSON |

### Tier 2 — Ready for Phase 2 (free, simple auth or static data)
| Source | API | Auth | Notes |
|--------|-----|------|-------|
| OpenSky Network | `opensky-network.org/api/states/all` | **OAuth2** (Basic Auth dead March 18, 2026) | 4,000 credits/day authenticated |
| NASA FIRMS | `firms.modaps.eosdis.nasa.gov/api` | MAP_KEY (free registration) | Wildfire hotspots |
| CelesTrak | `celestrak.org/NORAD/elements/gp.php` | None | Use JSON/OMM format (TLE being deprecated) |
| OpenAQ | `api.openaq.org/v3` | API key (free) | Air quality |
| DeFlock/ALPR | GitHub static dataset | None | 336K cameras, 102MB GeoJSON, load once |
| OSM Overpass | `overpass-api.de/api/interpreter` | None | Speed cameras, heavy rate limits |

### Tier 3 — Phase 3+ (requires per-source config or paid)
| Source | Notes |
|--------|-------|
| Socrata/SODA Crime | Per-city app tokens, format varies |
| State 511/DOT Traffic | Fragmented, per-state APIs |
| ADS-B Exchange Military | **Only paid API** ($10/mo via RapidAPI) — consider OpenSky ICAO hex filtering as free alternative |

### Tier 4 — Defer or Best-Effort
| Source | Risk |
|--------|------|
| PulsePoint | **No public API** — unofficial web endpoint, can break without notice |
| OpenMHz | Community-documented, no official API |
| Broadcastify | ToS restrictions on programmatic access |

## Critical Pitfalls to Avoid

### P1: Memory Leaks (CesiumJS Entity API)
- Entity add/remove leaks memory via `AssociativeArray`
- **Fix:** Use Primitive API (BillboardCollection/PointPrimitiveCollection) for all dynamic layers
- Entity API OK only for static/infrequent layers (weather polygons)

### P2: React + Resium Re-rendering
- Unstable CesiumJS object references cause full component destruction
- **Fix:** `useMemo` all CesiumJS objects, disable StrictMode around Viewer, shallow component hierarchy

### P3: 336K ALPR Browser Crash
- Raw GeoJSON parse blocks main thread 5-15 seconds, GPU texture atlas exhaustion
- **Fix:** Web Worker + Supercluster pre-clustering, viewport-based loading, PointPrimitiveCollection

### P4: OpenSky OAuth2 (March 18, 2026 deadline)
- All existing npm packages and tutorials use deprecated Basic Auth
- **Fix:** Implement OAuth2 client credentials from day one, token refresh every 30 min

### P5: Thundering Herd on Restart
- 17 APIs all polling at t=0 on container start triggers rate limits
- **Fix:** Stagger startup with random jitter per fetcher

### P6: Docker WebSocket Networking
- Frontend nginx proxying to `localhost` connects to nothing inside containers
- **Fix:** Use Docker service names, explicit `Upgrade`/`Connection` headers in nginx config

### P7: GLSL Shader Conflicts
- Custom PostProcessStage conflicts with CesiumJS pick/EDL shaders
- **Fix:** Isolated testing against all active layers, use `czm_selected` flag pattern

### P8: CesiumJS Ion Token Required
- Without Ion token, globe falls back to featureless ellipsoid
- **Fix:** Set as environment variable from day one, free tier gives 5GB + 15GB/month streaming

## Built-in CesiumJS Features (No Custom Code Needed)
- Night vision: `PostProcessStageLibrary.createNightVisionStage()`
- Day/night cycle: `scene.globe.enableLighting = true`
- Atmosphere: SkyAtmosphere + SkyBox (defaults)
- Geocoder search: Built-in widget
- Navigation controls: HomeButton, NavigationHelpButton
- Entity tracking: `viewer.trackedEntity`

## Phase Mapping Recommendation

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| 1: Foundation | Globe + Backend + Docker | CesiumJS viewer, Fastify backend, Redis, Docker Compose, nginx, WebSocket pipeline, USGS earthquakes + NWS weather as first layers |
| 2: Core Layers | Flight tracking + dense data | OpenSky flights (OAuth2), Supercluster + ALPR cameras, speed cameras, satellite tracking |
| 3: Incident Layers | Crime + fire + traffic + scanner | Socrata crime, PulsePoint (best-effort), OpenMHz audio, traffic, time filtering |
| 4: Visual & Polish | Shaders + remaining layers | Night vision/thermal/CRT modes, wildfires, air quality, military aircraft, control panel polish |

## Open Questions for Implementation
1. DeFlock dataset exact format — static file download or API query?
2. Socket.IO vs raw `ws` — architecture research recommends `ws` for lower overhead, stack research recommends Socket.IO for reconnect. **Decision needed at Phase 1.**
3. OpenSky OAuth2 token refresh behavior under sustained 10s polling
4. Cesium Ion free tier current exact streaming quota
5. PulsePoint — worth attempting or skip entirely for v1?

---
*Synthesized from 4 research documents totaling 3,533 lines of analysis*
