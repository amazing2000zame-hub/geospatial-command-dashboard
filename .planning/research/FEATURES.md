# Feature Landscape

**Domain:** Real-time 3D geospatial command dashboard (CesiumJS-based, 17+ live data feeds)
**Researched:** 2026-03-10
**Overall confidence:** HIGH (corroborated by multiple live reference implementations: WorldView, WorldMonitor, Flightradar24, kepler.gl)

---

## Table Stakes

Features users expect from a geospatial command dashboard. Missing any of these makes the product feel broken or amateur.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Interactive 3D globe with pan/zoom/rotate | Any geospatial product since Google Earth (2005). CesiumJS provides this out of the box via Viewer. | Low (CesiumJS default) | Must have smooth 60fps navigation. WebGL2 required. |
| Satellite imagery basemap | Reference for spatial context. All flight/weather/wildfire tools use it. | Low (Bing Maps or OSM tile provider included in CesiumJS) | Ion token required for Bing imagery; OSM works free. |
| Layer visibility toggles | 17 simultaneous feeds are unusable without toggle control. Every competitor has this (Flightradar24, kepler.gl, WorldMonitor). | Low-Med | Checkbox/toggle per data source. Must persist across page reload. |
| Click-to-detail popup on entities | Users click any aircraft, earthquake, incident and expect a card with metadata. CesiumJS default InfoBox satisfies this; custom HTML popups preferred. | Med | Use custom React overlay anchored to screen position, not CesiumJS native InfoBox (native InfoBox is ugly and hard to style). |
| Real-time data updates (WebSocket) | Static snapshots are useless for live feeds. FlightAware, Flightradar24, PulsePoint all push live. Users expect markers to move/appear/disappear. | Med-High | Backend polls APIs on schedule; frontend receives diffs via WebSocket. |
| Entity count / status bar | Shows how many aircraft, earthquakes, incidents currently visible. WorldView and WorldMonitor both have persistent status bars. | Low | Bottom bar with entity counts per active layer. |
| Loading indicator per layer | Users need to know a layer is fetching vs empty vs errored. | Low | Spinner/badge on layer toggle button during fetch. |
| Day/night terminator rendering | CesiumJS includes this. Any globe without it looks like a toy. | Low (CesiumJS built-in) | Enable `scene.globe.enableLighting` + `scene.sun`. |
| Atmosphere and sky | Realism baseline for 3D globe. | Low (CesiumJS built-in) | SkyAtmosphere, SkyBox defaults. |
| Point clustering for dense layers | 336K ALPR points, 6.7K aircraft -- without clustering, the browser will crash at any zoom level. Flightradar24 clusters below certain zoom. | Med | Supercluster library (npm) for pre-cluster; pass cluster boundaries to CesiumJS as BillboardCollection. |
| Time-range filter | "Show me incidents from the last hour/24h/week." WorldMonitor, earthquake feeds, wildfire feeds all expose time windows. | Med | UI control (radio buttons or dropdown); backend filters dataset by timestamp before sending. |
| Search / fly-to geocoder | Users want to type a city name and fly there. CesiumJS provides `Geocoder` widget via Nominatim/Bing. | Low (widget exists) | Enable CesiumJS built-in Geocoder widget. |
| Compass/navigation controls | North-up reset. Tilt/zoom buttons. Standard on every GIS product. | Low (CesiumJS widget) | `NavigationHelpButton`, `HomeButton` already in CesiumJS Viewer. |
| Mobile-readable (responsive layout) | A control panel that hides below 768px width. Not full mobile app, but panels must not overlap the globe. | Med | CSS: collapsible sidebar on small screens. |
| Error/empty state messaging | When an API is down or rate-limited, show "Feed unavailable" rather than silent empty layer. | Low | Per-layer error state in UI. |

---

## Differentiators

Features that set this product apart from generic map dashboards. Not universally expected, but high perceived value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Night vision (NVG) visual mode | GLSL post-processing: green phosphor, noise grain, bloom, vignette. Makes the dashboard look like a classified intelligence terminal. WorldView uses PostProcessStage; this is the primary cinematic differentiator. | High (GLSL shader) | Requires custom `PostProcessStage` in CesiumJS. Write GLSL fragment shader. GPU-only cost. |
| Thermal (FLIR) visual mode | White-hot thermal palette with edge detection pass. Same approach as NVG but different LUT. | High (GLSL shader) | Second PostProcessStage. Can share infrastructure with NVG mode. |
| CRT visual mode | Scanlines, chromatic aberration, barrel distortion. Most distinctive visual mode -- looks like 1980s radar room. WorldView and WorldMonitor both implement this. | High (GLSL shader) | Third PostProcessStage. Chromatic aberration most distinctive element. |
| Live entity lock-on / camera tracking | Click an aircraft and the camera smoothly follows it as it moves. WorldView calls this "lock-on." Flightradar24 offers flight-follow view. | Med-High | Set `viewer.trackedEntity` to the moving entity. ESC unlocks. |
| Altitude band filtering for aircraft | Filter to show only cruise-altitude traffic, or only low-altitude GA aircraft. WorldView implements: Cruise / High / Mid / Low / Ground bands. | Med | Add altitude range sliders or preset bands to aircraft layer controls. |
| Live event stream / intel feed panel | Sidebar that streams recent events as a chronological text feed (earthquake M5.2 detected, fire hotspot added, flight declared emergency). WorldView has this as "Intel Feed." | Med | WebSocket events rendered as scrolling list with timestamps and layer icons. |
| URL-shareable layer state | Encode active layers + camera position into URL hash. WorldMonitor implements this. Allows bookmarking a specific configuration. | Med | Serialize: active layers, camera lon/lat/alt, visual mode -> URL query params. |
| Orbit track visualization for satellites | Show ground track (future and past orbit path) as polyline on globe. CelesTrak + SGP4 propagation. | High (orbital math) | Use satellite.js npm package for SGP4 propagation. Draw polyline for +/-1 orbit. |
| Aircraft dead-reckoning between updates | OpenSky updates every 10-30 seconds. Extrapolate aircraft position between frames using heading/speed for smooth 60fps movement. WorldView does this explicitly. | Med | Interpolate lon/lat using last known velocity vector between API poll cycles. |
| Multiple basemap presets | Toggle between satellite imagery, OpenStreetMap, dark/minimal tiles, terrain. | Low | CesiumJS `imageryLayers` stack; add layer picker or preset buttons. |
| Incident heatmap view | Instead of individual markers, show density heatmap for crime/ALPR layers. Useful at country scale. | Med | Use CesiumJS `HeatmapImageryProvider` or third-party heatmap lib mapped to ImageryLayer. |
| Per-layer opacity slider | Dim weather alert overlay without hiding it entirely. Standard in GIS tools like QGIS, ArcGIS Dashboards, kepler.gl. | Low-Med | Add slider to each layer's expanded panel. Pass opacity to BillboardCollection or ImageryLayer. |
| Audio stream integration (police scanner) | Click an incident and hear the OpenMHz/Broadcastify audio stream for that jurisdiction. Unique among open-source dashboards. | Med | Open audio player panel with streaming URL. No transcription needed for v1. |
| Contextual severity color coding | Earthquake markers scale by magnitude; wildfire hotspots scale by brightness temperature; aircraft altitude encoded in color. WorldView uses altitude color bands. | Med | Define color scale functions per layer. Apply to billboard color or point primitive color. |
| Entity tooltip on hover | Show brief summary (callsign, magnitude, type) on cursor hover before committing to a click. Lower friction than always requiring a click. | Low-Med | `ScreenSpaceEventHandler` for MOUSE_MOVE; lightweight floating tooltip div. |

---

## Anti-Features

Features to explicitly NOT build in v1. Deliberate scope exclusions that prevent over-engineering.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User accounts / authentication | Personal dashboard, single user. Auth adds backend complexity, session management, password storage, and a login page with zero benefit. | Keep it open on the LAN. If network-external access is needed later, put Twingate or Cloudflare Access in front. |
| Admin configuration UI | Building a UI to configure API keys, polling intervals, or thresholds in the browser creates maintenance burden. | Environment variables and Redis TTL config in `.env`. Config changes require a container restart -- acceptable for v1. |
| Data export (CSV/GeoJSON download) | No stated need. Adds API endpoints, file streaming, and download UX with no clear benefit. | Defer to v2 if needed. |
| Historical playback scrubber | Animating the globe backward through time requires storing historical snapshots, a timeline control, and interpolation logic. High complexity, low v1 value. | Time-range filter (last hour/24h/week) satisfies the "how recent" question. Full playback is v3+. |
| PostgreSQL / PostGIS | Redis TTL caching is sufficient for v1 with 17 API feeds. PostGIS adds schema design, migrations, spatial indexing, and query complexity. | Use Redis with JSON payloads. PostGIS belongs in v2 when historical storage matters. |
| Ship traffic (AIS) | Useful data at MarineTraffic or AISHub costs money for real-time AIS. Free AIS is either extremely delayed or geographically limited. | Defer to v2 if a free global AIS source is found. |
| Citizen App / CrimeMapping integration | Unofficial APIs, reverse-engineering required, ToS violations. | Use Socrata/SODA city open data portals for crime incidents. |
| Embedded satellite imagery capture | Downloading and serving real-time satellite imagery (not tiles) is separate infrastructure. | Use CesiumJS tile providers (Bing, OSM). |
| AI/LLM incident summarization | Would require LLM call per incident click. Adds latency, API cost risk, and accuracy concerns for safety-sensitive data. | Plain metadata in popups. Jarvis AI is a separate cluster service if ever needed. |
| Custom map tile server | Self-hosting terrain/imagery tiles adds 50+ GB of data and tile server infrastructure. | Use CesiumJS Ion (free tier) for terrain; Bing or OSM for imagery. |
| Social/sharing features | No collaborative use case. Shareable URL state (via URL params) is the right scope. | URL-shareable layer state covers the sharing need without a backend share service. |
| Push notifications | Alerting on earthquakes or wildfires via browser push or email adds notification infrastructure, subscription management, and false-positive risk. | The live event feed panel in the UI provides ambient awareness without interruption. |

---

## Data Source API Reference

Comprehensive technical reference for all 13+ data source APIs. For each: endpoint URLs, auth, rate limits, data format, update frequency, and integration gotchas.

---

### 1. OpenSky Network -- Live Flight Tracking

**Confidence:** HIGH (official docs verified)

| Property | Value |
|----------|-------|
| **Base URL** | `https://opensky-network.org/api` |
| **Primary Endpoint** | `GET /states/all` |
| **Auth** | OAuth2 Client Credentials (Basic auth deprecated, ends March 18, 2026). Create API client at account page to get `client_id` and `client_secret`. |
| **Token Endpoint** | `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` |
| **Token Lifetime** | 30 minutes per access token |
| **Rate Limits** | Credit-based: 4,000 credits/day (authenticated), 8,000 credits/day (contributing feeder). Anonymous: no explicit credit limit but must poll no faster than every 10 seconds. HTTP 429 returned when exhausted. Headers: `X-Rate-Limit-Remaining`, `X-Rate-Limit-Retry-After-Seconds`. |
| **Data Format** | JSON. State vectors returned as arrays (not objects) to minimize bandwidth. Each vector = 18 fields. |
| **Update Frequency** | Data refreshes every ~5 seconds internally. Anonymous users get 10-second resolution (server rounds to `now - (now mod 10)`). Authenticated users get ~5s resolution. |
| **Typical Entity Count** | ~6,700 aircraft globally at peak |
| **Bounding Box** | `?lamin=X&lomin=X&lamax=X&lomax=X` -- filter to geographic region, reduces payload and credit cost. |

**State Vector Fields (array indices):**
| Index | Field | Type | Notes |
|-------|-------|------|-------|
| 0 | icao24 | string | ICAO 24-bit address (hex) |
| 1 | callsign | string/null | 8 chars max, may be null |
| 2 | origin_country | string | Inferred from ICAO24 |
| 3 | time_position | int/null | Unix epoch of last position report |
| 4 | last_contact | int | Unix epoch of last message |
| 5 | longitude | float/null | WGS-84 degrees |
| 6 | latitude | float/null | WGS-84 degrees |
| 7 | baro_altitude | float/null | Barometric altitude (meters) |
| 8 | on_ground | bool | True if surface position |
| 9 | velocity | float/null | Ground speed (m/s) |
| 10 | true_track | float/null | Heading in degrees clockwise from north |
| 11 | vertical_rate | float/null | Vertical rate (m/s) |
| 12 | sensors | int[] | Receiver IDs |
| 13 | geo_altitude | float/null | Geometric altitude (meters) |
| 14 | squawk | string/null | Transponder code |
| 15 | spi | bool | Special Purpose Indicator |
| 16 | position_source | int | 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM |
| 17 | category | int | Aircraft category (0-20) |

**Additional Endpoints:**
- `GET /flights/all?begin=X&end=X` -- Flight arrivals/departures in time range
- `GET /flights/aircraft?icao24=X&begin=X&end=X` -- Flights for specific aircraft
- `GET /tracks/all?icao24=X&time=0` -- Waypoint track for specific aircraft

**Gotchas:**
- Basic auth (username/password) is DEPRECATED and ends March 18, 2026. Must migrate to OAuth2 client credentials flow.
- Anonymous queries return 10-second-granularity data. Polling more frequently than every 10s is explicitly warned against and wastes bandwidth.
- State vectors with `null` longitude/latitude mean position is unknown (aircraft transmitting but not locatable). Filter these out client-side.
- Response is a flat `{"time": int, "states": [[...], [...]]}` structure. No pagination -- you get all states in one response.
- For a homelab dashboard polling every 15-30 seconds, authenticated free tier (4,000 credits/day) is sufficient. Each `/states/all` call costs ~1 credit. 4,000 credits / day = ~2.8 calls per minute = one call every ~21 seconds.

---

### 2. USGS Earthquake API -- GeoJSON Feeds

**Confidence:** HIGH (official USGS docs)

| Property | Value |
|----------|-------|
| **Base URL** | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/` |
| **Auth** | None. Completely open. |
| **Rate Limits** | HTTP 429 if exceeded, but limit is generous and not publicly documented. Responses cached server-side for 60 seconds. Polling faster than 60s returns stale data. |
| **Data Format** | GeoJSON (RFC 7946) FeatureCollection |
| **Compression** | Supports gzip (`Accept-Encoding: gzip`). Compressed responses are 70%+ smaller. Always use. |

**Feed URLs (static feeds, no query params needed):**

| Feed | URL | Update Interval |
|------|-----|-----------------|
| All Earthquakes, Past Hour | `.../summary/all_hour.geojson` | Every 1 minute |
| M1.0+ Past Hour | `.../summary/1.0_hour.geojson` | Every 1 minute |
| M2.5+ Past Hour | `.../summary/2.5_hour.geojson` | Every 1 minute |
| M4.5+ Past Hour | `.../summary/4.5_hour.geojson` | Every 1 minute |
| Significant Past Hour | `.../summary/significant_hour.geojson` | Every 1 minute |
| All Earthquakes, Past Day | `.../summary/all_day.geojson` | Every 1 minute |
| M2.5+ Past Day | `.../summary/2.5_day.geojson` | Every 1 minute |
| M4.5+ Past Day | `.../summary/4.5_day.geojson` | Every 1 minute |
| Significant Past Day | `.../summary/significant_day.geojson` | Every 1 minute |
| All Earthquakes, Past 7 Days | `.../summary/all_week.geojson` | Every 1 minute |
| All Earthquakes, Past 30 Days | `.../summary/all_month.geojson` | Every 15 minutes |

**Custom Query Endpoint:**
- `GET https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=X&endtime=X&minmagnitude=X`
- Supports: `minlatitude`, `maxlatitude`, `minlongitude`, `maxlongitude`, `mindepth`, `maxdepth`, `orderby`

**GeoJSON Feature Properties (key fields):**

| Field | Type | Example |
|-------|------|---------|
| mag | float | 5.2 |
| place | string | "10 km SSW of Ridgecrest, CA" |
| time | long | 1709234567890 (Unix ms) |
| updated | long | 1709234580000 (Unix ms) |
| type | string | "earthquake" |
| title | string | "M 5.2 - 10km SSW of Ridgecrest, CA" |
| alert | string/null | "green", "yellow", "orange", "red" |
| sig | int | 0-1000 significance scale |
| depth | float | geometry.coordinates[2] in km |
| tsunami | int | 0 or 1 |

**Recommended Polling Strategy:**
- Use `all_day.geojson` feed. Poll every 60 seconds (matches server cache). Smaller than `all_week` but captures everything within the dashboard's typical "recent" view.
- For the time-range filter "past week," switch to `all_week.geojson` on demand.

**Gotchas:**
- `geometry.coordinates` is `[longitude, latitude, depth]` -- note longitude FIRST (GeoJSON spec), not lat/lon.
- The `all_month.geojson` feed can return 10,000+ features. Use gzip compression and consider using the `2.5_month.geojson` feed unless you need micro-earthquakes.
- Depth is in the coordinates array, not in properties. Easy to miss.

---

### 3. OpenStreetMap Overpass API -- Speed Camera Locations

**Confidence:** HIGH (OSM wiki verified)

| Property | Value |
|----------|-------|
| **Endpoint** | `https://overpass-api.de/api/interpreter` (primary) or `https://lz4.overpass-api.de/api/interpreter` (mirror) |
| **Auth** | None. |
| **Rate Limits** | Per-IP rate limiting. 2 concurrent slots per IP (default). Requests queued up to 15s if no slot available. HTTP 429 if rejected. Max runtime per query: 180 seconds default. Max memory: 512 MiB default. |
| **Data Format** | JSON (use `[out:json]`), XML (default), CSV (with `[out:csv(...)]`) |
| **Data Nature** | **Static.** Speed cameras rarely change. Query once at startup or daily, not per-minute. |

**Speed Camera Query (Overpass QL):**
```
[out:json][timeout:60];
(
  node["highway"="speed_camera"];
  node["man_made"="surveillance"]["surveillance:type"="ALPR"];
);
out body;
```

**Tag: `highway=speed_camera`**
- Placed at the exact position of the camera next to the road
- Properties: `maxspeed` (speed limit), `direction` (direction of enforcement), `ref` (camera ID)

**Recommended Integration:**
- Query once on backend startup. Cache result in Redis with 24-hour TTL.
- Speed cameras are crowd-sourced, so data quality varies by region. Western Europe and parts of Asia have excellent coverage. US coverage is moderate.
- The dataset is small enough (typically < 50,000 nodes globally for speed cameras) to load entirely without clustering.

**Gotchas:**
- The Overpass API is NOT designed for high-frequency polling. Treat this as a static dataset that refreshes daily.
- Two public Overpass servers (`overpass-api.de` and `lz4.overpass-api.de`) maintain independent rate limits. Failover between them.
- Large bounding box queries can time out. For global data, query without geographic filter and use the `[timeout:120]` directive.
- JSON output wraps results in `{"elements": [...]}`. Each element has `type`, `id`, `lat`, `lon`, `tags`.

---

### 4. DeFlock / ALPR Camera Locations

**Confidence:** HIGH (GitHub repos verified, data architecture confirmed)

| Property | Value |
|----------|-------|
| **Data Source** | DeFlock stores data IN OpenStreetMap. Query via Overpass API (same as speed cameras). Alternatively, the Ringmast4r/FLOCK project provides a pre-compiled 336K+ camera dataset. |
| **DeFlock Overpass Query** | `node["man_made"="surveillance"]["surveillance:type"="ALPR"]` |
| **FLOCK Static Dataset** | GitHub: `Ringmast4r/FLOCK` -- `CAMERAS_WITH_NETWORK_DATA.geojson` (102 MB, exceeds GitHub file limit, available locally in repo clone) |
| **EFF ALPR Dataset** | CSV download at `https://www.eff.org/pages/download-alpr-dataset` -- historical police ALPR scan data, NOT camera locations |
| **Auth** | None (Overpass API) or None (GitHub clone) |
| **Rate Limits** | Same as Overpass API (Section 3) for OSM queries. No limits for static GitHub download. |
| **Data Format** | GeoJSON (FLOCK dataset) or JSON (Overpass API) |
| **Update Frequency** | **Static dataset.** New cameras added by crowd-sourced contributors. Refresh monthly at most. |

**Fields (FLOCK GeoJSON):**
- `geometry.coordinates`: [lon, lat]
- `properties.type`: Camera type (ALPR, Flock Safety, etc.)
- `properties.network`: Data-sharing network connections

**Recommended Integration:**
- Use the Ringmast4r/FLOCK pre-compiled GeoJSON as the primary data source. It aggregates DeFlock + other surveillance databases into one file.
- Load at startup. Store in Redis as a pre-clustered supercluster index. 336K points will need aggressive clustering -- supercluster handles this well.
- Refresh by re-downloading the FLOCK dataset periodically (weekly or monthly cron job).

**Gotchas:**
- The 102 MB GeoJSON file exceeds GitHub's 100 MB file limit, so it is NOT available via GitHub API. Must clone the repo or host a copy. Download once, serve from local storage.
- 336K points rendered as individual entities will crash CesiumJS. MUST use supercluster to reduce to ~500-2,000 visible points at any zoom level.
- DeFlock and Overpass data overlap -- DeFlock writes TO OpenStreetMap. Do not combine both sources or you will get duplicates.
- The EFF dataset is NOT camera locations. It is a log of ALPR scans (where plates were read, not where cameras are). Different use case.

---

### 5. Socrata/SODA API -- City Crime Data

**Confidence:** HIGH (official Socrata docs)

| Property | Value |
|----------|-------|
| **Base URL** | Varies per city. Format: `https://{domain}/resource/{dataset-id}.json` (SODA2) or `https://{domain}/api/v3/views/{dataset-id}/query.json` (SODA3) |
| **Auth** | App token recommended but optional. Without token: IP-based throttling. With token: significantly higher limits. Register at any Socrata portal to get a free token. |
| **Rate Limits** | Without token: ~1,000 requests/hour per IP (undocumented, varies). With token: ~10,000+ requests/hour. HTTP 429 when exceeded. |
| **Data Format** | JSON (default), CSV, GeoJSON (some datasets) |
| **Query Language** | SoQL (Socrata Query Language) -- SQL-like. `$select`, `$where`, `$limit`, `$offset`, `$order`. |
| **Default Page Size** | 1,000 rows. Configurable up to 50,000 with `$limit`. |

**Example City Datasets:**

| City | Domain | Dataset ID | Notes |
|------|--------|------------|-------|
| Chicago | data.cityofchicago.org | `6zsd-86xi` (Crimes 2001-Present) | ~8M rows total. Filter by date. |
| New York | data.cityofnewyork.us | `5uac-w243` (NYPD Complaints) | |
| Los Angeles | data.lacity.org | `2nrs-mtv8` (Crime Data 2020-Present) | |
| San Francisco | data.sfgov.org | `tmnf-yvry` (Police Incidents) | |

**Example Query:**
```
GET https://data.cityofchicago.org/resource/6zsd-86xi.json?$where=date > '2026-03-01T00:00:00'&$select=date,primary_type,latitude,longitude,description&$limit=5000&$order=date DESC
```

**SODA3 Update (2025):**
- SODA3 requires either an app token or authentication (basic auth or API key). Anonymous access is being phased out.
- Endpoint format changed: `/api/v3/views/{id}/query.json`
- Body POST with JSON: `{"query": "SELECT ...", "page": {"pageNumber": 1, "pageSize": 100}}`

**Key Response Fields:**
- `latitude`, `longitude` (some datasets use `location` object with `.latitude`/`.longitude`)
- `date` or `datetime` (ISO 8601)
- `primary_type` or `offense` (crime category)
- `description` (detailed description)
- `location_description` (e.g., "STREET", "APARTMENT")

**Gotchas:**
- Dataset IDs are NOT standardized across cities. Each city has its own portal and its own identifiers. You must manually discover the dataset ID for each city you want to support.
- Socrata recently announced SODA3 which changes endpoint paths. Both SODA2 and SODA3 currently work, but plan for SODA3.
- Not all crime datasets include lat/lon. Some only have address or block-level location. Filter to rows where latitude IS NOT NULL.
- Large result sets require pagination. Default limit is 1,000 rows. Use `$offset` for paging.
- For a dashboard, pick 2-3 cities initially (Chicago, NYC, LA) and hardcode their dataset IDs. Adding cities requires finding the right dataset.

---

### 6. PulsePoint -- Fire/EMS Dispatch

**Confidence:** MEDIUM (unofficial/reverse-engineered; official API requires agency partnership)

| Property | Value |
|----------|-------|
| **Official API** | Requires CAD (Computer-Aided Dispatch) integration partnership. Not available to public developers. Agency-level API keys managed via PulsePoint's Life platform. |
| **Unofficial Access** | The web client at `web.pulsepoint.org` makes XHR calls to internal endpoints that can be observed and replicated. Several open-source scrapers exist (PulsepointScraperV2 on GitHub). |
| **Unofficial Endpoint** | `https://web.pulsepoint.org/DB/giba.php?agency_id={ID}` (discovered via network inspection; undocumented, may change without notice) |
| **Auth (unofficial)** | None required for web endpoint. Just match the request headers the web app sends. |
| **Rate Limits** | Undocumented. Scrapers report scanning agencies on 12-hour intervals with distributed calls to avoid blocking. |
| **Data Format** | JSON (unofficial endpoint) |
| **Update Frequency** | Near real-time. Incidents appear within seconds of dispatch. |

**Fields (from scraper projects):**
- Agency ID, incident ID
- Incident type (fire, medical, hazmat, etc.)
- Address, latitude, longitude
- Unit assignments
- Timestamp

**Recommended Integration:**
- Use PulsePoint as a "best-effort" layer. Wrap in error handling since the unofficial endpoint can change or be blocked.
- Poll every 30-60 seconds per agency. Pick 2-3 local agencies by their ID.
- The official GitHub documentation (pulsepointinc/pulsepoint_api) is being deprecated by end of 2025 and relates to their ad-tech NPI API, NOT fire/EMS data.

**Gotchas:**
- This is the RISKIEST data source. The unofficial API is undocumented, unsupported, and can break at any time. No SLA.
- Agency IDs must be discovered manually by browsing `web.pulsepoint.org` and inspecting network traffic.
- PulsePoint covers ~4,000 agencies across the US, but not all of them. Coverage is not universal.
- The web endpoint may require specific HTTP headers (User-Agent, Referer) to return data.

---

### 7. OpenMHz -- Police Scanner Audio Streams

**Confidence:** MEDIUM (community-documented API; no official docs)

| Property | Value |
|----------|-------|
| **API Base URL** | `https://api.openmhz.com` |
| **Systems List** | `https://openmhz.com/systems` (web page listing available systems) |
| **Calls Endpoint** | `GET https://api.openmhz.com/{system_shortname}/calls/newer?time={timestamp}&filter-type={talkgroup|group}&filter-code={id}` |
| **Auth** | None for read access. API key needed for uploading (Trunk Recorder integration). |
| **Rate Limits** | Not documented. The service is community-run; be polite -- poll no more than every 30 seconds per system. |
| **Data Format** | JSON |
| **Audio Format** | M4A files hosted on OpenMHz servers |
| **WebSocket** | Socket.IO connection at `https://api.openmhz.com/` (namespace `/`, protocol revision 4) for real-time call notifications |
| **Coverage** | 225+ city/county/state radio systems across the US |
| **Archive** | 30-day archive of transmissions |

**Response Fields:**
- `id`: Call ID
- `source`: Radio ID / source
- `audio_url`: Direct URL to M4A audio file
- `talkgroup`: Talkgroup number
- `talkgroup_tag`: Human-readable talkgroup name
- `timestamp`: Unix timestamp
- `call_length`: Duration in seconds

**Time Format Gotcha:**
- The `time` parameter is NOT a standard Unix timestamp. It is the whole number of seconds of the intended Unix time with the first three decimal places tacked on at the end (millisecond precision but formatted as an integer, not a float).
- Example: Unix timestamp `1709234567.890` becomes `1709234567890`

**Recommended Integration:**
- Use as a supplementary audio layer, not a core data layer. Link from PulsePoint or crime incident popups to the corresponding OpenMHz system.
- Use the Socket.IO connection for real-time notifications of new calls, rather than polling.
- Display audio player in popup with play button and call metadata.

**Gotchas:**
- System short names must be discovered from the systems page. No API endpoint lists all available systems.
- Audio files are M4A format -- ensure the browser's audio player supports this (all modern browsers do).
- OpenMHz is community-run infrastructure. Uptime is not guaranteed.

---

### 8. CelesTrak -- Satellite TLE Data

**Confidence:** HIGH (official CelesTrak docs)

| Property | Value |
|----------|-------|
| **GP Data Endpoint** | `https://celestrak.org/NORAD/elements/gp.php` |
| **Auth** | None. Completely open. |
| **Rate Limits** | Not documented, but CelesTrak is a public service. Poll no more than every 2-4 hours for TLE updates (orbits don't change faster than that). |
| **Data Format** | JSON, JSON-PRETTY, CSV, XML, TLE (legacy 2-line format) |
| **Update Frequency** | TLEs updated multiple times per day by 18th Space Defense Squadron (18 SPCS). Refresh every 4-8 hours is sufficient. |

**Query Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `GROUP` | Predefined satellite groups | `STATIONS`, `STARLINK`, `GPS-OPS`, `ACTIVE`, `VISUAL` |
| `NAME` | Satellite name search (partial match) | `NAME=ISS` |
| `CATNR` | NORAD catalog number | `CATNR=25544` |
| `INTDES` | International designator | `INTDES=2020-025` |
| `FORMAT` | Output format | `JSON`, `JSON-PRETTY`, `CSV`, `TLE`, `XML` |

**Example Queries:**
```
# All active satellites (JSON)
https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON

# ISS only
https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON

# GPS constellation
https://celestrak.org/NORAD/elements/gp.php?GROUP=GPS-OPS&FORMAT=JSON

# Visual satellites (bright enough to see)
https://celestrak.org/NORAD/elements/gp.php?GROUP=VISUAL&FORMAT=JSON
```

**JSON Response Fields (OMM format):**
| Field | Description |
|-------|-------------|
| OBJECT_NAME | Satellite name |
| OBJECT_ID | International designator |
| NORAD_CAT_ID | NORAD catalog number |
| EPOCH | TLE epoch (ISO 8601) |
| MEAN_MOTION | Revolutions per day |
| ECCENTRICITY | Orbital eccentricity |
| INCLINATION | Orbital inclination (degrees) |
| RA_OF_ASC_NODE | Right ascension of ascending node |
| ARG_OF_PERICENTER | Argument of perigee |
| MEAN_ANOMALY | Mean anomaly |
| BSTAR | Drag coefficient |
| MEAN_MOTION_DOT | First derivative of mean motion |
| MEAN_MOTION_DDOT | Second derivative of mean motion |

**Client-Side Propagation with satellite.js:**
```typescript
import { twoline2satrec, propagate, gstime, eciToGeodetic } from 'satellite.js';

// From TLE lines (or convert OMM JSON to TLE format)
const satrec = twoline2satrec(tleLine1, tleLine2);
const positionAndVelocity = propagate(satrec, new Date());
const gmst = gstime(new Date());
const geodetic = eciToGeodetic(positionAndVelocity.position, gmst);
// geodetic.latitude (radians), geodetic.longitude (radians), geodetic.height (km)
```

**Gotchas:**
- CelesTrak will run out of 5-digit catalog numbers at 69999 (estimated ~July 2026). After that, new objects get 6-digit numbers and TLE format cannot represent them. Use JSON/OMM format, not TLE, to future-proof.
- The `ACTIVE` group returns ~9,000+ satellites. For v1, use `VISUAL` (~200 satellites) or `STATIONS` (ISS + Tiangong) for manageable counts.
- satellite.js returns ECI coordinates. Must convert to geodetic (lat/lon/alt) using `eciToGeodetic()`. The conversion requires GMST (Greenwich Mean Sidereal Time) which `gstime()` provides.
- Propagation accuracy degrades after ~7-14 days from TLE epoch. Stale TLEs produce wrong positions. Refresh regularly.

---

### 9. ADS-B Exchange -- Military Aircraft

**Confidence:** MEDIUM (paid API; pricing confirmed via RapidAPI)

| Property | Value |
|----------|-------|
| **API Access** | Via RapidAPI: `https://adsbexchange-com1.p.rapidapi.com/v2/` |
| **Auth** | RapidAPI key required. Header: `X-RapidAPI-Key: {key}` |
| **Pricing** | $10/month for 10,000 requests. No free tier as of March 2025. |
| **Rate Limits** | 10,000 requests/month on the $10 plan. |
| **Data Format** | JSON |
| **API Docs** | `https://gateway.adsbexchange.com/api/aircraft/v2/docs` |
| **Unique Value** | Unfiltered, unblocked data -- includes military, FAA LADD (block list), state/government, and VIP aircraft that Flightradar24/FlightAware censor. |

**Key Endpoints:**
- `GET /v2/lat/{lat}/lon/{lon}/dist/{nm}/` -- Aircraft within radius (nautical miles)
- `GET /v2/hex/{icao24}/` -- Specific aircraft by ICAO hex
- `GET /v2/callsign/{callsign}/` -- Aircraft by callsign
- `GET /v2/mil/` -- Military aircraft only (the key endpoint for this project)
- `GET /v2/ladd/` -- LADD (blocked) aircraft only
- `GET /v2/type/{type}/` -- Aircraft by type code

**v2 Response Fields (selected):**
| Field | Description |
|-------|-------------|
| hex | ICAO hex address |
| flight | Callsign (trimmed) |
| lat, lon | Position |
| alt_baro | Barometric altitude (feet) |
| alt_geom | Geometric altitude (feet) |
| gs | Ground speed (knots) |
| track | Track angle (degrees) |
| category | Aircraft category |
| t | Aircraft type (e.g., "F16") |
| r | Registration |
| dbFlags | Bitfield: bit 0=military, bit 1=interesting, bit 3=LADD |
| mil | Boolean: military flag |

**Military Filter via dbFlags:**
```typescript
const isMilitary = (ac.dbFlags & 1) !== 0 || ac.mil === true;
```

**Recommended Integration:**
- Use the `/v2/mil/` endpoint specifically for military-only aircraft. This avoids paying credits to re-fetch civilian traffic already covered by OpenSky.
- At $10/month and 10,000 requests, you get ~333 requests/day, or one request every ~4.3 minutes. Poll every 5 minutes.
- Cache results in Redis with 5-minute TTL.

**Gotchas:**
- This is the ONLY paid API in the stack. $10/month is the minimum cost. No free tier.
- ADS-B Exchange via RapidAPI discontinued the "Flight Sim Traffic" API in March 2025. Only the main "ADSBexchange.com" service remains.
- The `/v2/mil/` endpoint returns globally -- no geographic filtering. Parse results for lat/lon yourself if needed.
- Commercial use of the data requires explicit authorization from ADS-B Exchange. Personal/hobby use is explicitly permitted.

**Alternative (free but degraded):**
- The ADS-B Exchange globe at `globe.adsbexchange.com` renders military aircraft in the browser. It makes internal API calls that could theoretically be observed, but this violates their terms. Use the paid API.

---

### 10. NWS API -- Weather Alerts (Polygon Overlays)

**Confidence:** HIGH (official US government API)

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.weather.gov` |
| **Alerts Endpoint** | `GET /alerts/active` |
| **Auth** | None. But a `User-Agent` header is REQUIRED. Set to `"(your-app-name, contact@email)"`. |
| **Rate Limits** | Not published. "Generous amount for typical use." Recommended: no more than 1 request per 30 seconds. HTTP 429 returned if exceeded; retry after limit clears (~5 seconds). |
| **Data Format** | GeoJSON (default), JSON-LD, ATOM |
| **US Only** | Yes. NWS covers US territories only. |

**Alerts Endpoint URL:**
```
GET https://api.weather.gov/alerts/active?status=actual&message_type=alert
```

**Query Parameters:**
| Parameter | Description | Example |
|-----------|-------------|---------|
| `status` | Filter by status | `actual` |
| `message_type` | Filter by type | `alert`, `update`, `cancel` |
| `area` | Filter by US state | `CA`, `NY`, `TX` |
| `severity` | Filter by severity | `extreme`, `severe`, `moderate`, `minor` |
| `urgency` | Filter by urgency | `immediate`, `expected`, `future` |

**GeoJSON Response Structure:**
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[lon, lat], [lon, lat], ...]]
    },
    "properties": {
      "id": "urn:oid:2.49.0.1.840.0.{id}",
      "event": "Tornado Warning",
      "severity": "Extreme",
      "certainty": "Observed",
      "urgency": "Immediate",
      "headline": "Tornado Warning issued ...",
      "description": "Full alert text...",
      "instruction": "TAKE COVER NOW...",
      "effective": "2026-03-10T15:00:00-05:00",
      "expires": "2026-03-10T16:00:00-05:00",
      "senderName": "NWS Norman OK"
    }
  }]
}
```

**Key Properties for Rendering:**
| Property | Use |
|----------|-----|
| `geometry` | Render as polygon overlay on globe |
| `event` | Alert type label (Tornado Warning, Winter Storm Watch, etc.) |
| `severity` | Color coding: Extreme=red, Severe=orange, Moderate=yellow, Minor=blue |
| `headline` | Popup title |
| `description` | Popup body text |
| `expires` | Auto-remove expired alerts |

**Recommended Integration:**
- Poll `GET /alerts/active` every 60 seconds.
- Parse GeoJSON geometry directly into CesiumJS `GeoJsonDataSource` for polygon rendering.
- Color-code polygons by `severity` field.
- Auto-purge alerts past their `expires` timestamp.

**Gotchas:**
- The `User-Agent` header is MANDATORY. Without it, you may get 403 Forbidden. Set it to something identifiable: `"GeospatialDashboard/1.0 (your@email.com)"`.
- Some alerts have `geometry: null` -- these use UGC zone codes instead of polygons. For v1, skip alerts without geometry. (Zone boundaries require a separate lookup table.)
- The API returns alerts from the last 7 days, not just currently active ones. Filter by `expires > now` client-side.
- This is US-only. International weather alerts require different APIs (e.g., MeteoAlarm for EU).

---

### 11. NASA FIRMS -- Wildfire Hotspots

**Confidence:** HIGH (official NASA docs)

| Property | Value |
|----------|-------|
| **API Base URL** | `https://firms.modaps.eosdis.nasa.gov/api/area/` |
| **Auth** | MAP_KEY required. Free registration at `https://firms.modaps.eosdis.nasa.gov/api/map_key/` |
| **Rate Limits** | 5,000 transactions per 10-minute interval per MAP_KEY. Very generous. |
| **Data Format** | CSV or JSON |
| **Update Frequency** | Global data available within 3 hours of satellite observation. US/Canada: some detections available in near-real-time. |
| **Global Coverage** | Yes. All continents. |

**URL Format:**
```
https://firms.modaps.eosdis.nasa.gov/api/area/{FORMAT}/{MAP_KEY}/{SOURCE}/{AREA}/{DAY_RANGE}
```

**Parameters:**

| Parameter | Options | Description |
|-----------|---------|-------------|
| FORMAT | `csv`, `json` | Output format |
| MAP_KEY | (your key) | Registration-based key |
| SOURCE | `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `VIIRS_SNPP_NRT`, `MODIS_NRT`, `LANDSAT_NRT` | Satellite instrument |
| AREA | `world`, `USA`, `CAN`, or bounding box `west,south,east,north` | Geographic area |
| DAY_RANGE | `1` to `10` | Number of days of data |

**Example:**
```
# All VIIRS NOAA-20 detections worldwide, last 24 hours, CSV
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA20_NRT/world/1

# MODIS detections in California bounding box, last 2 days, JSON
https://firms.modaps.eosdis.nasa.gov/api/area/json/{MAP_KEY}/MODIS_NRT/-124.48,32.53,-114.13,42.01/2
```

**Response Fields (CSV/JSON):**

| Field | Description |
|-------|-------------|
| latitude | Detection latitude |
| longitude | Detection longitude |
| brightness | Brightness temperature (Kelvin) -- use for color scale |
| scan | Scan pixel size |
| track | Track pixel size |
| acq_date | Acquisition date (YYYY-MM-DD) |
| acq_time | Acquisition time (HHMM UTC) |
| satellite | Source satellite (e.g., "N", "1" for NOAA-20) |
| confidence | Detection confidence: "l" (low), "n" (nominal), "h" (high) |
| frp | Fire Radiative Power (MW) -- intensity measure |
| daynight | "D" or "N" |

**Recommended Source:**
- Use `VIIRS_NOAA20_NRT` as primary. VIIRS has better spatial resolution (375m) than MODIS (1km). NOAA-20 is the most current operational satellite.

**Recommended Integration:**
- Poll every 15 minutes (data doesn't update faster than satellite overpass schedules).
- Use `world/1` for global 24-hour hotspots. Typically 5,000-50,000 detections depending on fire season.
- Color-code by `brightness` temperature: higher = more intense fire.
- Filter by `confidence` -- show only "n" (nominal) and "h" (high) to reduce noise.

**Gotchas:**
- The `world/1` endpoint can return 50,000+ rows during active wildfire seasons (California, Australia, Amazon). Cluster at lower zoom levels.
- `brightness` values are in Kelvin (typically 300-500K for fires). Convert to a color scale, not an absolute temperature display.
- CSV format returns raw text with header row. Parse manually or use a CSV library.
- JSON format returns an array of objects -- more convenient for JavaScript.
- The MAP_KEY registration is free and instant. Just need a valid email address.

---

### 12. OpenAQ -- Air Quality Data

**Confidence:** HIGH (official docs at docs.openaq.org)

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.openaq.org/v3` |
| **Auth** | API key required. Free registration at `https://explore.openaq.org/register`. Pass as header: `X-API-Key: {key}` |
| **Rate Limits** | 60 requests per minute. Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. HTTP 429 when exceeded. |
| **Data Format** | JSON |
| **Global Coverage** | Yes. 10,000+ monitoring stations worldwide. |

**v2 Retirement:** OpenAQ v1 and v2 were retired January 31, 2025. Only v3 works.

**Key Endpoints:**

| Endpoint | Description | Use |
|----------|-------------|-----|
| `GET /v3/locations` | List monitoring stations | Get station positions and metadata |
| `GET /v3/locations/{id}/latest` | Latest measurement for a station | Most recent AQI readings |
| `GET /v3/latest` | Latest measurements across all stations | Bulk query for current conditions |
| `GET /v3/measurements` | Historical measurements | Time-series data |
| `GET /v3/parameters` | Available pollutant types | PM2.5, PM10, O3, NO2, SO2, CO |

**Query Parameters:**
- `bbox=west,south,east,north` -- Bounding box geographic filter
- `coordinates=lat,lon&radius=distance` -- Radius search
- `country_id=US` -- Country filter
- `parameter_id=2` -- Specific pollutant (2=PM2.5, 1=PM10, 3=O3, etc.)
- `limit=100` -- Results per page (max 1000)
- `page=1` -- Pagination

**Example:**
```
GET https://api.openaq.org/v3/locations?bbox=-125,24,-66,50&limit=1000
Headers: X-API-Key: {your_key}
```

**Response Structure (locations):**
```json
{
  "results": [{
    "id": 12345,
    "name": "Los Angeles-North Main Street",
    "coordinates": {"latitude": 34.06, "longitude": -118.22},
    "country": {"code": "US", "name": "United States"},
    "isMobile": false,
    "isMonitor": true,
    "sensors": [{"id": 1, "parameter": {"name": "pm25", "units": "ug/m3"}}]
  }]
}
```

**Alternative: EPA AirNow API**

| Property | Value |
|----------|-------|
| **Endpoint** | `https://www.airnowapi.org/aq/observation/zipCode/current/` or `.../latLong/current/` |
| **Auth** | API key required. Register at `https://docs.airnowapi.org/` |
| **Rate Limits** | 500 requests per hour per API service per key |
| **Data Format** | JSON, XML, CSV |
| **Coverage** | US only |

**Example:**
```
GET https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=34.05&longitude=-118.25&distance=25&API_KEY={key}
```

**Recommendation:** Use OpenAQ as primary (global coverage, better API design). Use AirNow as supplementary US-specific source if OpenAQ data is stale for a given station.

**Gotchas:**
- OpenAQ stations may report with significant delay (hours or even days for some stations). Check the `lastUpdated` timestamp.
- Air quality data is station-level (discrete points), not gridded/raster data. Visualize as colored circles at station locations.
- Parameter names vary: OpenAQ uses "pm25", AirNow uses "PM2.5". Normalize in your backend.
- The 60 requests/minute OpenAQ limit is tight if you are paginating through thousands of stations. Fetch US stations once, cache in Redis for 30 minutes, serve from cache.

---

### 13. State 511/DOT APIs -- Traffic Incidents

**Confidence:** MEDIUM (fragmented ecosystem; varies by state)

| Property | Value |
|----------|-------|
| **Architecture** | No single national API. Each state runs its own 511 system with its own API, authentication, and data format. |
| **Auth** | Most require a free API key. Registration is per-state. |
| **Data Format** | JSON (most states), some XML. Some follow Open511 spec, many are custom. |
| **Rate Limits** | Vary by state. Generally lenient for API key holders. |
| **Coverage** | US only. Not all states have public APIs. |

**Notable State APIs:**

| State | URL | API Key Needed | Notes |
|-------|-----|----------------|-------|
| California (Bay Area) | `api.511.org/traffic/events?api_key={key}` | Yes (free) | Open511 format. Well-documented. |
| New York | `511ny.org/api/getevents?key={key}&format=json` | Yes (free) | REST API with incidents, road work, cameras |
| Wisconsin | `511wi.gov/api/getevents?key={key}&format=json` | Yes (free) | Similar REST structure |
| Nevada | `nvroads.com/api/getevents?key={key}&format=json` | Yes (free) | Includes road conditions |
| Idaho | `511.idaho.gov/api/getevents?key={key}&format=json` | Yes (free) | Includes mountain pass conditions |

**Common Response Fields (varies by state):**
- `id` -- Incident ID
- `type` -- CONSTRUCTION, ACCIDENT, CLOSURE, CONGESTION, WEATHER
- `description` -- Human-readable description
- `geography` -- GeoJSON point or linestring
- `roads` -- Affected road names
- `severity` -- MINOR, MODERATE, MAJOR, CRITICAL
- `created` -- Timestamp
- `updated` -- Last update timestamp

**Recommended Integration:**
- Start with 1-2 states (California 511.org is the best-documented). Add states incrementally.
- Create a generic adapter interface in the backend that normalizes different state response formats into a common schema.
- Poll every 5 minutes per state API.
- Cache in Redis with 5-minute TTL.

**Gotchas:**
- The biggest challenge is heterogeneity. Each state API returns data in a slightly different format with different field names. You MUST build a normalization layer.
- Some states use the Open511 spec (standardized), others use proprietary JSON schemas. Cannot assume structure.
- API key registration is per-state -- requires separate registration for each state you want to integrate.
- Some state 511 APIs have low reliability and may be down for maintenance without notice.
- Geographic coordinates may be in the `geography` object (GeoJSON) or in separate `latitude`/`longitude` fields -- varies by state.

---

## Data Source Integration Summary

Quick reference matrix for all 13 data sources:

| # | Source | Auth | Cost | Rate Limit | Poll Interval | Format | Entity Count | Integration Risk |
|---|--------|------|------|------------|---------------|--------|-------------|-----------------|
| 1 | OpenSky Network | OAuth2 | Free | 4K-8K credits/day | 15-30s | JSON | ~6,700 | LOW |
| 2 | USGS Earthquake | None | Free | Generous (60s cache) | 60s | GeoJSON | 100-500/day | LOW |
| 3 | OSM Overpass (speed cams) | None | Free | 2 concurrent slots/IP | Daily (static) | JSON | ~50K global | LOW |
| 4 | DeFlock/FLOCK (ALPR) | None | Free | N/A (static file) | Monthly | GeoJSON | 336K | LOW (but large dataset) |
| 5 | Socrata/SODA (crime) | App token (free) | Free | ~10K/hr with token | 5-15 min | JSON | Varies by city | LOW |
| 6 | PulsePoint (fire/EMS) | None (unofficial) | Free | Undocumented | 30-60s | JSON | ~100-500 active | HIGH (unofficial API) |
| 7 | OpenMHz (police scanner) | None | Free | Be polite (~30s) | Socket.IO push | JSON + M4A audio | Varies | MEDIUM (community-run) |
| 8 | CelesTrak (satellites) | None | Free | Generous | 4-8 hours | JSON/TLE | 200-9,000 | LOW |
| 9 | ADS-B Exchange (military) | RapidAPI key | $10/month | 10K req/month | 5 min | JSON | ~500 military | LOW (but paid) |
| 10 | NWS API (weather alerts) | User-Agent header | Free | ~2 req/min | 60s | GeoJSON | 50-200 active | LOW |
| 11 | NASA FIRMS (wildfire) | MAP_KEY (free) | Free | 5K/10-min | 15 min | CSV/JSON | 5K-50K hotspots | LOW |
| 12 | OpenAQ (air quality) | API key (free) | Free | 60 req/min | 30 min | JSON | ~10K stations | LOW |
| 13 | State 511/DOT (traffic) | Per-state API key | Free | Varies | 5 min | JSON (varied) | Varies by state | MEDIUM (heterogeneous) |

---

## Feature Dependencies

Dependencies between features -- what must exist before what can be built.

```
WebSocket backend connection
  -> Real-time entity updates on globe
  -> Live event stream / intel feed panel
  -> Entity dead-reckoning (requires live position stream)

Layer visibility toggles
  -> Per-layer opacity slider
  -> Per-layer loading indicator
  -> Per-layer error state

CesiumJS globe initialized
  -> Day/night terminator
  -> Atmosphere
  -> Satellite imagery basemap
  -> Compass / navigation controls
  -> Geocoder / search
  -> Entity click popup
  -> Entity hover tooltip
  -> Entity lock-on / camera tracking

Entity click popup
  -> Audio stream integration (click triggers audio player)

Point clustering (Supercluster)
  -> Dense layer rendering (ALPR 336K points, crime incidents)
  -> Cluster click to zoom-in behavior

Visual mode infrastructure (PostProcessStage pipeline)
  -> Night vision mode
  -> Thermal mode
  -> CRT mode

Satellite orbital positions (CelesTrak)
  -> Orbit track visualization (requires SGP4 propagation first)

Aircraft real-time positions (OpenSky)
  -> Dead-reckoning interpolation
  -> Altitude band filtering
  -> Aircraft lock-on tracking

Redis caching layer (backend)
  -> All 13+ API feeds (rate limit compliance)
  -> Time-range filter (timestamp stored in cached payload)

URL state serialization
  -> Shareable URL layer state (requires stable layer IDs and camera math)

Backend API normalization layer
  -> State 511/DOT integration (heterogeneous formats)
  -> Crime data integration (per-city Socrata endpoints)
```

---

## MVP Recommendation

The minimum set that produces a genuinely impressive, usable dashboard:

**Prioritize (MVP core):**

1. CesiumJS globe with basemap, atmosphere, day/night, compass (table stakes -- zero effort beyond init)
2. WebSocket backend connection (everything depends on this)
3. Layer toggles + loading/error states (usability floor)
4. 3 flagship live layers: OpenSky flights, USGS earthquakes, NWS weather alerts (demonstrate real-time across air/earth/weather)
5. Click popup with metadata (makes entities interactive, not just decorative)
6. Point clustering (required before ALPR or crime layers are even loadable)
7. Time-range filter: last hour / 24h / week
8. CRT visual mode (the single most visually distinctive feature -- ships with v1 to establish identity)

**Second tier (ships with v1 but not blockers):**

- NASA FIRMS wildfire hotspots (easy API, high visual impact)
- CelesTrak satellites with satellite.js propagation (visually impressive)
- OpenAQ air quality stations (simple colored circles)
- DeFlock/FLOCK ALPR cameras (static load, needs clustering)
- NVG and thermal shader modes (share infrastructure with CRT)
- Intel feed / event stream panel
- Altitude band filtering for aircraft
- Entity hover tooltip

**Defer beyond v1:**

- ADS-B Exchange military ($10/month cost, needs evaluation)
- PulsePoint fire/EMS (unofficial API, high maintenance risk)
- OpenMHz police scanner audio (complex panel, niche usage)
- Socrata/SODA crime data (per-city setup effort)
- State 511/DOT traffic (heterogeneous, requires normalization layer)
- OSM speed cameras (lower visual impact)
- Dead-reckoning interpolation (polish, not correctness)
- Orbit track visualization (orbital math is a feature island)
- URL-shareable state (nice-to-have, not MVP)
- Per-layer opacity slider (nice-to-have)
- Heatmap view (requires different rendering path)

---

## Layer-Specific Feature Notes

Notes on features that apply to specific data layers:

| Layer | Expected Feature | Complexity | Key Concern |
|-------|-----------------|------------|-------------|
| OpenSky flights | Position + heading + callsign + altitude in popup; dead-reckoning; altitude color bands | Med | 6,700+ entities -- use BillboardCollection not Entity API (performance) |
| ADS-B Exchange military | Visual distinction from civilian (different icon/color); filter toggle "military only" | Low-Med | $10/month cost; separate layer toggle from commercial flights |
| CelesTrak satellites | Orbital ground track polyline; SGP4 propagation; satellite name/NORAD ID in popup | High | satellite.js library for propagation math; use VISUAL group (~200 sats) for v1 |
| USGS earthquakes | Magnitude-scaled pulsing circle markers; severity color (green/yellow/orange/red); depth info in popup | Med | Pulsing animation via CesiumJS entity CallbackProperty or CSS animation on overlay |
| NASA FIRMS wildfire | Brightness temperature color scale; cluster at country scale; source satellite in popup | Med | Hot spots have lat/lon + brightness temp -- use for color scale; filter by confidence |
| NWS weather alerts | Polygon overlay for alert zone; color by severity (watch/warning/emergency); alert text in popup | Med-High | Polygons not points -- use GeoJsonDataSource for polygon rendering. Some alerts lack geometry. |
| PulsePoint dispatches | Rapid turnover (seconds); incident type icon; address in popup; audio link if OpenMHz available | Med | Unofficial API -- HIGH risk of breakage |
| Socrata crime incidents | Dense urban clusters; crime type icon; date/time in popup | Med | Per-city dataset IDs; needs pagination; cluster dense areas |
| ALPR/DeFlock cameras | 336K static points -- largest dataset. Cluster aggressively. Camera operator in popup | High | Static data (not real-time). Tile/cluster on load, not per-update. 102MB GeoJSON file. |
| Speed cameras | Static points; speed limit in popup; direction of travel | Low | Small dataset vs ALPR. OSM Overpass query -- daily refresh. |
| Air quality (OpenAQ) | Color-coded AQI circles per station; AQI value + pollutant breakdown in popup | Low-Med | Station-level data, not raster -- manageable point count. 60 req/min limit. |
| State DOT traffic | Incident type (accident/closure/construction); road name in popup; severity color | Low-Med | Per-state API variation; heterogeneous JSON; build normalization adapter |
| Police scanner (OpenMHz) | Playback button in popup; jurisdiction name; last transmission time | Med | Audio streaming URL in popup; M4A format; community-run infrastructure |

---

## Backend Polling Schedule

Recommended polling intervals for each data source, designed to stay within rate limits while providing fresh data:

```
Every 15-30 seconds:
  - OpenSky Network (flights)          -- 15s authenticated, 30s anonymous

Every 30-60 seconds:
  - PulsePoint (fire/EMS)              -- 30s per agency (unofficial)
  - NWS API (weather alerts)           -- 60s

Every 5 minutes:
  - ADS-B Exchange (military)          -- 5 min (10K/month budget)
  - State 511/DOT (traffic)            -- 5 min per state

Every 15-30 minutes:
  - NASA FIRMS (wildfire)              -- 15 min (satellite overpass cadence)
  - OpenAQ (air quality)               -- 30 min (station update frequency)
  - Socrata/SODA (crime)               -- 15 min (data lag is hours anyway)

Every 4-8 hours:
  - CelesTrak (satellite TLEs)         -- 4 hours (orbits change slowly)

Once at startup + daily refresh:
  - DeFlock/FLOCK ALPR cameras         -- static dataset, daily refresh
  - OSM Overpass speed cameras          -- static dataset, daily refresh

Real-time (Socket.IO push):
  - OpenMHz (police scanner)            -- WebSocket push from api.openmhz.com
```

---

## Sources

**Official API Documentation (HIGH confidence):**
- [OpenSky Network REST API v1.4.0](https://openskynetwork.github.io/opensky-api/rest.html)
- [OpenSky Network FAQ - Rate Limits](https://opensky-network.org/about/faq)
- [USGS Earthquake GeoJSON Summary Format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php)
- [USGS Earthquake Catalog API (FDSN)](https://earthquake.usgs.gov/fdsnws/event/1/)
- [USGS Real-time Feeds & Notifications](https://earthquake.usgs.gov/earthquakes/feed/)
- [NWS API Web Service Documentation](https://www.weather.gov/documentation/services-web-api)
- [NWS API General FAQs](https://weather-gov.github.io/api/general-faqs)
- [NASA FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/)
- [NASA FIRMS MAP_KEY Registration](https://firms.modaps.eosdis.nasa.gov/api/map_key/)
- [NASA FIRMS Data Academy - API Usage](https://firms.modaps.eosdis.nasa.gov/content/academy/data_api/firms_api_use.html)
- [CelesTrak GP Data Formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [CelesTrak Current GP Element Sets](https://celestrak.org/NORAD/elements/)
- [OpenAQ API Docs](https://docs.openaq.org/)
- [OpenAQ Rate Limits](https://docs.openaq.org/using-the-api/rate-limits)
- [OpenAQ API Key Requirements](https://docs.openaq.org/using-the-api/api-key)
- [Socrata SODA API Endpoints](https://dev.socrata.com/docs/endpoints.html)
- [Socrata App Tokens](https://dev.socrata.com/docs/app-tokens.html)
- [Socrata SODA3 API Announcement](https://support.socrata.com/hc/en-us/articles/34730618169623-SODA3-API)
- [EPA AirNow API Documentation](https://docs.airnowapi.org/webservices)
- [ADS-B Exchange v2 API Fields](https://www.adsbexchange.com/version-2-api-wip/)
- [ADS-B Exchange RapidAPI](https://www.adsbexchange.com/api-lite/)
- [Overpass API - OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Tag:highway=speed_camera - OSM Wiki](https://wiki.openstreetmap.org/wiki/Tag:highway=speed_camera)

**Community / Reverse-Engineered Sources (MEDIUM confidence):**
- [OpenMHz trunk-server GitHub](https://github.com/openmhz/trunk-server)
- [OpenMHz API Documentation (encryptedbot)](https://github.com/spdconvos/encryptedbot_py/blob/main/API/OPENMHZ_API.md)
- [PulsePoint Scraper V2 GitHub](https://github.com/TrevorBagels/PulsepointScraperV2)
- [Python parser for PulsePoint (Gist)](https://gist.github.com/Davnit/4d1ccdf6c674ce9172a251679cd0960a)
- [Ringmast4r/FLOCK - 336K Camera Map](https://github.com/Ringmast4r/FLOCK)
- [DeFlock GitHub](https://github.com/FoggedLens/deflock)
- [EFF ALPR Dataset Download](https://www.eff.org/pages/download-alpr-dataset)
- [511.org Open Data Traffic API](https://511.org/open-data/traffic)

**Library Documentation (HIGH confidence):**
- [satellite.js GitHub - SGP4/SDP4 Propagation](https://github.com/shashwatak/satellite-js)
- [satellite.js npm](https://www.npmjs.com/package/satellite.js)
- [Cesium Satellite Tracker Example](https://github.com/PetrValik/cesium-satellite-tracker)

**UI/UX Feature References (HIGH confidence):**
- [WorldView (kevtoe) - CesiumJS tactical platform](https://github.com/kevtoe/worldview)
- [WorldMonitor (koala73) - 45-layer globe dashboard](https://github.com/koala73/worldmonitor)
- [Flightradar24: How It Works](https://www.flightradar24.com/how-it-works)
- [kepler.gl Documentation - Layer patterns](https://docs.kepler.gl/)
