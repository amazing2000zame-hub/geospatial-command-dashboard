# Roadmap: Real-Time 3D Geospatial Command Dashboard

## Overview

This roadmap delivers a self-hosted 3D geospatial command dashboard in 4 phases. Phase 1 builds the complete end-to-end pipeline: CesiumJS globe, Fastify backend, Redis cache, Docker Compose deployment, WebSocket updates, and two proof-of-concept data layers (earthquakes + weather alerts) to validate the architecture. Phase 2 adds the high-value core layers -- live flight tracking, 336K ALPR cameras with Supercluster clustering, speed cameras, and satellite tracking -- plus the layer management UI. Phase 3 brings incident-oriented layers (crime, fire/EMS, police scanner audio, traffic) with time-range filtering. Phase 4 completes the vision with GLSL visual modes (night vision, thermal, CRT), remaining data layers (wildfires, air quality, military aircraft), and control panel polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - CesiumJS globe, Fastify backend, Redis, Docker Compose, WebSocket pipeline, earthquake + weather proof-of-concept layers
- [ ] **Phase 2: Core Layers** - Flight tracking, ALPR/speed cameras with Supercluster, satellite tracking, layer management UI
- [ ] **Phase 3: Incident Layers** - Crime data, fire/EMS dispatch, police scanner audio, traffic incidents, time-range filtering
- [ ] **Phase 4: Visual Modes & Polish** - Night vision/thermal/CRT shaders, wildfires, air quality, military aircraft

## Phase Details

### Phase 1: Foundation
**Goal**: User opens the dashboard and sees a working 3D globe with live earthquake markers and weather alert polygons updating in real-time, deployed as a single Docker Compose stack
**Depends on**: Nothing (first phase)
**Requirements**: GLOB-01, GLOB-02, GLOB-03, GLOB-06, GLOB-07, EQKE-01, EQKE-02, EQKE-03, WTHR-01, WTHR-02, WTHR-03, BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06
**Success Criteria** (what must be TRUE):
  1. User navigates to http://192.168.1.65:3010 and sees a photorealistic 3D globe with terrain, satellite imagery, day/night cycle, and atmosphere
  2. User can rotate, zoom, tilt the globe smoothly and fly to a city via the search bar, with lat/lng coordinates updating as the cursor moves
  3. User sees earthquake markers (sized by magnitude, color-coded) appearing on the globe and updating every 60 seconds without page refresh
  4. User sees NWS weather alert polygons (colored by severity) on the globe and can click them to see alert details
  5. Running `docker compose up` on the management VM starts the entire stack (frontend, backend, Redis) and the dashboard is accessible within 30 seconds
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding, Docker Compose (3 services), nginx reverse proxy, CesiumJS globe with terrain/lighting/atmosphere
- [x] 01-02-PLAN.md -- Fastify 5 backend, Redis cache, Socket.IO WebSocket, BaseFetcher pattern, USGS earthquake + NWS weather fetchers
- [x] 01-03-PLAN.md -- Frontend earthquake/weather rendering, click popups, status bar, live data integration

### Phase 2: Core Layers
**Goal**: User sees live commercial flights, 336K ALPR cameras, speed cameras, and satellite orbits on the globe with a control panel to toggle layers on/off
**Depends on**: Phase 1
**Requirements**: LAYR-01, LAYR-02, LAYR-03, LAYR-04, LAYR-05, LAYR-06, FLIT-01, FLIT-02, FLIT-03, FLIT-04, SPCM-01, SPCM-02, SPCM-03, ALPR-01, ALPR-02, ALPR-03, ALPR-04, SATL-01, SATL-02, SATL-03
**Success Criteria** (what must be TRUE):
  1. User sees a control panel with toggles for each data layer, showing status (active/loading/error/disabled) and point counts per layer
  2. User sees ~6,700 live aircraft with airplane icons rotated to heading, updating every 10 seconds, and can click one to see callsign, altitude, speed, and origin country
  3. User sees 336K ALPR cameras clustered into aggregated markers when zoomed out, expanding to individual markers when zoomed in, without browser performance degradation
  4. User sees speed camera locations and can click one to see speed limit and camera type
  5. User sees satellite orbital paths with positions updating in real-time, and can click a satellite to see name, NORAD ID, and orbit info
**Plans**: TBD

Plans:
- [ ] 02-01: Layer management UI, control panel, toggle system, status indicators
- [ ] 02-02: OpenSky flight tracking with OAuth2, aircraft rendering with trail lines
- [ ] 02-03: ALPR cameras with Supercluster Web Worker, speed cameras via Overpass API
- [ ] 02-04: Satellite tracking with satellite.js, CelesTrak TLE data

### Phase 3: Incident Layers
**Goal**: User sees crime incidents, fire/EMS dispatches, traffic incidents, and can play police scanner audio, with time-range filtering across incident layers
**Depends on**: Phase 2
**Requirements**: CRIM-01, CRIM-02, CRIM-03, CRIM-04, FIRE-01, FIRE-02, FIRE-03, SCAN-01, SCAN-02, SCAN-03, TRFC-01, TRFC-02, TRFC-03, TIME-01, TIME-02, TIME-03
**Success Criteria** (what must be TRUE):
  1. User sees crime incidents on the globe with distinct icons by type (assault, theft, etc.) and can click to see type, date, location, and description
  2. User sees real-time fire/EMS dispatches with incident type markers and can click for agency, type, and timestamp details
  3. User can select a region and play live police scanner audio from OpenMHz, with an audio player embedded in the control panel
  4. User sees traffic incidents categorized by type (accident, construction, closure, hazard) and can click for details and estimated clearance
  5. User can filter crime, fire, and traffic layers by time range (last hour, 24 hours, 7 days) and the globe updates to show only matching incidents
**Plans**: TBD

Plans:
- [ ] 03-01: Socrata crime data fetcher, city configuration, crime markers with category icons
- [ ] 03-02: PulsePoint fire/EMS, traffic incidents, time-range filtering UI and backend
- [ ] 03-03: OpenMHz police scanner audio player, region selection, control panel integration

### Phase 4: Visual Modes & Polish
**Goal**: User can switch between standard, night vision, thermal, and CRT visual modes, and sees wildfire hotspots, air quality data, and military aircraft as additional layers
**Depends on**: Phase 3
**Requirements**: GLOB-04, GLOB-05, MILT-01, MILT-02, MILT-03, WLDF-01, WLDF-02, WLDF-03, AIRQ-01, AIRQ-02, AIRQ-03
**Success Criteria** (what must be TRUE):
  1. User can switch between Standard, Night Vision, Thermal, and CRT visual modes via the control panel, with GLSL shaders applying instantly at 60fps
  2. User sees active wildfire hotspots from NASA FIRMS with thermal intensity indicators, updating every 3 hours
  3. User sees air quality index data as colored markers or heatmap overlay, updating hourly
  4. User sees military aircraft with distinct yellow markers separate from commercial flights, and can click to see aircraft type, callsign, and altitude
**Plans**: TBD

Plans:
- [ ] 04-01: GLSL post-processing shaders for night vision, thermal, and CRT modes
- [ ] 04-02: NASA FIRMS wildfires, OpenAQ air quality, ADS-B military aircraft fetchers and rendering
- [ ] 04-03: Control panel polish, mode switcher UI, final integration testing

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-03-10 |
| 2. Core Layers | 0/4 | In Progress | - |
| 3. Incident Layers | 0/3 | Not started | - |
| 4. Visual Modes & Polish | 0/3 | Not started | - |
