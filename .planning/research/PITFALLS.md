# Domain Pitfalls

**Domain:** Real-time 3D geospatial command dashboard (CesiumJS, 17+ data feeds, React/Resium)
**Researched:** 2026-03-10
**Overall confidence:** HIGH (corroborated across CesiumJS community forums, GitHub issues, official API docs, npm ecosystem)

---

## Critical Pitfalls

Mistakes that cause rewrites, crashes, or architectural dead ends. Each of these has destroyed projects or caused multi-week setbacks in the CesiumJS/geospatial community.

---

### Pitfall 1: CesiumJS Entity API Memory Leak on Dynamic Updates

**What goes wrong:** Adding and removing entities from `EntityCollection` leaks memory. The internal `AssociativeArray` creates `key: undefined` entries when entities are deleted, and these entries are never garbage collected. Parent-child entity relationships compound the leak. Over hours of continuous operation with real-time data (aircraft moving, incidents appearing/disappearing), browser memory grows unbounded until the tab crashes. Additionally, calling `GeoJsonDataSource.load()` repeatedly does not fully free GPU memory -- documented in CesiumJS issues #8812 and #9058.

**Why it happens:** CesiumJS Entity API was designed for relatively static scenes. The Entity lifecycle (create -> track -> remove) does not fully clean up internal references. This is a known, long-standing issue documented across multiple GitHub issues.

**Consequences:** After 4-8 hours of continuous use, browser memory exceeds 2-4 GB and the tab crashes. This is catastrophic for a "leave it running on a monitor" dashboard use case.

**Prevention:**
1. **Do NOT use Entity API for high-churn layers** (flights, PulsePoint dispatches). Use `BillboardCollection`, `PointPrimitiveCollection`, and `PolylineCollection` directly -- these are the Primitive API and allow in-place updates without add/remove cycles.
2. Implement an entity pool pattern: pre-allocate N entities, show/hide them via `entity.show = true/false` instead of add/remove. This avoids the AssociativeArray leak entirely.
3. For DataSource-based layers (weather alert polygons), before removing a DataSource, explicitly call `dataSource.entities.removeAll()`, then `viewer.dataSources.remove(dataSource, true)` with the `destroy` flag.
4. For data updated frequently (every 60s), do NOT use `GeoJsonDataSource.load()` in a loop. Use Primitive API and update positions in-place.
5. Monitor `performance.memory.usedJSHeapSize` in a `setInterval` and log warnings when growth exceeds thresholds.

**Detection:** Memory monotonically increasing in browser DevTools Performance tab. Chrome Task Manager showing the tab growing by 50-100 MB/hour.

**Confidence:** HIGH -- [CesiumJS GitHub #8837](https://github.com/CesiumGS/cesium/issues/8837), [Cesium Community: Major memory leak with EntityCollection](https://community.cesium.com/t/major-memory-leak-with-entitycollection-and-entity-removal/3121), [Cesium Community: Memory leak advice](https://community.cesium.com/t/memory-leak-advice/3928), [GeoJsonDataSource memory leak #8812](https://github.com/CesiumGS/cesium/issues/8812)

---

### Pitfall 2: Resium + React Re-Rendering Destroys CesiumJS Performance

**What goes wrong:** React's virtual DOM diffing triggers CesiumJS component re-initialization when it should only update properties. Resium treats CesiumJS "read-only properties" as triggers for full component destruction and re-creation. If you pass an unstable reference (e.g., `new Cesium.OpenStreetMapImageryProvider()` inline in JSX) as a prop, Resium destroys the old CesiumJS object and creates a new one on every render. React StrictMode doubles this by invoking effects twice in development.

**Why it happens:** Resium wraps imperative CesiumJS objects in declarative React components. Any React state change that causes a re-render cascading through the Resium subtree re-evaluates all props. Non-memoized CesiumJS object creation produces new references every render.

**Consequences:** Globe flickers constantly. Imagery layers reload (white tile flashes). FPS drops to 5-10. CPU usage spikes. Development is unusable without memoization.

**Prevention:**
1. **Memoize ALL CesiumJS object props** with `useMemo`. Every `ImageryProvider`, `TerrainProvider`, `Material`, or `Cartesian3` passed to Resium must be referentially stable.
2. **Never create CesiumJS objects inline in JSX.**
   - Bad: `<ImageryLayer imageryProvider={new Cesium.OpenStreetMapImageryProvider()} />`
   - Good: `const provider = useMemo(() => new Cesium.OpenStreetMapImageryProvider(), [])`
3. **Keep component hierarchy shallow** under `<Viewer>`. Place each Resium component as a direct child of Viewer when possible.
4. **Disable React StrictMode** around the `<Viewer>` component (or wrap Viewer in its own non-StrictMode subtree).
5. **Enable `requestRenderMode: true`** on Viewer initialization. This drops idle CPU from ~100% to ~0% by only rendering when the scene changes. Call `viewer.scene.requestRender()` manually when data updates arrive.
6. Always check `viewer.isDestroyed()` before operations in cleanup functions and guards.

**Detection:** Chrome DevTools React Profiler showing Resium components re-rendering on every state change. CesiumJS loading imagery tiles for already-loaded areas.

**Confidence:** HIGH -- [Resium Guide](https://resium.reearth.io/guide), [Resium Discussion #683](https://github.com/reearth/resium/discussions/683), [Cesium Blog: Explicit Rendering](https://cesium.com/blog/2018/01/24/cesium-scene-rendering-performance/)

---

### Pitfall 3: 336K ALPR Points Will Crash the Browser Without Aggressive Clustering

**What goes wrong:** Loading 336,708 ALPR camera locations as individual CesiumJS entities or billboards crashes the browser tab. Even `BillboardCollection` has limits -- 50,000+ billboards with unique images cause GPU texture atlas exhaustion and WebGL context loss. The initial JSON parse of a ~40-80 MB GeoJSON/CSV file blocks the main thread for 5-15 seconds, freezing the UI completely.

**Why it happens:** CesiumJS renders every visible entity every frame. 336K billboards means a massive vertex buffer that exceeds GPU memory. `JSON.parse` on the main thread for large files takes seconds. A 100 MB JSON file requires 300-400 MB of RAM during parsing (2-3x string-to-object multiplication).

**Consequences:** Browser tab crashes with "Aw, Snap!" or "WebGL: CONTEXT_LOST_WEBGL". Or the tab freezes for 15+ seconds during data load.

**Prevention:**
1. **Pre-cluster with Supercluster in a Web Worker.** Load the raw ALPR dataset in a Web Worker (off main thread), build the Supercluster index there, and only send visible clusters to the main thread. Supercluster processes millions of points in <1 second and queries return in <1ms.
2. **Never parse large datasets on the main thread.** Use `new Worker()` + `postMessage()` for the initial parse.
3. **Use PointPrimitiveCollection, not BillboardCollection** for cluster markers. Points are far cheaper than billboards.
4. **Implement viewport-based loading.** Supercluster's `getClusters(bbox, zoom)` returns only visible clusters.
5. **Pre-process the dataset at build time.** Convert the raw DeFlock/FLOCK CSV to a compact binary format or pre-built Supercluster index. Ship a ~5-10 MB file instead of 80 MB raw data.
6. **ALPR data is static** -- it does not need WebSocket real-time updates. Load once, cluster, and forget.

**Detection:** Browser console showing "WebGL: CONTEXT_LOST_WEBGL". Tab memory exceeding 1 GB during initial load. UI freezing during data parse.

**Confidence:** HIGH -- [CesiumJS Community: 10K entity performance](https://community.cesium.com/t/10k-entity-performance/9058), [Mapbox Supercluster Blog](https://blog.mapbox.com/clustering-millions-of-points-on-a-map-with-supercluster-272046ec5c97), [CesiumJS Community: large GeoJSON strategies](https://community.cesium.com/t/strategies-for-dealing-with-large-geojson-files/7832)

---

### Pitfall 4: OpenSky Network OAuth2 Migration Deadline Is March 18, 2026

**What goes wrong:** OpenSky Network is deprecating basic username/password authentication on March 18, 2026 -- 8 days from now. Any integration using `Authorization: Basic` headers will stop working. New accounts created after March 2025 already require OAuth2. ALL existing npm packages and tutorial code for OpenSky use the old Basic Auth pattern.

**Why it happens:** OpenSky is migrating to OAuth2 client credentials flow for security. This is a planned breaking change.

**Consequences:** If implemented with basic auth (copying from any existing example), flight tracking will break within days. Unauthenticated access (400 credits/day with 10-second resolution) may be insufficient for a dashboard polling every 10-30 seconds (requires ~8,640 requests/day).

**Prevention:**
1. **Implement OAuth2 client credentials flow from day one.** Create an API client in your OpenSky account to get `client_id` and `client_secret`.
2. **Handle token refresh.** OAuth2 tokens expire after 30 minutes. Build a token refresh mechanism in the backend fetcher.
3. **Budget for rate limits.** At 10-second polling: ~8,640 requests/day. You MUST authenticate for this volume.
4. **Cache aggressively.** Redis TTL of 10 seconds on OpenSky responses. Never poll more frequently than data resolution.
5. **Implement circuit breaker.** If 3 consecutive 429s occur, pause polling for 30 minutes.
6. **Have a fallback.** Show stale data with "Last updated: X seconds ago" rather than empty layer.

**Detection:** HTTP 401 responses from OpenSky API. Token expiration errors in backend logs.

**Confidence:** HIGH -- [OpenSky REST API Docs](https://openskynetwork.github.io/opensky-api/rest.html), [OpenSky OAuth2 Issue #67](https://github.com/openskynetwork/opensky-api/issues/67), [Home Assistant OpenSky Auth Issue #156643](https://github.com/home-assistant/core/issues/156643)

---

### Pitfall 5: All 17 APIs Polled From Frontend (No Backend Proxy)

**What goes wrong:** Fetching API data directly from the browser hits CORS restrictions on most data sources. NWS API explicitly blocks browser requests that set `User-Agent` (required by their TOS) because the CORS preflight response does not list `User-Agent` as an allowed header. Overpass, OpenSky, and others have similar CORS policies. Additionally, each browser tab runs independent polling loops, so 3 tabs = 3x API load.

**Why it happens:** It seems simpler to `fetch()` APIs directly from React. Tutorial projects do this for single-API demos.

**Consequences:** CORS errors block most data sources. Rate limits exhausted within minutes. API keys exposed in browser network traffic.

**Prevention:**
- All API calls must go through the Node.js backend, never directly from the browser
- Backend polls each API at its refresh interval, caches in Redis, broadcasts via WebSocket
- Frontend has one connection: WebSocket to backend. No fetch calls to external APIs.
- 100 concurrent browser tabs = same API load as 1 (all served from Redis cache)

**Detection:** Browser DevTools Network tab showing requests to external APIs being made from the browser. CORS errors in console.

**Confidence:** HIGH -- [NWS API CORS Discussion #312](https://github.com/weather-gov/api/discussions/312), [NWS API CORS Discussion #739](https://github.com/weather-gov/api/discussions/739), [OpenSky REST API docs](https://openskynetwork.github.io/opensky-api/rest.html)

---

### Pitfall 6: WebGL2 Context Loss Under Memory Pressure

**What goes wrong:** Chrome limits active WebGL2 contexts to 16 on desktop (8 on Android, 4 for OffscreenCanvas). CesiumJS uses 1 context. Loading 17 data layers with unique billboard textures, multiple imagery layers (satellite basemap + weather overlays + alert polygons), and 3 post-processing shaders (night vision, thermal, CRT) simultaneously can exceed GPU VRAM. CesiumJS does not handle context loss gracefully.

**Why it happens:** GPU memory is finite. The combination of terrain tiles + imagery tiles + billboard textures + framebuffer-based post-processing pushes integrated GPUs to their limits.

**Consequences:** The globe goes black. CesiumJS throws an error. The user must reload the page. No automatic recovery.

**Prevention:**
1. **Limit simultaneous active layers.** Default to 3-5 active layers on load. Let users enable more manually.
2. **Single CesiumJS Viewer only.** Never create multiple Viewer instances.
3. **Add `webglcontextlost` event listener** on the canvas and show a "Scene crashed, click to reload" overlay.
4. **Minimize unique billboard textures.** Use a shared sprite atlas for all marker icons.
5. **Only enable post-processing when activated by user.** Three simultaneous PostProcessStages consume GPU framebuffer memory.
6. **Set `maximumScreenSpaceError`** to a higher value (8-16 vs default 2) to reduce terrain tile detail and GPU memory.

**Detection:** Console error "WebGL: CONTEXT_LOST_WEBGL". Globe going black. `chrome://gpu` showing context lost events.

**Confidence:** HIGH -- [Chrome WebGL context limit](https://issues.chromium.org/issues/40939743), [CesiumJS Community: WebGL context lost](https://community.cesium.com/t/webgl-context-lost-errors-at-random-times/25674), [CesiumJS GitHub #5991](https://github.com/AnalyticalGraphicsInc/cesium/issues/5991)

---

## Moderate Pitfalls

Issues that cause wasted days or degraded functionality, but are recoverable.

---

### Pitfall 7: CallbackProperty Kills FPS with Multiple Dynamic Entities

**What goes wrong:** Using `CallbackProperty` for entity positions (common pattern for aircraft dead-reckoning) causes the callback to fire on every render frame for every entity. With 6,700 aircraft each using a CallbackProperty at 60fps = 402,000 function calls per second. FPS drops to zero. `CallbackProperty` for `entity.position` is not officially supported -- it only works "by accident."

**Prevention:**
1. **Use `SampledPositionProperty`** instead. Add two time-stamped positions (current and extrapolated future) and let CesiumJS's built-in interpolation handle smooth animation.
2. **Or use Primitive API directly.** Update `BillboardCollection`/`PointPrimitiveCollection` positions in a single batch call on each data update.
3. If CallbackProperty is needed, limit to <50 entities (e.g., only the tracked/locked entity).

**Confidence:** HIGH -- [Cesium Community: CallbackProperty kills performance](https://community.cesium.com/t/using-multiple-callbackproperty-kills-performance-drops-to-zero-fps-code-repaired/10608), [Cesium Community: high-frequency entity updates](https://community.cesium.com/t/best-approach-to-use-cesiumjs-for-multiple-updates-of-entities-at-high-frequency/11015)

---

### Pitfall 8: PulsePoint Has No Official Public API

**What goes wrong:** PulsePoint does not offer a documented public REST API for fire/EMS dispatch data. Existing scrapers reverse-engineer the internal web app API endpoints. These are undocumented, subject to change without notice, and broke in May 2025 for several days. Flock Safety has also sent legal threats to similar crowdsourced data projects (DeFlock).

**Prevention:**
1. **Treat PulsePoint as the most fragile data source.** Build the layer for graceful degradation ("PulsePoint unavailable" with no crash).
2. **Isolate the PulsePoint fetcher completely.** If its scraping breaks, no other layer should be affected.
3. **Cache responses aggressively.** Keep a "last known good" fallback in Redis even after TTL expiry.
4. **Monitor response shape changes.** Log and alert when the response JSON structure differs from expected.
5. **Have a replacement plan.** Fall back to local 911 open data feeds or city CAD dispatch data.

**Confidence:** HIGH -- [PulsePoint Scraper V2](https://github.com/TrevorBagels/PulsepointScraperV2), [ESMap PulsePoint Update May 2025](https://www.davnit.net/2025/05/esmap-pulsepoint-update/)

---

### Pitfall 9: Socket.IO Memory Leaks on Server and Client

**What goes wrong:** Socket.IO has documented memory leaks across multiple versions. Disconnected sockets are not properly garbage collected (~100 KB per page reload reconnection). Acknowledgement callbacks leak memory. Client-side event buffering during disconnection periods causes memory growth.

**Prevention:**
1. **Disable client-side event buffering during disconnection.** Set reconnection options: `{ reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 }`.
2. **Do NOT use acknowledgement callbacks** for high-frequency real-time updates. Use fire-and-forget emits.
3. **Set explicit ping/pong:** `pingInterval: 25000, pingTimeout: 20000`.
4. **Implement server-side health monitoring.** Log `process.memoryUsage()` every 60 seconds. Alert if RSS exceeds 500 MB.
5. **Restart the backend container weekly** via cron as a pragmatic mitigation.
6. **Send full state on reconnect** -- clients that reconnect need a full snapshot, not just deltas.

**Confidence:** MEDIUM -- [Socket.IO Issue #3477](https://github.com/socketio/socket.io/issues/3477), [Socket.IO Issue #4451](https://github.com/socketio/socket.io/issues/4451), [Socket.IO Issue #407](https://github.com/socketio/socket.io/issues/407)

---

### Pitfall 10: Cache Stampede on Backend Restart

**What goes wrong:** When the backend container restarts, Redis cache may be empty and all 17 API TTLs have expired simultaneously. The backend fires all 17 API requests at once. This burst can hit rate limits for multiple sources simultaneously.

**Prevention:**
1. Stagger startup polling: add jitter (randomized delay 0-30s) to each API's initial poll.
2. Pre-warm slow APIs (Overpass, FIRMS) first; start fast APIs (USGS, NWS) immediately.
3. Check Redis for unexpired cache before polling on startup -- skip if warm.

**Confidence:** HIGH -- standard distributed systems problem (thundering herd / cache stampede)

---

### Pitfall 11: ADS-B Exchange Is No Longer Free

**What goes wrong:** ADS-B Exchange discontinued its free API tier as of March 2025. The RapidAPI service requires a paid subscription (Basic plan: ~10,000 requests/month, ~$10/month). Building a "military aircraft" layer around ADSB Exchange breaks the $0 budget constraint.

**Prevention:**
1. **Use OpenSky Network for military aircraft too.** Filter by ICAO hex ranges assigned to military registrations or by callsign patterns (military callsigns follow specific naming conventions).
2. **Use ADSBHub as a free alternative** for supplementary ADS-B data.
3. **Maintain a static lookup table** of known military ICAO hex ranges for cross-referencing.

**Confidence:** HIGH -- [ADS-B Exchange API Lite](https://www.adsbexchange.com/api-lite/), [ADSBHub](https://www.adsbhub.org/)

---

### Pitfall 12: Socrata SODA3 API Requires Authentication

**What goes wrong:** Socrata's SODA API (used by hundreds of city open data portals for crime data) released SODA3 in 2025, changing the endpoint format and requiring app token authentication. Without a token, throttling is aggressive. SODA 2.0 pages at max 50,000 records.

**Prevention:**
1. **Register for a free Socrata app token** before building crime data fetchers. Authenticated: 1,000 requests per rolling hour.
2. **Support both SODA2 and SODA3 endpoint formats** since cities migrate at different times.
3. **Use `$limit` and `$offset`** for pagination. Default limit is 1,000 records; max is 50,000 per page.
4. Store app token in `.env`, not source code.

**Confidence:** HIGH -- [Socrata SODA3 API](https://support.socrata.com/hc/en-us/articles/34730618169623-SODA3-API), [Socrata App Tokens](https://dev.socrata.com/docs/app-tokens.html)

---

### Pitfall 13: OpenAQ v1/v2 Endpoints Are Dead

**What goes wrong:** OpenAQ retired v1 and v2 API endpoints on January 31, 2025. They return HTTP 410 Gone. Any code, tutorial, or npm package referencing `/v1/` or `/v2/` endpoints is broken.

**Prevention:**
1. **Use OpenAQ v3 API exclusively.** New endpoints, new features (hourly/daily/yearly averages, bounding box queries).
2. **Register for an API key.** V3 rate limits are enforced more strictly.
3. Exceeding rate limits can result in temporary or permanent bans.

**Confidence:** HIGH -- [OpenAQ v3 Announcement](https://openaq.medium.com/announcing-openaq-version-3-api-5d67fe3b7a3a), [OpenAQ Rate Limits](https://docs.openaq.org/using-the-api/rate-limits)

---

### Pitfall 14: GLSL Shaders Must Target WebGL2 (`#version 300 es`)

**What goes wrong:** CesiumJS defaults to WebGL2 since v1.102 (February 2023). Custom PostProcessStage shaders written for WebGL1 (GLSL 100) fail to compile. `texture2D()` becomes `texture()`, `varying` becomes `in`/`out`. CloudCollection is broken under WebGL2 ([GitHub #10911](https://github.com/CesiumGS/cesium/issues/10911)).

**Prevention:**
1. Write all shaders in GLSL 300 es syntax.
2. Test on at least 3 GPU vendors: Intel (integrated -- strictest about precision), NVIDIA, AMD.
3. Use `mediump float` unless `highp` is specifically needed.
4. PostProcessStage shaders MUST declare `sampler2D colorTexture` and/or `sampler2D depthTexture`, plus `vec2 v_textureCoordinates`.
5. **Avoid CloudCollection** -- broken under WebGL2 as of CesiumJS 1.139.

**Confidence:** HIGH -- [CesiumJS PR #10894](https://github.com/CesiumGS/cesium/pull/10894), [CesiumJS Community: GLSL data types in PostProcessStages](https://community.cesium.com/t/customshaders-restrict-use-of-glsl-data-types-postprocessstages-dont/32485)

---

### Pitfall 15: Overpass API Timeouts on Large Queries

**What goes wrong:** Querying Overpass for speed cameras across a large bounding box times out. Default timeout: 180 seconds. Large geographic queries exceed this. Public instance is rate-limited (~10,000 requests/day), slow, and unstable.

**Prevention:**
1. Query by region, not globally. Break into continent-sized bounding boxes.
2. Set explicit timeout: `[timeout:300]` in the Overpass query.
3. **Cache results for 24 hours.** Speed camera data changes rarely.
4. Consider a self-hosted Overpass instance (Docker: `wiktorn/overpass-api`).
5. Pre-download and ship as a static dataset, refreshed weekly via cron.

**Confidence:** HIGH -- [Overpass API Wiki](https://wiki.openstreetmap.org/wiki/Overpass_API), [Overpass timeout issue #389](https://github.com/drolbr/Overpass-API/issues/389)

---

## Minor Pitfalls

Annoyances that cost hours, not days.

---

### Pitfall 16: Docker Compose DNS Resolution Delays

**What goes wrong:** Docker's internal DNS does not cache. Every inter-container hostname lookup (backend resolving `redis`) is a DNS round-trip. Default config appends search domains and retries multiple times before resolving, adding 50-200ms latency. Service name `localhost` will NOT work between containers -- each container has its own `localhost`.

**Prevention:**
1. Set `dns_opt: [ndots:1]` in docker-compose.yml for the backend service.
2. Use Docker Compose service names as hostnames (e.g., `redis://redis:6379`, not `localhost:6379`).
3. Add `depends_on` with `condition: service_healthy` for Redis.
4. Add Redis healthcheck: `test: ["CMD", "redis-cli", "ping"]`.
5. The frontend (browser JavaScript) connects to the HOST IP (`ws://192.168.1.65:3011`), NOT the Docker service name. Nginx reverse-proxies WebSocket using service names internally.
6. Nginx WebSocket proxying requires explicit upgrade headers:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

**Confidence:** MEDIUM -- [Docker Compose Networking Mysteries](https://www.netdata.cloud/academy/docker-compose-networking-mysteries/), [DNS Resolution in Containers](https://medium.com/@mdmarjanrafi/devops-scenario-12-why-dns-resolution-inside-your-containers-is-slow-8e86f4ea3e8e)

---

### Pitfall 17: Redis Memory Bloat with Large JSON Values

**What goes wrong:** Storing raw API responses as JSON strings in Redis uses 2-3x more memory than the raw JSON size due to internal data structure overhead. With 17 data sources potentially returning 1-10 MB each, Redis memory can reach 100-300 MB.

**Prevention:**
1. **Normalize API responses** to minimal GeoJSON schema before caching. Strip unnecessary metadata.
2. **Compress large values with gzip** before storing (~90% reduction).
3. **Set `maxmemory: 256mb`** and `maxmemory-policy: allkeys-lru`. Redis evicts old data instead of crashing.
4. **No persistence needed.** This is a cache. If Redis restarts, data is re-fetched.
5. Monitor: `redis-cli INFO memory`.

**Confidence:** HIGH -- [Redis Memory Optimization](https://medium.com/platform-engineer/redis-memory-optimization-techniques-best-practices-3cad22a5a986), [Redis JSON RAM Usage](https://redis.io/docs/latest/develop/data-types/json/ram/)

---

### Pitfall 18: Cesium Ion Token Silently Expires

**What goes wrong:** CesiumJS ships with a demo Ion token that works initially but expires. The globe then shows a watermark, low-res imagery, and flat terrain with no error message.

**Prevention:**
1. **Register for a free Cesium Ion account** and create your own token.
2. Store as `VITE_CESIUM_ION_TOKEN` in `.env`. Never commit.
3. Set "Allowed URLs" restrictions on the token to `http://192.168.1.65` and `http://192.168.1.50`.
4. **Monitor free tier quota.** Community tier: 5 GB storage, 15 GB/month streaming. A 24/7 dashboard may approach the streaming limit.
5. Create a read-only, URL-restricted token -- not the default all-scopes token.

**Confidence:** HIGH -- [Cesium Ion Pricing](https://cesium.com/platform/cesium-ion/pricing/)

---

### Pitfall 19: CelesTrak TLE Format Reaching 5-Digit Catalog Number Limit

**What goes wrong:** The TLE format uses a 5-digit NORAD catalog number field. As of early 2026, the catalog is at ~68,100 objects. By approximately July 2026, new objects will have 6-digit catalog numbers and will NOT be available in TLE format. Additionally, CelesTrak rate limits: 100 HTTP errors in 2 hours gets your IP firewalled.

**Prevention:**
1. **Use CelesTrak's GP JSON format** instead of legacy TLE text format. GP JSON supports 6+ digit catalog numbers.
2. **Use OMM (Orbit Mean-Elements Message) XML/JSON** as alternative format.
3. Cache TLE/GP data for at least 3 hours.
4. Handle CelesTrak rate limiting gracefully with backoff.

**Confidence:** HIGH -- [CelesTrak GP Data Formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)

---

### Pitfall 20: NASA FIRMS Requires a MAP_KEY

**What goes wrong:** NASA FIRMS has its own API key system called MAP_KEY, separate from a general NASA API key. Without it, requests return 403. Rate limit: 5,000 transactions per 10-minute window. Multi-day data requests count as multiple transactions.

**Prevention:**
1. Sign up for free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key/
2. Cache wildfire data for 3 hours (matches satellite pass frequency).
3. Request only 24-hour data to keep transaction count low.

**Confidence:** HIGH -- [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/)

---

### Pitfall 21: Time Zone Handling Across 17 Global Data Sources

**What goes wrong:** Different APIs return timestamps in different formats and time zones. OpenSky: Unix epoch seconds. USGS: ISO 8601 UTC. NWS: ISO 8601 local time zones. PulsePoint: local time without zone info. Crime portals: whatever the city prefers. Mixing these without normalization causes incorrect time filtering ("last hour" shows data from 6 hours ago).

**Prevention:**
1. **Normalize ALL timestamps to Unix epoch milliseconds (UTC)** in the backend before caching.
2. Store a `timestamp_utc` field in every normalized GeoJSON Feature property.
3. Convert to local time only in the frontend for display using `Intl.DateTimeFormat`.
4. Test time filtering with data from multiple time zones.

**Confidence:** HIGH -- universal multi-source data aggregation pitfall

---

### Pitfall 22: DeFlock/FLOCK Data Source Fragility

**What goes wrong:** DeFlock.me is community-run with no uptime SLA. Flock Safety has sent cease-and-desist demands. The data may become unavailable at any time. The FLOCK GitHub dataset (Ringmast4r/FLOCK) is a static snapshot.

**Prevention:**
1. **Download and bundle the ALPR dataset as a static asset** in the Docker image. Do not depend on live fetching.
2. Use the [Ringmast4r/FLOCK GitHub dataset](https://github.com/Ringmast4r/FLOCK) as the pre-processed source.
3. Show "Data as of: [date]" on the ALPR layer.
4. Keep EFF Atlas of Surveillance data as supplementary source.

**Confidence:** HIGH -- [EFF: DeFlock Refuses Cease and Desist](https://www.eff.org/deeplinks/2025/02/anti-surveillance-mapmaker-refuses-flock-safetys-cease-and-desist-demand)

---

### Pitfall 23: OpenMHz Has No Formal API

**What goes wrong:** OpenMHz provides live police/fire scanner audio but has no documented public API. Audio stream URLs may change. Police radio encryption is spreading (multiple jurisdictions encrypting in 2025).

**Prevention:**
1. Link to OpenMHz in a new tab rather than embedding audio directly.
2. Use Broadcastify as backup audio source.
3. Treat scanner audio as optional/degradable feature.
4. Label coverage as "Where Available" -- encryption is reducing available feeds.

**Confidence:** MEDIUM -- [OpenMHz](https://openmhz.com/), [Radio encryption news](https://bethesdamagazine.com/2025/04/04/moco-police-radio-encrypt-moco-police-leaked/)

---

### Pitfall 24: Satellite SGP4 Propagation on Main Thread

**What goes wrong:** CelesTrak's active satellite catalog has ~6,000 objects. Running SGP4 propagation (satellite.js) for all of them every second on the main thread blocks JavaScript for 50-200ms, causing visible frame drops.

**Prevention:**
1. Run SGP4 propagation in a Web Worker (frontend) or Worker Thread (backend).
2. Backend approach: propagate positions server-side every 1 second, push via WebSocket.
3. If frontend propagation: limit to visible satellites only (~200 at any viewport).
4. TLEs expire -- refresh from CelesTrak every 24 hours. SGP4 predictions degrade after 7-14 days of stale data.

**Confidence:** HIGH -- [Cesium Community: orbit performance problems](https://community.cesium.com/t/performance-problems-when-plotting-an-orbit-with-cesiumjs/30209)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Globe + Backend | Resium re-render flicker (#2), CesiumJS static asset config | Memoize ALL CesiumJS object props. Follow cesium-vite-example exactly. |
| Phase 1: Docker Compose | DNS resolution (#16), Redis startup race, `localhost` trap | Use service names. `depends_on` with healthcheck. `ndots:1`. |
| Phase 1: Architecture | Frontend direct API calls (#5), no backend proxy | All external calls through backend -- no exceptions. |
| Phase 1: Project setup | Ion token in source (#18) | Environment variable + `.env.local` + `.gitignore` from day 1. |
| Phase 2: Flight tracking | OpenSky OAuth2 deadline 8 days away (#4), rate limits | OAuth2 from day one. 10s minimum poll interval. Circuit breaker. |
| Phase 2: Flight rendering | CallbackProperty FPS death (#7), Entity API overhead (#1) | SampledPositionProperty or Primitive API. Never CallbackProperty at scale. |
| Phase 2: ALPR cameras | 336K point crash (#3), GeoJSON parse blocking | Web Worker + Supercluster. Pre-process dataset. Ship static. |
| Phase 2: Speed cameras | Overpass timeout (#15) | Query by region, cache 24h, set explicit timeout. |
| Phase 2: Earthquakes | Time zone inconsistency (#21) | Normalize USGS timestamps to UTC epoch ms in backend. |
| Phase 2: Backend startup | Cache stampede (#10) | Staggered startup with jitter (0-30s per source). |
| Phase 3: Crime data | Socrata SODA3 auth (#12) | Register app token. Support both v2/v3 endpoints. |
| Phase 3: PulsePoint | No official API (#8), data source fragility | Isolate fetcher, graceful degradation, cache last-known-good. |
| Phase 3: Police scanner | No formal API (#23), encryption spreading | Link to OpenMHz externally. Treat as optional feature. |
| Phase 4: Satellites | TLE format limit July 2026 (#19), SGP4 main thread (#24) | Use GP JSON format. Worker thread for propagation. |
| Phase 4: Military aircraft | ADS-B Exchange costs money (#11) | Use OpenSky + ICAO hex range filtering instead. |
| Phase 4: GLSL shaders | WebGL2 GLSL 300 es requirements (#14), GPU compatibility | Test on Intel/NVIDIA/AMD. Use correct GLSL syntax. |
| Phase 4: Weather alerts | NWS CORS blocks frontend (#5) | All NWS calls through backend proxy only. |
| Phase 4: Air quality | OpenAQ v1/v2 dead (#13) | Use v3 API exclusively. Register API key. |
| Phase 4: Wildfires | NASA FIRMS requires MAP_KEY (#20) | Register free MAP_KEY before development. |
| All phases: Memory | Entity API leaks (#1), Socket.IO leaks (#9), WebGL context loss (#6) | Primitive API for dynamic layers. Monitor memory. Limit active layers. |
| All phases: Rate limits | 17 sources with different rate limits | Redis TTL per source. Backend-only fetching. Never poll from frontend. |

---

## API Fragility Rankings

Ranked from most fragile (likely to break) to most stable:

| Rank | Data Source | Fragility | Reason |
|------|------------|-----------|--------|
| 1 | PulsePoint | VERY HIGH | No official API, reverse-engineered endpoints, broke May 2025 |
| 2 | OpenMHz | HIGH | No formal API, police radio encryption spreading |
| 3 | DeFlock/ALPR | HIGH | Community project, active legal threats from Flock Safety |
| 4 | ADS-B Exchange | HIGH | No longer free, paid API only as of March 2025 |
| 5 | OpenSky Network | MEDIUM | OAuth2 breaking change March 18, 2026 (8 days away) |
| 6 | Overpass API | MEDIUM | Public instance slow/unstable, rate limited |
| 7 | Socrata/SODA | MEDIUM | SODA3 migration, per-city endpoint variation |
| 8 | OpenAQ | MEDIUM | v1/v2 dead, v3 rate limits enforced, ban risk |
| 9 | CelesTrak | LOW | Long-running, TLE format migration planned July 2026 |
| 10 | State DOT/511 | LOW | Per-state variation in formats, but data is public |
| 11 | USGS Earthquakes | VERY LOW | Official US government GeoJSON feed, stable 10+ years |
| 12 | NWS Weather | VERY LOW | Official US government API, CORS quirk but reliable |
| 13 | NASA FIRMS | VERY LOW | Official NASA API, free MAP_KEY, generous rate limits |

---

## Sources

### CesiumJS Performance and Memory
- [CesiumJS GitHub #8837: Memory leak](https://github.com/CesiumGS/cesium/issues/8837)
- [Cesium Community: Major memory leak with EntityCollection](https://community.cesium.com/t/major-memory-leak-with-entitycollection-and-entity-removal/3121)
- [Cesium Community: Memory leak advice](https://community.cesium.com/t/memory-leak-advice/3928)
- [Cesium Community: EntityCollection vs BillboardCollection performance](https://community.cesium.com/t/entitycollection-performance-vs-billboardcollection-labelcollection/8168)
- [Cesium Blog: Entity API Performance](https://cesium.com/blog/2018/06/21/entity-api-performance/)
- [Cesium Community: 10K entity performance](https://community.cesium.com/t/10k-entity-performance/9058)
- [Cesium Community: 15,000+ entity performance](https://community.cesium.com/t/15-000-entity-performance/8451)
- [Cesium Community: CallbackProperty kills performance](https://community.cesium.com/t/using-multiple-callbackproperty-kills-performance-drops-to-zero-fps-code-repaired/10608)
- [Cesium Community: High-frequency entity updates](https://community.cesium.com/t/best-approach-to-use-cesiumjs-for-multiple-updates-of-entities-at-high-frequency/11015)
- [Cesium Blog: Explicit Rendering / requestRenderMode](https://cesium.com/blog/2018/01/24/cesium-scene-rendering-performance/)
- [GeoJsonDataSource memory leak #8812](https://github.com/CesiumGS/cesium/issues/8812)
- [GeoJsonDataSource memory not freed #9058](https://github.com/CesiumGS/cesium/issues/9058)
- [Cesium Community: Large GeoJSON strategies](https://community.cesium.com/t/strategies-for-dealing-with-large-geojson-files/7832)

### CesiumJS WebGL and Shaders
- [CesiumJS GitHub #5991: Handle lost WebGL contexts](https://github.com/AnalyticalGraphicsInc/cesium/issues/5991)
- [CesiumJS PR #10894: WebGL2 default](https://github.com/CesiumGS/cesium/pull/10894)
- [CesiumJS GitHub #10911: Clouds broken under WebGL2](https://github.com/CesiumGS/cesium/issues/10911)
- [Cesium Community: WebGL context lost errors](https://community.cesium.com/t/webgl-context-lost-errors-at-random-times/25674)
- [Cesium Community: GLSL data types in PostProcessStages](https://community.cesium.com/t/customshaders-restrict-use-of-glsl-data-types-postprocessstages-dont/32485)
- [Chrome WebGL context limit](https://issues.chromium.org/issues/40939743)

### Resium / React Integration
- [Resium Guide](https://resium.reearth.io/guide)
- [Resium Discussion #683: requestRenderMode](https://github.com/reearth/resium/discussions/683)

### Data Source APIs
- [OpenSky REST API Documentation](https://openskynetwork.github.io/opensky-api/rest.html)
- [OpenSky OAuth2 Migration Issue](https://github.com/openskynetwork/opensky-api/issues/67)
- [Home Assistant OpenSky Auth Issue](https://github.com/home-assistant/core/issues/156643)
- [ADS-B Exchange API Lite](https://www.adsbexchange.com/api-lite/)
- [ADSBHub Free Alternative](https://www.adsbhub.org/)
- [NWS API CORS Discussion #312](https://github.com/weather-gov/api/discussions/312)
- [NWS API CORS Discussion #739](https://github.com/weather-gov/api/discussions/739)
- [Overpass API Wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Overpass API Timeout Issue #389](https://github.com/drolbr/Overpass-API/issues/389)
- [PulsePoint Scraper V2](https://github.com/TrevorBagels/PulsepointScraperV2)
- [ESMap PulsePoint Update May 2025](https://www.davnit.net/2025/05/esmap-pulsepoint-update/)
- [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/)
- [CelesTrak GP Data Formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- [OpenAQ v3 Announcement](https://openaq.medium.com/announcing-openaq-version-3-api-5d67fe3b7a3a)
- [OpenAQ Rate Limits](https://docs.openaq.org/using-the-api/rate-limits)
- [Socrata SODA3 API](https://support.socrata.com/hc/en-us/articles/34730618169623-SODA3-API)
- [Socrata App Tokens](https://dev.socrata.com/docs/app-tokens.html)
- [EFF: DeFlock Refuses Flock Safety Cease and Desist](https://www.eff.org/deeplinks/2025/02/anti-surveillance-mapmaker-refuses-flock-safetys-cease-and-desist-demand)
- [Ringmast4r/FLOCK GitHub](https://github.com/Ringmast4r/FLOCK)
- [OpenMHz](https://openmhz.com/)
- [Cesium Ion Pricing](https://cesium.com/platform/cesium-ion/pricing/)

### Infrastructure
- [Socket.IO Memory Leak Issue #3477](https://github.com/socketio/socket.io/issues/3477)
- [Socket.IO Memory Leak Issue #4451](https://github.com/socketio/socket.io/issues/4451)
- [Socket.IO Disconnected Socket Memory Issue #407](https://github.com/socketio/socket.io/issues/407)
- [Docker Compose Networking Mysteries](https://www.netdata.cloud/academy/docker-compose-networking-mysteries/)
- [DNS Resolution in Containers](https://medium.com/@mdmarjanrafi/devops-scenario-12-why-dns-resolution-inside-your-containers-is-slow-8e86f4ea3e8e)
- [Redis Memory Optimization](https://medium.com/platform-engineer/redis-memory-optimization-techniques-best-practices-3cad22a5a986)
- [Redis JSON RAM Usage](https://redis.io/docs/latest/develop/data-types/json/ram/)
- [Mapbox Supercluster Blog](https://blog.mapbox.com/clustering-millions-of-points-on-a-map-with-supercluster-272046ec5c97)
- [MapLibre: Large GeoJSON Optimization](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/)
