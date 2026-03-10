# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Real-time situational awareness via a stunning 3D globe with 17+ live data layers
**Current focus:** Phase 2: Core Layers

## Current Position

Phase: 2 of 4 (Core Layers)
Plan: 0 of 4 in current phase
Status: Planning
Last activity: 2026-03-10 -- Phase 1 complete, site live at :3010 with 281 earthquakes + 31 weather alerts

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 46 min
- Total execution time: 1.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 91 min | 46 min |

**Recent Trend:**
- Last 5 plans: 86min, 5min
- Trend: accelerating

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Moved EQKE + WTHR to Phase 1 as proof-of-concept layers (validates full pipeline end-to-end before adding complex layers)
- [Roadmap]: Moved SATL to Phase 2 (satellite.js math pairs with other real-time tracking layers)
- [Roadmap]: Moved TRFC to Phase 3 (incident layer alongside crime/fire, benefits from time filtering)
- [Research]: OpenSky OAuth2 required (Basic Auth deprecated March 18, 2026) -- must implement from day one in Phase 2
- [Research]: Use Primitive API not Entity API for dynamic layers to avoid memory leaks
- [Research]: Supercluster in Web Worker mandatory for 336K ALPR points
- [01-01]: Pre-built frontend (host build) instead of Docker multi-stage due to Proxmox esbuild spawn restriction
- [01-01]: security_opt seccomp/apparmor unconfined for nginx on Proxmox
- [01-01]: getViewer callback pattern for sharing CesiumJS viewer ref with child components
- [01-01]: useEffect retry polling for viewer configuration (Resium onReady not in types)
- [01-02]: Socket.IO attached AFTER Fastify listen (requires http.Server to be active)
- [01-02]: Cache TTL slightly less than poll interval (55s/60s) ensures fresh data on next cycle
- [01-02]: Random 0-5s jitter on initial fetch prevents thundering herd on restart
- [01-02]: Updated severity type from string to number|null for normalized 0-1 scale

### Pending Todos

None yet.

### Blockers/Concerns

- OpenSky OAuth2 migration deadline (March 18, 2026) -- existing tutorials/packages assume Basic Auth
- PulsePoint has no public API (Phase 3, best-effort)
- ADS-B Exchange military data requires paid API ($10/mo) -- consider OpenSky ICAO hex filtering as free alternative

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 01-02-PLAN.md
Resume file: None
