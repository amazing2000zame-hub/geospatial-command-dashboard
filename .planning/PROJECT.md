# Real-Time 3D Geospatial Command Dashboard

## What This Is

A self-hosted, real-time 3D geospatial command dashboard that aggregates 17+ open-source data feeds into an interactive CesiumJS globe visualization. It displays speed cameras, ALPR/Flock cameras, live police activity, crime incidents, emergency dispatches, traffic incidents, commercial flights, military aircraft, satellites, earthquakes, weather alerts, wildfires, air quality, and ship traffic — all rendered on a photorealistic 3D globe with night vision, thermal, and CRT visual modes. Deployed on the HomeCluster Proxmox environment.

## Core Value

Real-time situational awareness: users open the dashboard and immediately see live global activity across multiple data layers on a smooth, visually stunning 3D globe — like having a command center at home.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] CesiumJS 3D globe with terrain, satellite imagery, and smooth navigation
- [ ] Night vision, thermal, and CRT visual modes via GLSL shaders
- [ ] Layer toggle system (enable/disable individual data sources)
- [ ] Real-time WebSocket updates from backend to frontend
- [ ] OpenSky Network flight tracking (6,700+ aircraft)
- [ ] USGS earthquake feed (GeoJSON, every 60 seconds)
- [ ] OpenStreetMap speed camera data via Overpass API
- [ ] DeFlock/EFF ALPR camera locations (336K+ cameras)
- [ ] SpotCrime/city open data crime incidents
- [ ] PulsePoint fire/EMS real-time dispatch
- [ ] OpenMHz/Broadcastify police scanner audio streams
- [ ] CelesTrak satellite orbit tracking
- [ ] ADS-B Exchange military aircraft layer
- [ ] NWS weather alerts overlay
- [ ] NASA FIRMS wildfire hotspots
- [ ] OpenAQ/EPA air quality data
- [ ] State 511/DOT traffic incidents
- [ ] Supercluster point aggregation for dense data
- [ ] Time-based filtering (last hour, 24h, week)
- [ ] Incident detail popups with metadata
- [ ] Control panel UI (layer toggles, search, mode switching)
- [ ] Redis caching layer for API rate limit management
- [ ] Docker Compose deployment (frontend, backend, redis)
- [ ] Day/night cycle and atmosphere rendering

### Out of Scope

- Citizen App integration — unofficial API, legally gray, endpoints break frequently
- CrimeMapping scraping — no official API, requires reverse-engineering
- User accounts/authentication — personal dashboard, no multi-user needed
- Mobile app — web-first, responsive design sufficient
- PostgreSQL/PostGIS — defer to v2, Redis cache sufficient for v1
- Ship traffic (MarineTraffic/AISHub) — defer to v2, paid API for useful data

## Context

- **Inspiration:** Former Google Maps PM demo building similar dashboard in ~3 days with AI assistants
- **Feasibility confirmed:** 32-page feasibility report + 31-page proposal completed (March 10, 2026)
- **17 data sources identified:** All free or open-source, verified API accessibility
- **Resource requirements:** ~3 CPU cores, ~2 GB RAM (2.2% of cluster capacity)
- **Deployment target:** Management VM (192.168.1.65:3010) or Home node (192.168.1.50)
- **Tech stack decided:** CesiumJS + React/Resium + Node.js/TypeScript + Redis + WebSocket
- **Existing cluster:** 4 Proxmox nodes (42 CPUs, 90 GB RAM), Docker on 3 nodes
- **Reference docs:** `/root/Geospatial_Dashboard_Feasibility_Report.pdf`, `/root/Geospatial_Dashboard_Proposal.pdf`

## Constraints

- **Tech Stack**: CesiumJS + React/Resium frontend, Node.js/TypeScript backend — decided per feasibility analysis
- **Hosting**: Self-hosted on HomeCluster Proxmox (no cloud costs)
- **Cost**: $0 recurring (all free-tier APIs and open-source libraries)
- **API Rate Limits**: Must respect per-source rate limits via Redis TTL caching
- **Legal**: Only use official/open APIs, no scraping of services without public APIs
- **Performance**: 60fps globe rendering (client GPU), sub-second WebSocket updates
- **Browser**: WebGL2 required for CesiumJS and GLSL shaders

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CesiumJS over Mapbox/deck.gl | Native 3D Tiles, satellite orbit support, Apache 2.0 license, same tech as reference video | — Pending |
| React + Resium over raw CesiumJS | Declarative React wrappers for CesiumJS, largest ecosystem for UI components | — Pending |
| Node.js/TypeScript backend | Non-blocking I/O for concurrent API polling, native WebSocket, type safety across 17 data schemas | — Pending |
| Redis over PostgreSQL for v1 | In-memory speed, TTL matches API rate limits, minimal resources, defer PostGIS to v2 | — Pending |
| Deploy on Management VM | Already the dashboard hub (Homepage, Uptime Kuma, WebUI), centralized access at 192.168.1.65 | — Pending |
| Docker Compose deployment | Single `docker compose up` deploys entire stack, consistent with cluster patterns | — Pending |
| Supercluster for point aggregation | Handles 336K+ ALPR points without browser crashes, hierarchical spatial indexing | — Pending |
| Custom GLSL shaders for visual modes | Night vision, thermal, CRT effects run on client GPU at 60fps, zero server cost | — Pending |

---
*Last updated: 2026-03-10 after initialization*
