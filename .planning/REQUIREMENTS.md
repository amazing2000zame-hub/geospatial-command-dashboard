# Requirements: Real-Time 3D Geospatial Command Dashboard

**Defined:** 2026-03-10
**Core Value:** Real-time situational awareness via a stunning 3D globe with 17+ live data layers

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Globe & Rendering

- [ ] **GLOB-01**: User sees a photorealistic 3D globe with terrain and satellite imagery on page load
- [ ] **GLOB-02**: User can rotate, zoom, and tilt the globe with smooth mouse/touch controls
- [ ] **GLOB-03**: User sees day/night cycle with atmosphere rendering
- [ ] **GLOB-04**: User can switch between visual modes: Standard, Night Vision, Thermal, CRT
- [ ] **GLOB-05**: Visual modes apply GLSL post-processing shaders at 60fps on client GPU
- [ ] **GLOB-06**: User can fly to specific coordinates or city via search bar
- [ ] **GLOB-07**: User sees coordinate display (lat/lng) as cursor moves over globe

### Layer Management

- [ ] **LAYR-01**: User can toggle individual data layers on/off via control panel
- [ ] **LAYR-02**: User sees layer status indicators (active, loading, error, disabled)
- [ ] **LAYR-03**: Layers load data independently (one failing doesn't affect others)
- [ ] **LAYR-04**: User sees data point count per active layer
- [ ] **LAYR-05**: Dense data points cluster into aggregated markers when zoomed out (Supercluster)
- [ ] **LAYR-06**: Individual markers appear when zoomed in past clustering threshold

### Flight Tracking

- [ ] **FLIT-01**: User sees ~6,700 live commercial aircraft with airplane icons rotated to heading
- [ ] **FLIT-02**: Aircraft markers update position every 10 seconds via WebSocket
- [ ] **FLIT-03**: User clicks aircraft to see popup: callsign, altitude, speed, origin country
- [ ] **FLIT-04**: Aircraft show fading trail lines for last 30 seconds of path

### Earthquake Data

- [ ] **EQKE-01**: User sees global earthquake events updated every 60 seconds
- [ ] **EQKE-02**: Earthquake markers sized by magnitude with color gradient
- [ ] **EQKE-03**: User clicks earthquake to see popup: magnitude, depth, location, time

### Speed Cameras

- [ ] **SPCM-01**: User sees speed camera locations from OpenStreetMap Overpass API
- [ ] **SPCM-02**: User clicks camera marker to see speed limit and camera type
- [ ] **SPCM-03**: Camera data cached locally with daily refresh

### ALPR / Flock Cameras

- [ ] **ALPR-01**: User sees 336K+ ALPR camera locations from DeFlock dataset
- [ ] **ALPR-02**: Cameras clustered into density heatmap when zoomed out
- [ ] **ALPR-03**: Individual camera markers visible when zoomed in
- [ ] **ALPR-04**: User clicks camera to see agency and data-sharing network info

### Crime & Police Data

- [ ] **CRIM-01**: User sees crime incidents from city open data portals (Socrata/SODA API)
- [ ] **CRIM-02**: Crime markers categorized by type with distinct icons (assault, theft, etc.)
- [ ] **CRIM-03**: User clicks incident to see type, date, location, description
- [ ] **CRIM-04**: Crime data configurable per city (add/remove city data sources)

### Fire & EMS

- [ ] **FIRE-01**: User sees real-time fire/EMS dispatches from PulsePoint
- [ ] **FIRE-02**: Dispatch markers show incident type (fire, medical, hazmat)
- [ ] **FIRE-03**: User clicks dispatch to see agency, incident type, timestamp

### Police Scanner Audio

- [ ] **SCAN-01**: User can play live police scanner audio from OpenMHz per region
- [ ] **SCAN-02**: Scanner audio player embedded in control panel
- [ ] **SCAN-03**: User can select different scanner feeds by region/agency

### Satellite Tracking

- [ ] **SATL-01**: User sees satellite orbital paths calculated from CelesTrak TLE data
- [ ] **SATL-02**: Satellite positions update in real-time using satellite.js
- [ ] **SATL-03**: User clicks satellite to see name, NORAD ID, orbit info

### Military Aircraft

- [ ] **MILT-01**: User sees military aircraft from ADS-B Exchange with distinct markers
- [ ] **MILT-02**: Military aircraft markers colored differently from commercial (yellow)
- [ ] **MILT-03**: User clicks to see aircraft type, callsign, altitude

### Weather Alerts

- [ ] **WTHR-01**: User sees active NWS weather alerts as polygon overlays
- [ ] **WTHR-02**: Alerts colored by severity (watch, warning, advisory)
- [ ] **WTHR-03**: User clicks alert polygon to see details and affected area

### Wildfire Data

- [ ] **WLDF-01**: User sees active wildfire hotspots from NASA FIRMS
- [ ] **WLDF-02**: Fire markers indicate thermal intensity
- [ ] **WLDF-03**: Data updates every 3 hours (matching satellite passes)

### Air Quality

- [ ] **AIRQ-01**: User sees air quality index from OpenAQ/EPA AirNow
- [ ] **AIRQ-02**: AQI data displayed as colored markers or heatmap overlay
- [ ] **AIRQ-03**: Data updates hourly

### Traffic Incidents

- [ ] **TRFC-01**: User sees traffic incidents from state 511/DOT feeds
- [ ] **TRFC-02**: Incidents categorized: accident, construction, closure, hazard
- [ ] **TRFC-03**: User clicks to see incident details and estimated clearance

### Time Filtering

- [ ] **TIME-01**: User can filter incident data by time range: last hour, 24h, 7 days
- [ ] **TIME-02**: Time filter applies to crime, fire, traffic layers
- [ ] **TIME-03**: Filter UI shows current time range selection

### Backend & Infrastructure

- [ ] **BACK-01**: Node.js backend polls 17 external APIs on configurable schedules
- [ ] **BACK-02**: All API responses normalized to unified GeoJSON FeatureCollections
- [ ] **BACK-03**: Redis caches API responses with per-source TTL matching rate limits
- [ ] **BACK-04**: WebSocket server pushes real-time updates to all connected browsers
- [ ] **BACK-05**: Backend serves REST endpoints for initial data load per layer
- [ ] **BACK-06**: Each data source is isolated in its own fetcher file (one per source)
- [ ] **BACK-07**: Config file defines all API endpoints, keys, poll intervals

### Deployment

- [ ] **DEPL-01**: Entire stack deploys via single `docker compose up` command
- [ ] **DEPL-02**: Frontend served by nginx container on port 3010
- [ ] **DEPL-03**: Backend runs on port 4010 with WebSocket support
- [ ] **DEPL-04**: Redis container with persistent volume for cache data
- [ ] **DEPL-05**: Environment variables for all API keys/tokens via .env file
- [ ] **DEPL-06**: Dashboard accessible at http://192.168.1.65:3010

## v2 Requirements

### Enhanced Data

- **V2-01**: PostgreSQL + PostGIS for historical incident storage and spatial queries
- **V2-02**: Ship traffic from MarineTraffic/AISHub AIS data
- **V2-03**: Nuclear facility locations from NRC/IAEA
- **V2-04**: Citizen App incident integration (if official API emerges)
- **V2-05**: FBI Crime Data Explorer for historical crime statistics heatmaps

### Advanced Features

- **V2-06**: Keyboard shortcuts for city jumping and mode switching
- **V2-07**: Traffic particle simulation using OSM road networks
- **V2-08**: Incident timeline playback (scrub through historical data)
- **V2-09**: Custom alert rules (notify when earthquake > 5.0 near location)
- **V2-10**: Home Assistant integration panel embedding
- **V2-11**: SpotCrime API integration for broader crime data

### Performance

- **V2-12**: WebWorkers for heavy data processing off main thread
- **V2-13**: Viewport culling (only load data for visible region)
- **V2-14**: Level-of-detail system beyond Supercluster

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / authentication | Personal self-hosted dashboard, single user |
| Mobile native app | Web responsive is sufficient, CesiumJS works on mobile browsers |
| Citizen App scraping | Unofficial API, hostile to 3rd party, legally gray |
| CrimeMapping scraping | No official API, requires reverse-engineering |
| Real-time video feeds | Bandwidth-heavy, most DOT cameras require paid API |
| Custom domain / SSL | Internal network only, existing DuckDNS available if needed |
| AI-powered incident classification | Over-engineering for v1, add if scanner audio transcription works |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GLOB-01 | Phase 1 | Pending |
| GLOB-02 | Phase 1 | Pending |
| GLOB-03 | Phase 1 | Pending |
| GLOB-04 | Phase 4 | Pending |
| GLOB-05 | Phase 4 | Pending |
| GLOB-06 | Phase 1 | Pending |
| GLOB-07 | Phase 1 | Pending |
| LAYR-01 | Phase 2 | Pending |
| LAYR-02 | Phase 2 | Pending |
| LAYR-03 | Phase 2 | Pending |
| LAYR-04 | Phase 2 | Pending |
| LAYR-05 | Phase 2 | Pending |
| LAYR-06 | Phase 2 | Pending |
| FLIT-01 | Phase 2 | Pending |
| FLIT-02 | Phase 2 | Pending |
| FLIT-03 | Phase 2 | Pending |
| FLIT-04 | Phase 2 | Pending |
| EQKE-01 | Phase 1 | Pending |
| EQKE-02 | Phase 1 | Pending |
| EQKE-03 | Phase 1 | Pending |
| SPCM-01 | Phase 2 | Pending |
| SPCM-02 | Phase 2 | Pending |
| SPCM-03 | Phase 2 | Pending |
| ALPR-01 | Phase 2 | Pending |
| ALPR-02 | Phase 2 | Pending |
| ALPR-03 | Phase 2 | Pending |
| ALPR-04 | Phase 2 | Pending |
| CRIM-01 | Phase 3 | Pending |
| CRIM-02 | Phase 3 | Pending |
| CRIM-03 | Phase 3 | Pending |
| CRIM-04 | Phase 3 | Pending |
| FIRE-01 | Phase 3 | Pending |
| FIRE-02 | Phase 3 | Pending |
| FIRE-03 | Phase 3 | Pending |
| SCAN-01 | Phase 3 | Pending |
| SCAN-02 | Phase 3 | Pending |
| SCAN-03 | Phase 3 | Pending |
| SATL-01 | Phase 2 | Pending |
| SATL-02 | Phase 2 | Pending |
| SATL-03 | Phase 2 | Pending |
| MILT-01 | Phase 4 | Pending |
| MILT-02 | Phase 4 | Pending |
| MILT-03 | Phase 4 | Pending |
| WTHR-01 | Phase 1 | Pending |
| WTHR-02 | Phase 1 | Pending |
| WTHR-03 | Phase 1 | Pending |
| WLDF-01 | Phase 4 | Pending |
| WLDF-02 | Phase 4 | Pending |
| WLDF-03 | Phase 4 | Pending |
| AIRQ-01 | Phase 4 | Pending |
| AIRQ-02 | Phase 4 | Pending |
| AIRQ-03 | Phase 4 | Pending |
| TRFC-01 | Phase 3 | Pending |
| TRFC-02 | Phase 3 | Pending |
| TRFC-03 | Phase 3 | Pending |
| TIME-01 | Phase 3 | Pending |
| TIME-02 | Phase 3 | Pending |
| TIME-03 | Phase 3 | Pending |
| BACK-01 | Phase 1 | Pending |
| BACK-02 | Phase 1 | Pending |
| BACK-03 | Phase 1 | Pending |
| BACK-04 | Phase 1 | Pending |
| BACK-05 | Phase 1 | Pending |
| BACK-06 | Phase 1 | Pending |
| BACK-07 | Phase 1 | Pending |
| DEPL-01 | Phase 1 | Pending |
| DEPL-02 | Phase 1 | Pending |
| DEPL-03 | Phase 1 | Pending |
| DEPL-04 | Phase 1 | Pending |
| DEPL-05 | Phase 1 | Pending |
| DEPL-06 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 71 total
- Mapped to phases: 71
- Unmapped: 0

**Phase distribution:**
- Phase 1 (Foundation): 24 requirements
- Phase 2 (Core Layers): 20 requirements
- Phase 3 (Incident Layers): 16 requirements
- Phase 4 (Visual Modes & Polish): 11 requirements

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation (revised phase mappings for EQKE, WTHR, SATL, TRFC)*
