# Technology Stack

**Project:** Real-Time 3D Geospatial Command Dashboard
**Researched:** 2026-03-10
**Overall confidence:** HIGH (core libraries verified via npm registry and official docs as of March 2026)

---

## Recommended Stack

### Frontend Core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | 19.x (or 18.3+) | UI component framework | Resium 1.19.4 requires `>=18.2.0`, supports React 19; standard for TypeScript SPA development |
| TypeScript | 5.x | Type safety across 17 data schemas | Prevents schema drift when integrating heterogeneous APIs; Resium and CesiumJS both ship first-party types |
| Vite | 6.x (latest 6.3.2) | Build tool and dev server | Official CesiumJS recommended build tool; HMR works correctly with static asset copying strategy; `vite-plugin-cesium` is unmaintained so use official `viteStaticCopy` approach |
| CesiumJS | 1.139.1 | 3D globe engine | Latest stable as of March 2026; WebGL2 by default since v1.102 (Feb 2023); native satellite orbit, 3D Tiles, PostProcessStages, terrain -- nothing else provides this feature set |
| Resium | 1.19.4 | React wrappers for CesiumJS | Declarative entity management; peer dep: cesium `"1.x"` -- any 1.x version works |

**Compatibility matrix verified:**
- Resium 1.19.4 peer deps: `cesium "1.x"`, `react ">=18.2.0"`, `react-dom ">=18.2.0"`
- CesiumJS 1.139.1 is valid; Resium accepts all 1.x versions
- React 18.3+ or React 19 both supported
- TypeScript 5.x + CesiumJS types: bundled in `cesium` package -- do NOT install `@types/cesium` (removed, no longer needed)

### Build Configuration (CRITICAL)

`vite-plugin-cesium` (v1.2.23) is **abandoned** -- the author has stated it will not be maintained. Use the official Cesium-maintained approach instead:

```bash
npm install -D vite-plugin-static-copy
```

Required `vite.config.ts` structure:
- Define `CESIUM_BASE_URL` as a global pointing to your static asset path
- Use `viteStaticCopy` to copy `ThirdParty`, `Workers`, `Assets`, and `Widgets` directories from `node_modules/cesium/Build/Cesium/` to your dist
- Set `optimizeDeps.exclude: ['cesium']` to prevent Vite from trying to bundle CesiumJS (it must remain as static assets)
- Import as `import * as Cesium from 'cesium'` -- there is no default export

Reference: [CesiumGS/cesium-vite-example](https://github.com/CesiumGS/cesium-vite-example) is the official minimal setup.

### Frontend Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| supercluster | 8.0.1 | Point clustering for 300K+ points | Use for every high-density layer (ALPR, speed cameras, crime); hierarchical spatial index handles zoom-level thinning |
| @types/supercluster | latest | TypeScript types for supercluster | Install as devDependency alongside supercluster |
| satellite.js | 6.0.2 | SGP4/SDP4 orbital propagation from TLE data | Calculate real-time satellite positions from TLE/OMM data; convert ECI to geodetic coordinates for CesiumJS rendering |
| socket.io-client | 4.8.3 | WebSocket client | Pair with server-side socket.io for auto-reconnect and built-in broadcast |
| zustand | 5.x | Client state management | Layer toggle state, visual mode state; lighter than Redux for this use case |

### Backend Core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22 LTS | Runtime | Current LTS as of 2025-2026; native async/await, built-in `fetch`, TypeScript via `tsx` |
| TypeScript | 5.x | Type safety | Same types between frontend and backend for WebSocket payloads and API schemas |
| Fastify | 5.8.x | HTTP server + REST API | 2-3x faster than Express in benchmarks; first-class TypeScript support; built-in JSON schema validation for 17 API response shapes |
| socket.io | 4.8.3 | Real-time broadcast to clients | Auto-reconnect, heartbeat, namespace support; better DX than raw `ws` for broadcast fan-out to N browser clients |

**IMPORTANT: Fastify 5 + Socket.IO Integration**

The `fastify-socket.io` npm plugin (v5.1.0) does **NOT** support Fastify 5 -- it has a peer dependency on `fastify "4.x.x"`. There is an open issue (ducktors/fastify-socket.io#180) tracking this.

**Workaround:** Attach Socket.IO directly to Fastify's underlying Node.js HTTP server instance. Fastify exposes this as `fastify.server`:

```typescript
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

const app = Fastify();

// Register Fastify routes first...

await app.listen({ port: 3011, host: '0.0.0.0' });

// Attach Socket.IO to the underlying http.Server
const io = new SocketIOServer(app.server, {
  cors: { origin: '*' },
  path: '/socket.io',
});

io.on('connection', (socket) => {
  socket.join('global-feed');
});
```

This gives HTTP + WebSocket on one port without the plugin. The `@fastify/websocket` plugin is NOT needed when using Socket.IO (they serve the same purpose).

### Data Fetching / API Polling

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| native fetch | Node 22 built-in | HTTP calls to external APIs | Node 22 has stable `fetch` globally -- no additional package needed |
| node-cron | 3.x | Scheduled polling intervals | Cron-style scheduling for per-source refresh intervals (60s earthquake, 30s flights, etc.) |

### Redis Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Redis | 7.2-alpine (Docker) | In-memory cache with TTL | Free, fast, TTL maps directly to per-API rate limit windows |
| redis (node-redis) | 5.11.0 | Node.js Redis client | Official Redis-maintained client; native TypeScript types built-in; `await client.setEx(key, ttl, value)` pattern |

**Redis caching strategy for API rate limiting:**

Use the Cache-Aside (Lazy Loading) pattern with TTL-based expiration per data source:

```typescript
// Per-source TTL configuration
const SOURCE_TTL: Record<string, number> = {
  'flights':      30,   // OpenSky refreshes every 10s, cache 30s
  'earthquakes':  60,   // USGS updates every 60s
  'weather':     300,   // OpenWeatherMap 5-min intervals
  'satellites':   60,   // TLE data changes slowly
  'wildfires':   300,   // NASA FIRMS 5-min lag
  'crime':      3600,   // Historical data, hourly refresh
  'alpr':       3600,   // Static camera positions
};

async function getCachedOrFetch(source: string, fetchFn: () => Promise<any>) {
  const cached = await redis.get(`geo:${source}`);
  if (cached) return JSON.parse(cached);
  const data = await fetchFn();
  await redis.setEx(`geo:${source}`, SOURCE_TTL[source], JSON.stringify(data));
  return data;
}
```

**Redis configuration:**
```
maxmemory-policy: allkeys-lru
maxmemory: 256mb
```
No persistence needed (cache only -- data is re-fetched on cold start).

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Docker | 24+ | Containerization | Consistent with HomeCluster patterns; single `docker compose up` deployment |
| Docker Compose | v2 | Multi-container orchestration | Three services: frontend (nginx), backend (node), redis |
| nginx | alpine | Frontend static file server + reverse proxy | Serve built Vite assets; proxy `/api` and `/socket.io` to backend container |

---

## Satellite Tracking: satellite.js Deep Dive

### Why satellite.js (not tle.js)

| | satellite.js 6.0.2 | tle.js |
|---|---|---|
| Level | Low-level SGP4/SDP4 engine | Higher-level wrapper around satellite.js |
| Control | Full access to ECI/ECF/geodetic transforms | Simplified lat/lon API |
| CesiumJS fit | Better -- you need raw ECI coordinates for `SampledPositionProperty` | Abstracts away the coordinates CesiumJS needs |
| TypeScript | Built-in types since v5 | Types available |
| Maintenance | v6.0.2 released Jan 2026 (active) | Less frequent updates |

Use `satellite.js` directly because CesiumJS satellite visualization requires ECI-to-Cartesian3 conversion, and satellite.js gives you the raw position/velocity vectors needed for `Cesium.Cartesian3.fromRadians()`.

### Integration Pattern with CesiumJS

```typescript
import * as satellite from 'satellite.js';
import * as Cesium from 'cesium';

function tleToPositions(tle1: string, tle2: string, startTime: Date, steps: number) {
  const satrec = satellite.twoline2satrec(tle1, tle2);
  const positions: { time: Cesium.JulianDate; position: Cesium.Cartesian3 }[] = [];

  for (let i = 0; i < steps; i++) {
    const time = new Date(startTime.getTime() + i * 60000); // 1-min steps
    const result = satellite.propagate(satrec, time);
    if (!result.position || typeof result.position === 'boolean') continue;

    const gmst = satellite.gstime(time);
    const geo = satellite.eciToGeodetic(result.position, gmst);

    positions.push({
      time: Cesium.JulianDate.fromDate(time),
      position: Cesium.Cartesian3.fromRadians(
        geo.longitude,
        geo.latitude,
        geo.height * 1000 // satellite.js returns km, Cesium expects meters
      ),
    });
  }
  return positions;
}
```

**Key gotcha:** `satellite.js` returns height in **kilometers**, CesiumJS expects **meters**. Multiply by 1000.

**Key gotcha:** `propagate()` returns `false` (not null) for position/velocity when propagation fails (e.g., TLE too old). Always check `typeof result.position === 'boolean'` before using.

### TLE Data Sources (free, no API key)

| Source | URL | Update Frequency |
|--------|-----|-----------------|
| CelesTrak | `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle` | Daily |
| CelesTrak (JSON/OMM) | `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json` | Daily |
| Space-Track.org | `https://www.space-track.org/` | Real-time (requires free account) |

CelesTrak is the recommended source for this project -- no authentication required, free, and provides TLE data for all active satellites (~8,000+).

### Sampling Density for Orbit Paths

For accurate orbit visualization in CesiumJS:
- **LEO satellites (ISS, Starlink):** Sample every 30-60 seconds over a 90-minute orbit
- **MEO satellites (GPS):** Sample every 5 minutes over a 12-hour orbit
- **GEO satellites:** Sample every 30 minutes (they barely move)

Under-sampling causes jagged orbit lines that may clip through terrain. Over-sampling wastes memory. Use `SampledPositionProperty` with `LagrangePolynomialApproximation` interpolation for smooth curves between samples.

---

## GLSL Post-Processing Shaders in CesiumJS

### Architecture

CesiumJS provides two shader systems:
1. **CustomShader** -- applies to individual 3D Tiles or glTF models (not useful here)
2. **PostProcessStage** -- full-screen fragment shader applied after scene render (this is what we need)

### Built-in Effects (PostProcessStageLibrary)

CesiumJS ships with these ready-to-use post-processing effects:

| Effect | Method | Notes |
|--------|--------|-------|
| Night Vision | `PostProcessStageLibrary.createNightVisionStage()` | Green-tinted intensifier effect -- built-in, zero custom GLSL needed |
| Edge Detection | `PostProcessStageLibrary.createEdgeDetectionStage()` | Sobel/Roberts edge detection |
| Silhouette | `PostProcessStageLibrary.createSilhouetteStage()` | Outline effect on objects |
| Ambient Occlusion | `PostProcessStageLibrary.createAmbientOcclusionStage()` | HBAO shadow approximation |
| Depth of Field | `PostProcessStageLibrary.createDepthOfFieldStage()` | Bokeh blur |
| Lens Flare | `PostProcessStageLibrary.createLensFlareStage()` | Sun lens flare |
| FXAA | Built-in (scene.postProcessStages.fxaa) | Anti-aliasing |

**Night vision is built-in.** Do not write a custom shader for it.

### Custom PostProcessStage Shader Pattern

For effects NOT in the library (thermal view, CRT scanlines, threat highlighting):

```glsl
// GLSL 300 ES syntax (CesiumJS auto-downgrades for WebGL1 via demodernizeShader)
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;  // optional -- if you need depth
in vec2 v_textureCoordinates;

// Custom uniforms passed from JS
uniform float intensity;
uniform vec3 tintColor;

void main() {
  vec4 color = texture(colorTexture, v_textureCoordinates);

  // Example: thermal false-color effect
  float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 thermal = mix(
    vec3(0.0, 0.0, 1.0),  // cold = blue
    vec3(1.0, 0.0, 0.0),  // hot = red
    luminance
  );

  out_FragColor = vec4(mix(color.rgb, thermal, intensity), color.a);
}
```

### JavaScript Integration

```typescript
const thermalStage = new Cesium.PostProcessStage({
  fragmentShader: thermalGLSL, // imported as string
  uniforms: {
    intensity: () => store.getState().thermalIntensity, // dynamic per-frame
    tintColor: new Cesium.Cartesian3(1.0, 0.5, 0.0),   // constant
  },
});
viewer.scene.postProcessStages.add(thermalStage);

// Toggle on/off
thermalStage.enabled = false;
```

### GLSL Version Requirements

- CesiumJS defaults to WebGL2 since v1.102 (Feb 2023)
- Write shaders in **GLSL 300 ES** syntax: use `in`/`out`, `texture()`, `out_FragColor`
- Do NOT include `#version 300 es` directive -- CesiumJS prepends it automatically
- CesiumJS auto-downgrades to GLSL 100 via `demodernizeShader` if WebGL1 is detected
- Built-in Cesium GLSL functions available: `czm_selected()`, `czm_readDepth()`, etc.

### Chaining Multiple Effects

Use `PostProcessStageComposite` to chain effects (output of one feeds input of next):

```typescript
const composite = new Cesium.PostProcessStageComposite({
  stages: [thermalStage, scanlineStage],
  inputPreviousStageTexture: true, // chain output -> input
});
viewer.scene.postProcessStages.add(composite);
```

---

## Supercluster Integration with CesiumJS

### Why Supercluster Over CesiumJS EntityCluster

CesiumJS has a built-in `EntityCluster` class, but it has critical limitations for this project:

| Feature | CesiumJS EntityCluster | Supercluster |
|---------|----------------------|-------------|
| Max points (smooth) | ~10K entities before lag | 6M+ points demonstrated |
| Clustering algorithm | Screen-space overlap detection | Hierarchical greedy clustering (pre-indexed) |
| Zoom-level pre-computation | No -- recalculates every frame | Yes -- indexes all zoom levels on load |
| Works with PointPrimitiveCollection | No -- Entity API only | Yes -- you control rendering |

**Verdict:** CesiumJS EntityCluster is designed for hundreds to low thousands of entities. With 300K+ ALPR cameras alone, it will cause severe frame drops. Use Supercluster for spatial indexing and render the results with `PointPrimitiveCollection` (not Entity API).

### Rendering Strategy: PointPrimitiveCollection

For 300K+ points, do NOT use Resium `<Entity>` components. Use CesiumJS's low-level `PointPrimitiveCollection`:

- `PointPrimitiveCollection` renders millions of points with minimal overhead
- Points are GPU-batched -- dramatically faster than per-entity overhead
- Labels: use `LabelCollection` alongside for cluster count labels
- Billboards: use `BillboardCollection` only for icons (not colored dots)

**Performance hierarchy (fastest to slowest):**
1. `PointPrimitiveCollection` -- simple colored dots, millions OK
2. `BillboardCollection` -- image-based markers, 50K+ OK
3. Entity API with clustering -- 10K max before frame drops

### Integration Pattern

```typescript
import Supercluster from 'supercluster';
import { useMemo, useEffect } from 'react';

// Initialize once with all points
const index = useMemo(() => {
  const sc = new Supercluster({
    radius: 60,      // cluster radius in pixels
    maxZoom: 16,      // stop clustering at this zoom
    minPoints: 3,     // minimum points to form a cluster
  });
  sc.load(geoJsonPoints); // Array of GeoJSON Feature<Point>
  return sc;
}, [geoJsonPoints]);

// Re-cluster when camera moves
function onCameraChanged(viewer: Cesium.Viewer) {
  const rect = viewer.camera.computeViewRectangle();
  if (!rect) return;

  const zoom = computeZoomFromHeight(viewer.camera.positionCartographic.height);
  const bbox: [number, number, number, number] = [
    Cesium.Math.toDegrees(rect.west),
    Cesium.Math.toDegrees(rect.south),
    Cesium.Math.toDegrees(rect.east),
    Cesium.Math.toDegrees(rect.north),
  ];

  const clusters = index.getClusters(bbox, Math.floor(zoom));
  renderToPointCollection(viewer, clusters);
}
```

### Zoom Level Mapping

CesiumJS does not have a native "zoom level" like Mapbox. Convert camera height to a Mapbox-equivalent zoom level for Supercluster:

```typescript
function computeZoomFromHeight(heightMeters: number): number {
  // Approximate: zoom 0 = 20,000km, each zoom halves the height
  return Math.max(0, Math.min(20, Math.log2(20_000_000 / heightMeters)));
}
```

---

## Cesium Ion: Token Requirements and Free Tier

**Critical: CesiumJS requires a Cesium Ion access token at runtime.**

Even if you use no Ion-hosted assets, CesiumJS defaults to loading Cesium World Terrain and Bing Maps imagery from Cesium Ion servers. Without a token, the globe loads with a low-res default ellipsoid and shows a watermark warning.

**Free Community tier (as of 2025):**
- Storage: 5 GB
- Data streaming: 15 GB/month
- Unlimited apps and end users
- No credit card required
- Sign up at: https://cesium.com/ion/

**Setup:**
```typescript
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
```
Store in `.env.local` (never commit). Pass to Docker via build-time environment variable.

**Alternative if Ion is not desired:** Use `Cesium.OpenStreetMapImageryProvider` for OSM tiles plus `Cesium.EllipsoidTerrainProvider` for flat terrain. This degrades visual quality significantly. For a photorealistic globe the Ion free tier is the right call.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Globe engine | CesiumJS 1.139 | Mapbox GL JS + deck.gl | Mapbox has no native satellite orbit support; deck.gl WebGL layers don't compose with terrain; CesiumJS is the reference implementation for terrain + 3D Tiles + CZML orbits |
| Globe engine | CesiumJS 1.139 | Google Maps 3D Tiles API | Paid API, breaks the $0 constraint; no custom GLSL post-processing |
| React wrappers | Resium | Raw CesiumJS imperative refs | Without Resium, managing entity lifecycles in React requires careful ref + useEffect patterns that Resium handles correctly; Resium adds minimal overhead |
| Build tool | Vite 6.x | Create React App | CRA is deprecated; Vite is the official CesiumJS recommendation |
| Build tool | Vite 6.x | Webpack | CesiumJS has Webpack config docs but Vite is simpler and Cesium maintains a first-party Vite example |
| Vite plugin | viteStaticCopy | vite-plugin-cesium | `vite-plugin-cesium` is abandoned (author confirmed); `viteStaticCopy` is maintained and used in the official Cesium Vite example |
| HTTP framework | Fastify 5.8 | Express | Fastify is 2-3x faster; native TypeScript; built-in JSON schema validation useful for validating 17 API shapes |
| HTTP framework | Fastify 5.8 | NestJS | NestJS overhead is unnecessary for a personal dashboard; Fastify is sufficient and simpler |
| WebSocket | Socket.IO 4.8 | raw `ws` | Socket.IO auto-reconnect is valuable on a home network; broadcast/room semantics simplify per-layer subscriptions |
| Socket.IO plugin | Manual attach via `fastify.server` | fastify-socket.io | Plugin does NOT support Fastify 5 (peer dep conflict); manual attach is 3 lines of code |
| Redis client | node-redis v5 | ioredis | node-redis v5 is the official client with better TypeScript support for single-node Redis |
| State mgmt | zustand | Redux Toolkit | Redux is overkill for layer toggles and UI mode state; zustand is 1KB and simpler |
| Clustering | supercluster | CesiumJS EntityCluster | EntityCluster uses Entity API which caps out at ~10K points; supercluster handles millions with pre-computed spatial index |
| Clustering | supercluster | custom k-d tree | supercluster is a Mapbox-maintained spatial index purpose-built for this exact use case; battle-tested on 6M+ points |
| TLE propagation | satellite.js 6.0 | tle.js | tle.js wraps satellite.js but abstracts away the ECI coordinates CesiumJS needs; satellite.js gives direct access to position vectors |
| TLE propagation | satellite.js 6.0 | Orbital Object Toolkit | Newer library but less proven; satellite.js has wider adoption and CesiumJS-specific tutorials exist |

---

## Installation

### Frontend

```bash
# Core
npm install cesium resium react react-dom
npm install socket.io-client supercluster satellite.js zustand

# Dev
npm install -D typescript vite @vitejs/plugin-react vite-plugin-static-copy
npm install -D @types/react @types/react-dom @types/supercluster
```

Note: `satellite.js` ships its own TypeScript declarations -- no `@types/satellite.js` needed.

### Backend

```bash
# Core
npm install fastify socket.io redis node-cron

# Dev
npm install -D typescript tsx @types/node
```

Note: `@fastify/websocket` is NOT needed when using Socket.IO. They serve the same purpose.

### Docker Compose

```yaml
version: '3.8'
services:
  frontend:
    build:
      context: ./frontend
      args:
        - VITE_CESIUM_ION_TOKEN=${CESIUM_ION_TOKEN}
        - VITE_API_URL=http://192.168.1.65:3011
        - VITE_WS_URL=http://192.168.1.65:3011
    ports: ["3010:80"]
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["3011:3011"]
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      redis:
        condition: service_started
    restart: unless-stopped

  redis:
    image: redis:7.2-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --save ""
    restart: unless-stopped
    # No volumes -- cache only, no persistence needed
```

### nginx Configuration (frontend Dockerfile)

```nginx
server {
    listen 80;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:3011;
        proxy_set_header Host $host;
    }

    # Proxy WebSocket (Socket.IO) to backend
    location /socket.io/ {
        proxy_pass http://backend:3011;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Version Confidence Summary

| Package | Version | Confidence | Source |
|---------|---------|------------|--------|
| cesium | 1.139.1 | HIGH | npm registry (March 2026 WebSearch) |
| resium | 1.19.4 | HIGH | npm registry (March 2026 WebSearch) |
| satellite.js | 6.0.2 | HIGH | npm registry (Jan 2026 release confirmed via WebSearch) |
| socket.io | 4.8.3 | HIGH | npm registry (Dec 2025 release confirmed) |
| socket.io-client | 4.8.3 | HIGH | Must match server version |
| supercluster | 8.0.1 | HIGH | npm registry; stable since 2023 by design |
| redis (node-redis) | 5.11.0 | HIGH | npm registry (March 2026 WebSearch) |
| node.js | 22 LTS | HIGH | LTS schedule publicly documented |
| vite | 6.3.2 | HIGH | npm registry (March 2026 WebSearch) |
| Redis Docker | 7.2-alpine | HIGH | Docker Hub official image |
| fastify | 5.8.x | HIGH | npm registry confirmed v5.8.1 released March 5, 2026 |
| fastify-socket.io | 5.1.0 | HIGH (NOT COMPATIBLE) | Confirmed NOT compatible with Fastify 5; use manual attach |

---

## Critical Gotchas

### 1. CesiumJS Static Assets Must Be Copied at Build Time
CesiumJS loads Web Workers, SVG icons, GLSL shaders, and third-party libraries from a static directory at runtime. If `CESIUM_BASE_URL` is not set correctly or the directories are not copied to your build output, the globe will either crash or silently fail to render. Use `viteStaticCopy` -- not `vite-plugin-cesium`.

### 2. Do Not Bundle CesiumJS
CesiumJS must be excluded from Vite's `optimizeDeps` and should not go through Rollup bundling. CesiumJS's internal dynamic `require()` calls break standard bundlers. The entire `node_modules/cesium/Build/Cesium/` directory is pre-built and must be served as static files.

### 3. Resium and React Strict Mode
Resium's entity components are imperative under the hood. React Strict Mode (double-invocation in dev) can cause duplicate entity registration. Wrap `<Viewer>` outside `<StrictMode>` or use Resium's own lifecycle handling carefully.

### 4. Cesium Ion Token Is NOT Optional
Without a valid Ion token, `Cesium.Ion.defaultAccessToken` is the default demo token that expires. Provide your own free Community token from https://cesium.com/ion/ before first render.

### 5. supercluster Is Not React-Aware and Does NOT Work with EntityCluster
`use-supercluster` is designed for react-map-gl (Mapbox). For CesiumJS, use the raw `supercluster` package and manage clustering in a `useMemo` hook, re-clustering when the camera moves. Render results via `PointPrimitiveCollection`, NOT Entity API.

### 6. Socket.IO Version Must Match Client and Server
Socket.IO 4.8.3 client must be paired with Socket.IO 4.8.3 server. Mixed versions cause silent handshake failures. Pin both in package.json.

### 7. fastify-socket.io Does NOT Support Fastify 5
As of March 2026, the `fastify-socket.io` npm package (v5.1.0) has a peer dependency on `fastify "4.x.x"`. Installing with Fastify 5.8 causes a peer dep conflict. Use the manual attach pattern: `const io = new Server(fastify.server)`.

### 8. satellite.js Units Are Kilometers, CesiumJS Uses Meters
`satellite.js` returns position height in km. CesiumJS `Cartesian3.fromRadians` expects meters. Multiply height by 1000. Forgetting this puts satellites at 1/1000th their actual altitude.

### 9. satellite.js propagate() Returns false on Failure
When propagation fails (stale TLE, invalid data), `propagate()` returns `{ position: false, velocity: false }` -- not null. Guard with `typeof result.position === 'boolean'` or `result.position === false`.

### 10. GLSL Shaders: Do NOT Include Version Directive
CesiumJS prepends `#version 300 es` automatically when WebGL2 is active. If you include it in your shader string, you get a compilation error (duplicate version directive). Write shaders in GLSL 300 ES syntax but omit the `#version` line.

### 11. WebGL2 Required for PostProcessStage
CesiumJS defaults to WebGL2 since v1.102. Custom PostProcessStage shaders must use GLSL 300 ES syntax (`in`/`out`, `texture()`, `out_FragColor`). CesiumJS auto-downgrades via `demodernizeShader` for WebGL1, but do not test against WebGL1 -- all modern browsers support WebGL2.

### 12. Node-redis v5 API Is Fully Promise-Based
The `redis` v5 client requires `await client.connect()` before use, uses `client.setEx(key, seconds, value)` (not the old `client.set(key, value, 'EX', seconds)`), and returns `null` (not an error) for missing keys.

### 13. PointPrimitiveCollection Requires Manual Camera Listener
Unlike Entity API with EntityCluster, `PointPrimitiveCollection` does not automatically update on camera move. You must listen to `viewer.camera.changed` or `viewer.camera.moveEnd` and call your Supercluster re-clustering function manually.

### 14. nginx WebSocket Proxy Headers
The nginx config MUST include `proxy_http_version 1.1`, `Upgrade`, and `Connection "upgrade"` headers for Socket.IO to work through the reverse proxy. Missing these causes Socket.IO to fall back to HTTP long-polling (dramatically worse performance).

---

## Sources

- [CesiumJS npm package](https://www.npmjs.com/package/cesium) -- version 1.139.1 confirmed March 2026
- [Cesium March 2026 Release Blog](https://cesium.com/blog/2026/03/03/cesium-releases-in-march-2026/)
- [Resium GitHub](https://github.com/reearth/resium) -- version 1.19.4, peer deps
- [Resium Installation Docs](https://resium.reearth.io/installation)
- [CesiumGS/cesium-vite-example](https://github.com/CesiumGS/cesium-vite-example) -- official Vite setup
- [Configuring Vite for CesiumJS](https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/) -- Cesium blog
- [nshen/vite-plugin-cesium GitHub](https://github.com/nshen/vite-plugin-cesium) -- confirmed abandoned
- [satellite.js npm](https://www.npmjs.com/package/satellite.js) -- version 6.0.2, Jan 2026
- [satellite.js GitHub](https://github.com/shashwatak/satellite-js) -- SGP4/SDP4 propagation, TLE + OMM support
- [Socket.IO npm](https://www.npmjs.com/package/socket.io) -- version 4.8.3, Dec 2025
- [Socket.IO Server Initialization docs](https://socket.io/docs/v4/server-initialization/) -- manual attach pattern
- [supercluster npm](https://www.npmjs.com/package/supercluster) -- version 8.0.1
- [supercluster GitHub](https://github.com/mapbox/supercluster) -- 6M points demonstrated
- [Mapbox blog: Clustering millions of points](https://blog.mapbox.com/clustering-millions-of-points-on-a-map-with-supercluster-272046ec5c97)
- [redis (node-redis) npm](https://www.npmjs.com/package/redis) -- version 5.11.0
- [Redis official Node.js guide](https://redis.io/docs/latest/develop/clients/nodejs/)
- [Redis rate limiting guide](https://redis.io/learn/howtos/ratelimiting)
- [Fastify releases](https://github.com/fastify/fastify/releases) -- v5.8.1 confirmed March 2026
- [Fastify v5 official release](https://openjsf.org/blog/fastifys-growth-and-success)
- [fastify-socket.io issue #180](https://github.com/ducktors/fastify-socket.io/issues/180) -- Fastify 5 incompatibility
- [Fastify Server docs](https://fastify.dev/docs/latest/Reference/Server/) -- `fastify.server` property
- [Cesium Ion Pricing](https://cesium.com/platform/cesium-ion/pricing/) -- free tier: 5GB storage, 15GB/month
- [CesiumJS PostProcessStageLibrary docs](https://cesium.com/learn/cesiumjs/ref-doc/PostProcessStageLibrary.html) -- built-in night vision, edge detection, AO, etc.
- [CesiumJS PostProcessStage docs](https://cesium.com/learn/cesiumjs/ref-doc/PostProcessStage.html) -- custom fragment shader pattern
- [CesiumJS WebGL2 default PR #10894](https://github.com/CesiumGS/cesium/pull/10894) -- GLSL 300 ES, demodernizeShader
- [CesiumJS EntityCluster docs](https://cesium.com/learn/cesiumjs/ref-doc/EntityCluster.html) -- built-in clustering (limited scale)
- [CesiumJS Performance Tips for Points](https://cesium.com/blog/2016/03/02/performance-tips-for-points/) -- PointPrimitiveCollection vs Billboard
- [CesiumJS Entity API Performance](https://cesium.com/blog/2018/06/21/entity-api-performance/) -- Entity overhead
- [Resium React 19 peer dep issue #675](https://github.com/reearth/resium/issues/675)
- [Cesium clustering blog (Webiks)](https://blog.webiks.com/cesium-clustering/) -- EntityCluster limitations
- [Satellite tracker tutorial](https://dev.to/omar4ur/create-a-satellite-tracker-from-scratch-in-30-lines-of-javascript-32gk) -- satellite.js + CesiumJS pattern
