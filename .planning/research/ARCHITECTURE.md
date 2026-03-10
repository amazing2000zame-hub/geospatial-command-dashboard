# Architecture Patterns

**Domain:** Real-time 3D geospatial command dashboard (CesiumJS, 17+ live data feeds)
**Researched:** 2026-03-10
**Overall confidence:** HIGH (validated against WorldView reference implementation, CesiumJS docs, Socket.IO docs, Redis patterns)

---

## Recommended Architecture

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

Three Docker containers. One bridge network. No external databases for v1.

### Data Flow: Poll -> Normalize -> Cache -> Push

```
1. Scheduler triggers fetcher (per-source cron interval)
2. Fetcher calls external API
3. Fetcher normalizes response -> unified GeoJSON FeatureCollection
4. Normalized data written to Redis with source-specific TTL
5. Socket.IO emits to layer-specific room (e.g., "layer:flights")
6. Connected browsers in that room receive FeatureCollection
7. Frontend updates CesiumJS primitives imperatively (no React re-render of entities)
```

This is a unidirectional pipeline. Data flows one way: API -> backend -> Redis -> WebSocket -> browser -> globe.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| nginx | Static file serving, reverse proxy, WebSocket upgrade, gzip, Cesium asset caching | Frontend files, backend |
| Frontend (React/Resium) | Globe rendering, layer management, UI controls, GLSL shaders, clustering | Backend (HTTP + WebSocket) |
| Backend (Fastify) | API polling, data normalization, caching, WebSocket broadcast, health status | Redis, external APIs, frontend |
| Redis | TTL-based cache for normalized GeoJSON, layer metadata, error states | Backend only (not exposed to host) |
| External APIs (17) | Data sources (OpenSky, USGS, NWS, etc.) | Backend only (outbound HTTP) |

---

## Directory / File Structure

```
geospatial-dashboard/
|
+-- docker-compose.yml           # Three services: frontend, backend, redis
+-- .env                         # API keys, Cesium Ion token (never committed)
+-- .env.example                 # Template with placeholder values (committed)
|
+-- frontend/
|   +-- Dockerfile               # Multi-stage: node build -> nginx serve
|   +-- nginx.conf               # Reverse proxy + WebSocket upgrade config
|   +-- index.html
|   +-- vite.config.ts           # Cesium static copy via viteStaticCopy, proxy in dev
|   +-- tsconfig.json
|   +-- package.json
|   |
|   +-- public/
|   |   +-- icons/               # Layer icons (aircraft.svg, earthquake.svg, etc.)
|   |
|   +-- src/
|       +-- main.tsx              # ReactDOM entry, Cesium Ion token init
|       +-- App.tsx               # Root component, global state orchestration
|       |
|       +-- components/
|       |   +-- globe/
|       |   |   +-- GlobeViewer.tsx          # Cesium Viewer init, scene config, lighting
|       |   |   +-- EntityClickHandler.tsx   # ScreenSpaceEventHandler -> popup, ESC unlock
|       |   |   +-- CameraController.tsx     # Fly-to, tracked entity, home view
|       |   |
|       |   +-- layers/
|       |   |   +-- LayerRenderer.tsx        # Registry: maps layerId -> render component
|       |   |   +-- FlightLayer.tsx          # OpenSky aircraft (BillboardCollection)
|       |   |   +-- MilitaryLayer.tsx        # ADS-B Exchange military (BillboardCollection)
|       |   |   +-- EarthquakeLayer.tsx      # USGS earthquakes (PointPrimitiveCollection)
|       |   |   +-- SatelliteLayer.tsx       # CelesTrak + satellite.js propagation
|       |   |   +-- WeatherAlertLayer.tsx    # NWS polygons (GeoJsonDataSource)
|       |   |   +-- WildfireLayer.tsx        # NASA FIRMS hotspots
|       |   |   +-- SpeedCameraLayer.tsx     # OSM Overpass cameras (clustered)
|       |   |   +-- ALPRLayer.tsx            # DeFlock 336K cameras (Supercluster + PointPrimitiveCollection)
|       |   |   +-- CrimeLayer.tsx           # Socrata/city open data (clustered)
|       |   |   +-- FireEMSLayer.tsx         # PulsePoint dispatches
|       |   |   +-- AirQualityLayer.tsx      # OpenAQ/EPA AQI markers
|       |   |   +-- TrafficLayer.tsx         # State DOT 511 incidents
|       |   |   +-- ScannerLayer.tsx         # OpenMHz audio (UI-only, no globe markers)
|       |   |
|       |   +-- ui/
|       |       +-- ControlPanel.tsx         # Sidebar: layer toggles, mode switch, search
|       |       +-- LayerToggle.tsx          # Individual toggle with status badge + count
|       |       +-- StatusBar.tsx            # Bottom bar: coords, entity counts, clock
|       |       +-- DetailPopup.tsx          # Entity click detail card (positioned to screen coords)
|       |       +-- TimeFilter.tsx           # Hour / 24h / 7d radio buttons
|       |       +-- SearchBar.tsx            # Geocoder input (fly-to)
|       |       +-- IntelFeed.tsx            # Real-time event stream panel
|       |       +-- AudioPlayer.tsx          # Police scanner audio embed
|       |
|       +-- shaders/
|       |   +-- nightvision.glsl            # NVG post-process fragment shader
|       |   +-- thermal.glsl                # FLIR thermal fragment shader
|       |   +-- crt.glsl                    # CRT scanlines + barrel distortion
|       |   +-- postprocess.ts              # Shader loader + PostProcessStage factory
|       |
|       +-- hooks/
|       |   +-- useWebSocket.ts             # Socket.IO connection + room subscriptions
|       |   +-- useLayerData.ts             # Per-layer data state (HTTP initial + WS updates)
|       |   +-- useCluster.ts               # Supercluster index management per layer
|       |   +-- useViewport.ts              # Camera position, zoom level, bounding box
|       |   +-- useVisualMode.ts            # Shader mode state + PostProcessStage lifecycle
|       |
|       +-- store/
|       |   +-- layerStore.ts               # zustand: layer visibility, status, counts
|       |   +-- uiStore.ts                  # zustand: panel state, visual mode, time filter
|       |
|       +-- types/
|       |   +-- geojson.ts                  # Unified GeoJSON types + layer-specific properties
|       |   +-- layers.ts                   # LayerId enum, LayerConfig, LayerStatus
|       |   +-- websocket.ts                # Socket.IO event type definitions
|       |
|       +-- utils/
|           +-- cesiumHelpers.ts            # Cartesian3 converters, color scales
|           +-- clustering.ts               # Supercluster wrapper for CesiumJS viewport
|           +-- deadReckoning.ts            # Position interpolation between API polls
|           +-- formatters.ts               # Date, distance, altitude display formatters
|
+-- backend/
|   +-- Dockerfile                # Node 22 alpine
|   +-- tsconfig.json
|   +-- package.json
|   |
|   +-- src/
|       +-- index.ts              # Fastify init, plugin registration, startup sequence
|       +-- server.ts             # HTTP server creation, Socket.IO attachment
|       |
|       +-- config/
|       |   +-- sources.ts        # All 17 sources: ID, URL, interval, TTL, enabled flag
|       |   +-- redis.ts          # Redis connection config
|       |   +-- env.ts            # Typed environment variable loading
|       |
|       +-- fetchers/             # One file per data source (fetch + normalize combined)
|       |   +-- BaseFetcher.ts    # Abstract class: fetch, normalize, cache, emit lifecycle
|       |   +-- opensky.ts        # OpenSky Network flights
|       |   +-- adsb-exchange.ts  # ADS-B Exchange military aircraft
|       |   +-- usgs.ts           # USGS earthquake GeoJSON
|       |   +-- celestrak.ts      # CelesTrak TLE satellite data
|       |   +-- nws.ts            # National Weather Service alerts
|       |   +-- nasa-firms.ts     # NASA FIRMS wildfire hotspots
|       |   +-- overpass.ts       # OSM Overpass speed cameras
|       |   +-- deflock.ts        # DeFlock ALPR camera dataset
|       |   +-- socrata.ts        # Socrata/SODA crime data
|       |   +-- pulsepoint.ts     # PulsePoint fire/EMS dispatch
|       |   +-- openmhz.ts        # OpenMHz scanner feeds
|       |   +-- openaq.ts         # OpenAQ air quality
|       |   +-- dot511.ts         # State DOT traffic incidents
|       |
|       +-- services/
|       |   +-- scheduler.ts      # Registers cron jobs per source from config
|       |   +-- cache.ts          # Redis get/set with TTL, key naming, status tracking
|       |   +-- websocket.ts      # Socket.IO namespace/room management, broadcast
|       |
|       +-- types/
|       |   +-- geojson.ts        # Shared GeoJSON types (identical to frontend)
|       |   +-- source.ts         # SourceConfig, FetchResult, FetcherStatus types
|       |
|       +-- routes/
|           +-- layers.ts         # GET /api/layers/:layerId - initial data load from cache
|           +-- health.ts         # GET /api/health - service status
|           +-- status.ts         # GET /api/status - all layer statuses + counts
```

### Why This Structure

- **One fetcher per source** -- a crash in the PulsePoint fetcher cannot affect the USGS fetcher. Each file is its own try/catch boundary with independent error state.
- **Fetcher + normalizer combined** -- unlike separating these into parallel directories, combining them means one file fully owns "how to talk to OpenSky and what comes back." The normalization logic is tightly coupled to the API response shape; separating them adds indirection without benefit.
- **Layers map 1:1 to fetchers** -- `FlightLayer.tsx` consumes data from `opensky.ts`. No ambiguity about data lineage.
- **Shared `geojson.ts` types** -- identical interface used by both frontend and backend. TypeScript catches schema drift at compile time.
- **Shaders are raw `.glsl` files** -- imported as strings via Vite's `?raw` suffix, passed to CesiumJS `PostProcessStage`. Keeps GLSL separate from TypeScript for syntax highlighting and shader tooling.

---

## Frontend Architecture

### Globe Component Hierarchy

```
<App>                                    -- Global state orchestration
  <GlobeViewer>                          -- CesiumJS Viewer wrapper (Resium)
    <EntityClickHandler />               -- ScreenSpaceEventHandler for picks
    <CameraController />                 -- Fly-to, entity tracking, home view
    <LayerRenderer                       -- Iterates active layers from store
      layers={activeLayers}
      data={layerDataMap}
    >
      <ErrorBoundary><FlightLayer /></ErrorBoundary>
      <ErrorBoundary><EarthquakeLayer /></ErrorBoundary>
      <ErrorBoundary><SatelliteLayer /></ErrorBoundary>
      ... one ErrorBoundary per layer component
    </LayerRenderer>
  </GlobeViewer>
  <ControlPanel />                       -- Sidebar UI (React DOM, overlays globe)
  <StatusBar />                          -- Bottom bar (React DOM)
  <DetailPopup />                        -- Anchored to clicked entity screen pos
  <IntelFeed />                          -- Event stream sidebar
</App>
```

### Critical Pattern: Imperative Rendering via Primitive Collections

This is the single most important frontend architectural decision.

**Problem:** Resium's declarative `<Entity>` components create one React component per data point. With 6,700 aircraft, this means 6,700 React components, each with virtual DOM diffing, lifecycle management, and garbage collection. React cannot reconcile this at 60fps.

**Solution:** Use CesiumJS **Primitive collections** managed imperatively via `useRef` and `useEffect`. Each layer component returns `null` (no React DOM output) and manages CesiumJS primitives directly.

```typescript
// Pattern: FlightLayer.tsx (simplified)
export function FlightLayer({ data, viewer }: FlightLayerProps) {
  const billboardsRef = useRef<Cesium.BillboardCollection | null>(null);

  // Create collection once on mount
  useEffect(() => {
    if (!viewer) return;
    const billboards = viewer.scene.primitives.add(
      new Cesium.BillboardCollection()
    );
    billboardsRef.current = billboards;
    return () => {
      viewer.scene.primitives.remove(billboards);
    };
  }, [viewer]);

  // Update billboards when data changes (no React re-render)
  useEffect(() => {
    const billboards = billboardsRef.current;
    if (!billboards || !data) return;
    billboards.removeAll();
    for (const feature of data.features) {
      const [lon, lat] = feature.geometry.coordinates;
      billboards.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        image: '/icons/aircraft.svg',
        rotation: -Cesium.Math.toRadians(feature.properties.heading ?? 0),
        scale: 0.5,
        id: feature.properties.id,  // for click handler entity lookup
      });
    }
  }, [data]);

  return null; // No React DOM output -- purely imperative CesiumJS
}
```

**When to use Resium declarative components:**
- The Viewer itself (`<Viewer>`)
- Low-count, rarely-changing entities (< 50): weather alert polygons via `<GeoJsonDataSource>`
- Search result fly-to markers

**When to use imperative Primitive collections:**
- Any layer with > 100 entities
- Any layer with frequent updates (flights every 10s, dispatch every 30s)
- Any layer using Supercluster clustering

This pattern is validated by WorldView (27K aircraft via BillboardCollection) and worldwideview (100K+ entities via primitives). Confidence: HIGH.

### Rendering API Selection Per Layer

| Layer | Approx Count | Update Freq | CesiumJS API | Rationale |
|-------|-------------|-------------|--------------|-----------|
| Flights | 6,700 | 10s | BillboardCollection | High count + frequent updates; imperative removes 6700 React components |
| Military Aircraft | ~200 | 15s | BillboardCollection | Same pattern as flights; distinct icon |
| Earthquakes | ~500 | 60s | PointPrimitiveCollection | Magnitude-scaled colored circles |
| Satellites | ~2,000 | Propagated client-side | BillboardCollection + PolylineCollection | Positions computed via satellite.js at 60fps |
| Weather Alerts | ~50 polygons | 2min | GeoJsonDataSource (Resium) | Low count; polygons not points; GeoJsonDataSource handles polygon rendering natively |
| Wildfires | ~1,000 | 3h | PointPrimitiveCollection | Color by brightness temperature |
| Speed Cameras | ~10K | Daily | BillboardCollection + Supercluster | Clustered; moderate count |
| ALPR Cameras | 336K | Daily | PointPrimitiveCollection + Supercluster | Largest dataset; must cluster aggressively |
| Crime | 1K-50K | 5min | PointPrimitiveCollection + Supercluster | Variable; cluster when dense |
| Fire/EMS | ~100 | 30s | BillboardCollection | Low count; incident type icons |
| Air Quality | ~2K | 1h | PointPrimitiveCollection | Colored AQI circles |
| Traffic | ~200 | 2min | BillboardCollection | Low count; incident type icons |
| Scanner | 0 (UI only) | N/A | None | Audio player in UI panel; no globe entities |

### State Management (zustand)

Two stores, kept minimal and specific:

```typescript
// store/layerStore.ts
interface LayerState {
  layers: Record<LayerId, {
    visible: boolean;
    status: 'idle' | 'loading' | 'active' | 'error';
    count: number;
    lastUpdated: number | null;
    error: string | null;
  }>;
  toggleLayer: (id: LayerId) => void;
  setLayerStatus: (id: LayerId, update: Partial<LayerStatus>) => void;
}

// store/uiStore.ts
interface UIState {
  visualMode: 'standard' | 'nvg' | 'thermal' | 'crt';
  timeFilter: '1h' | '24h' | '7d';
  sidebarOpen: boolean;
  selectedEntity: { layerId: string; featureId: string; screenPosition: Cartesian2 } | null;
  setVisualMode: (mode: VisualMode) => void;
  setTimeFilter: (filter: TimeFilter) => void;
  selectEntity: (entity: SelectedEntity | null) => void;
}
```

**Why zustand over React context:** Layer toggle state changes should NOT trigger re-renders of the globe or other layers. Zustand subscriptions are granular -- `FlightLayer` subscribes only to `layers.flights.visible`, not the entire store. React context would re-render every consumer on any state change, causing unnecessary CesiumJS primitive rebuilds.

### WebSocket Client: Room-Based Subscriptions

```typescript
// hooks/useWebSocket.ts
import { io, Socket } from 'socket.io-client';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { layers } = useLayerStore();

  useEffect(() => {
    const socket = io('/layers', {
      transports: ['websocket'],  // Skip HTTP long-polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Re-subscribe to all currently visible layers on reconnect
      Object.entries(layers).forEach(([id, layer]) => {
        if (layer.visible) socket.emit('subscribe', id);
      });
    });

    socket.on('data', (payload) => {
      // Route data to the appropriate layer's state
      updateLayerData(payload.layerId, payload.data);
    });

    socket.on('status', (payload) => {
      useLayerStore.getState().setLayerStatus(payload.layerId, {
        status: payload.status,
        count: payload.count,
        error: payload.error ?? null,
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  // Dynamic subscribe/unsubscribe when layer visibility changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    Object.entries(layers).forEach(([id, layer]) => {
      if (layer.visible) {
        socket.emit('subscribe', id);
      } else {
        socket.emit('unsubscribe', id);
      }
    });
  }, [layers]);
}
```

The client subscribes to layer-specific rooms. The backend only pushes data for layers the client is watching. A client with only earthquakes enabled does not receive 6,700 flight updates every 10 seconds.

### GLSL Post-Processing Pipeline

CesiumJS PostProcessStage accepts a GLSL fragment shader string. Visual modes are implemented as swappable post-process stages:

```typescript
// shaders/postprocess.ts
import nightvisionGlsl from './nightvision.glsl?raw';
import thermalGlsl from './thermal.glsl?raw';
import crtGlsl from './crt.glsl?raw';

const SHADER_MAP: Record<string, string> = {
  nvg: nightvisionGlsl,
  thermal: thermalGlsl,
  crt: crtGlsl,
};

export function applyVisualMode(
  scene: Cesium.Scene,
  mode: string,
  currentStage: Cesium.PostProcessStage | null
): Cesium.PostProcessStage | null {
  // Remove previous stage
  if (currentStage) {
    scene.postProcessStages.remove(currentStage);
  }

  if (mode === 'standard') return null;

  const fragmentShader = SHADER_MAP[mode];
  if (!fragmentShader) return null;

  const stage = new Cesium.PostProcessStage({
    fragmentShader,
    uniforms: {
      u_time: () => performance.now() / 1000.0,
      u_resolution: () => new Cesium.Cartesian2(
        scene.drawingBufferWidth,
        scene.drawingBufferHeight
      ),
    },
  });

  scene.postProcessStages.add(stage);
  return stage;
}
```

**Shader requirements for CesiumJS PostProcessStage:**
- Must declare `in vec2 v_textureCoordinates;` (CesiumJS provides this varying)
- Must sample from `uniform sampler2D colorTexture;` (the rendered scene texture)
- Must output to `out vec4 fragColor;`
- Shaders must target `#version 300 es` (WebGL2, CesiumJS default since v1.102)
- Only one visual mode active at a time (swap the PostProcessStage, don't stack them)

CesiumJS also has a built-in `PostProcessStageLibrary.createNightVisionStage()`. Consider using it for NVG and only writing custom GLSL for thermal and CRT. Confidence: HIGH.

---

## Backend Architecture

### Isolated Fetcher Pattern

Every data source is an independent unit. This is the core error isolation strategy.

```typescript
// fetchers/BaseFetcher.ts
export abstract class BaseFetcher {
  abstract readonly sourceId: string;
  abstract readonly displayName: string;
  abstract readonly defaultInterval: string;  // cron expression (node-cron format)
  abstract readonly cacheTTL: number;          // seconds

  constructor(
    protected cache: CacheService,
    protected io: SocketIONamespace
  ) {}

  // Subclass implements: call API, return raw response
  abstract fetchRaw(): Promise<unknown>;

  // Subclass implements: raw response -> normalized GeoJSON
  abstract normalize(raw: unknown): LayerFeatureCollection;

  // Template method: orchestrates the full lifecycle
  async execute(): Promise<void> {
    try {
      // Check if cache is still fresh (skip redundant fetches)
      const cached = await this.cache.get(this.sourceId);
      if (cached) return;

      const raw = await this.fetchRaw();
      const normalized = this.normalize(raw);

      await this.cache.set(this.sourceId, normalized, this.cacheTTL);

      // Broadcast to all clients subscribed to this layer's room
      this.io.to(`layer:${this.sourceId}`).emit('data', {
        layerId: this.sourceId,
        data: normalized,
        timestamp: Date.now(),
      });

      // Broadcast status update
      this.io.emit('status', {
        layerId: this.sourceId,
        status: 'active',
        count: normalized.features.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.cache.setError(this.sourceId, message);

      this.io.emit('status', {
        layerId: this.sourceId,
        status: 'error',
        count: 0,
        error: message,
      });

      // Log but do NOT rethrow -- other fetchers must continue
      console.error(`[${this.sourceId}] Fetch failed: ${message}`);
    }
  }
}
```

**Example concrete fetcher:**

```typescript
// fetchers/usgs.ts
export class USGSFetcher extends BaseFetcher {
  readonly sourceId = 'earthquakes';
  readonly displayName = 'USGS Earthquakes';
  readonly defaultInterval = '*/60 * * * * *';  // every 60 seconds
  readonly cacheTTL = 55;                         // expire before next poll

  async fetchRaw(): Promise<unknown> {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
    );
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    return res.json();
  }

  normalize(raw: USGSResponse): LayerFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: raw.features.map(f => ({
        type: 'Feature',
        geometry: f.geometry,  // USGS is already GeoJSON!
        properties: {
          id: f.id,
          layer: 'earthquakes',
          label: `M${f.properties.mag}`,
          timestamp: Math.floor(f.properties.time / 1000),
          category: f.properties.type,
          severity: Math.min(f.properties.mag / 10, 1),  // normalize 0-1
          mag: f.properties.mag,
          depth: f.geometry.coordinates[2],
          place: f.properties.place,
          url: f.properties.url,
        },
      })),
      metadata: {
        source: 'usgs',
        fetchedAt: Date.now(),
        count: raw.features.length,
        nextUpdate: Date.now() + 60000,
      },
    };
  }
}
```

**Why one file per source with combined fetch + normalize:**
- A crash in the PulsePoint fetcher cannot affect the USGS fetcher
- Each fetcher can be unit tested independently with mock API responses
- Normalization logic is tightly coupled to the API response shape (they change together)
- Adding a new data source = adding one file + one config entry in `sources.ts`
- Removing a source = deleting one file

### Scheduler Design

Use `node-cron` for scheduling because it supports second-level precision (needed for 10-second flight updates) and has minimal dependencies.

```typescript
// services/scheduler.ts
import cron from 'node-cron';
import { sourceConfigs } from '../config/sources';

export function startScheduler(
  fetchers: Map<string, BaseFetcher>
): void {
  for (const config of sourceConfigs) {
    if (!config.enabled) continue;

    const fetcher = fetchers.get(config.sourceId);
    if (!fetcher) {
      console.warn(`[scheduler] No fetcher for ${config.sourceId}, skipping`);
      continue;
    }

    // Schedule recurring poll
    cron.schedule(config.interval, () => {
      fetcher.execute();  // Fire and forget -- errors handled internally
    });

    // Immediate first fetch on startup (staggered to avoid thundering herd)
    const staggerMs = sourceConfigs.indexOf(config) * 500;
    setTimeout(() => fetcher.execute(), staggerMs);

    console.log(`[scheduler] ${config.sourceId}: ${config.interval} (TTL: ${config.cacheTTL}s)`);
  }
}
```

**Staggered startup:** Each source gets a 500ms delay offset on first fetch. This prevents all 17 sources hitting their APIs simultaneously on backend startup, which could cause rate limit issues and Redis write contention.

### Source Configuration

```typescript
// config/sources.ts
export interface SourceConfig {
  sourceId: string;
  interval: string;     // node-cron expression
  cacheTTL: number;     // seconds
  enabled: boolean;
}

export const sourceConfigs: SourceConfig[] = [
  { sourceId: 'flights',     interval: '*/10 * * * * *', cacheTTL: 8,     enabled: true },
  { sourceId: 'military',    interval: '*/15 * * * * *', cacheTTL: 12,    enabled: true },
  { sourceId: 'earthquakes', interval: '*/60 * * * * *', cacheTTL: 55,    enabled: true },
  { sourceId: 'satellites',  interval: '0 */6 * * *',    cacheTTL: 21600, enabled: true },
  { sourceId: 'weather',     interval: '*/120 * * * * *',cacheTTL: 110,   enabled: true },
  { sourceId: 'wildfire',    interval: '0 */3 * * *',    cacheTTL: 10800, enabled: true },
  { sourceId: 'speedcams',   interval: '0 4 * * *',      cacheTTL: 86400, enabled: true },
  { sourceId: 'alpr',        interval: '0 4 * * *',      cacheTTL: 86400, enabled: true },
  { sourceId: 'crime',       interval: '*/300 * * * * *',cacheTTL: 280,   enabled: true },
  { sourceId: 'fire-ems',    interval: '*/30 * * * * *', cacheTTL: 25,    enabled: true },
  { sourceId: 'scanner',     interval: '0 */30 * * *',   cacheTTL: 1800,  enabled: true },
  { sourceId: 'airquality',  interval: '0 */1 * * *',    cacheTTL: 3500,  enabled: true },
  { sourceId: 'traffic',     interval: '*/120 * * * * *',cacheTTL: 110,   enabled: true },
];
```

**Pattern: cacheTTL is always slightly less than interval.** This ensures the cache expires just before the next poll, so the fetcher always re-fetches on schedule. If the API is down, the expired cache returns null, the frontend gets a status error event, and the layer shows an error badge.

### Fastify + Socket.IO Integration

```typescript
// server.ts
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';

export async function createServer() {
  const fastify = Fastify({ logger: true });

  // Redis client (node-redis v5, promise-based)
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  await redis.connect();

  // Socket.IO attached to same HTTP server
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: '*' },
    transports: ['websocket'],
    path: '/socket.io',
  });

  // Layer namespace for data subscriptions
  const layerNs = io.of('/layers');

  layerNs.on('connection', (socket) => {
    console.log(`[ws] Client connected: ${socket.id}`);

    socket.on('subscribe', async (layerId: string) => {
      socket.join(`layer:${layerId}`);
      // Send current cached data immediately
      const cached = await cache.get(layerId);
      if (cached) {
        socket.emit('data', { layerId, data: cached, timestamp: Date.now() });
      }
    });

    socket.on('unsubscribe', (layerId: string) => {
      socket.leave(`layer:${layerId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[ws] Client disconnected: ${socket.id}`);
    });
  });

  // Register REST routes
  await fastify.register(layerRoutes, { prefix: '/api' });
  await fastify.register(healthRoutes, { prefix: '/api' });

  return { fastify, io, redis, layerNs };
}
```

**Why Socket.IO over raw `ws`:**
- Auto-reconnect with exponential backoff (critical for homelab network stability)
- Heartbeat/ping-pong keeps connections alive through NAT timeout
- Room-based routing is built-in (no custom broadcast logic needed)
- Namespace separation cleanly isolates layer data from other potential channels
- `socket.io-client` handles connection lifecycle, buffering, and error recovery

**Why attach Socket.IO directly to `fastify.server` instead of using `fastify-socket.io` plugin:** The `fastify-socket.io` plugin is community-maintained (not official Fastify). Attaching Socket.IO directly to the underlying `http.Server` is the pattern documented by Socket.IO itself and avoids an additional dependency.

---

## Data Normalization: Unified GeoJSON Schema

All 17 data sources normalize to one TypeScript interface:

```typescript
// types/geojson.ts (shared between frontend and backend)

export interface LayerFeatureProperties {
  id: string;                    // Unique within layer (ICAO24, event ID, etc.)
  layer: string;                 // Source layer ID (e.g., 'flights', 'earthquakes')
  label: string | null;          // Display name (callsign, "M4.2", incident type)
  timestamp: number;             // Unix epoch seconds
  category: string | null;       // Sub-type for icon selection (crime type, incident type)
  severity: number | null;       // 0-1 normalized for universal color scaling
  [key: string]: unknown;        // Layer-specific extended properties
}

export interface LayerFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  properties: LayerFeatureProperties;
}

export interface LayerFeatureCollection {
  type: 'FeatureCollection';
  features: LayerFeature[];
  metadata?: {
    source: string;
    fetchedAt: number;        // Unix epoch ms
    count: number;
    nextUpdate: number;       // Unix epoch ms
  };
}
```

**Normalization rules (every fetcher must follow):**
1. Coordinates are always `[longitude, latitude]` (GeoJSON RFC 7946 standard, NOT `[lat, lon]`)
2. Timestamps are always Unix epoch seconds (not milliseconds, not ISO strings)
3. Missing fields are `null`, not `undefined` (JSON serialization drops undefined)
4. The `id` field must be stable across updates (ICAO24 for flights, event ID for earthquakes) to enable client-side entity diffing
5. `severity` is normalized 0-1 regardless of source (magnitude/10 for earthquakes, AQI/500 for air quality) to enable a universal color scale function

**Why a unified schema matters:** The frontend has one `DetailPopup` component, one color scale function, one time filter, and one clustering pipeline. Without a shared schema, every layer would need custom rendering, custom filtering, and custom popup logic -- 17 implementations instead of 1.

---

## Redis Caching Strategy

### Key Naming Convention

```
geo:layer:{sourceId}              # Current FeatureCollection (JSON string)
geo:layer:{sourceId}:meta         # Metadata: fetchedAt, count, status
geo:layer:{sourceId}:error        # Last error message (short TTL: 60s)
```

Examples:
```
geo:layer:flights                 # TTL: 8s
geo:layer:earthquakes             # TTL: 55s
geo:layer:alpr                    # TTL: 86400s (24h)
geo:layer:flights:meta            # TTL: same as parent
geo:layer:weather:error           # TTL: 60s (clears if next fetch succeeds)
```

**Prefix `geo:` prevents collision** with any other Redis usage on the same instance (the management VM runs other services). Colon separators are Redis convention for hierarchical key namespacing.

### TTL Strategy

| Source | Poll Interval | Cache TTL | Rationale |
|--------|--------------|-----------|-----------|
| OpenSky flights | 10s | 8s | TTL < interval ensures cache expires before next poll |
| ADS-B Exchange | 15s | 12s | Same pattern |
| USGS earthquakes | 60s | 55s | USGS updates every 60s |
| CelesTrak satellites | 6h | 6h | TLE data updates 2-3x daily |
| NWS weather alerts | 2min | 110s | NWS feed updates every 2min |
| NASA FIRMS wildfire | 3h | 3h | Satellite pass frequency |
| OSM speed cameras | daily | 24h | Static data, slow to change |
| DeFlock ALPR | daily | 24h | Static dataset |
| Crime (Socrata) | 5min | 280s | City data updates vary |
| PulsePoint fire/EMS | 30s | 25s | Real-time dispatch |
| OpenMHz scanner | 30min | 30min | Feed list rarely changes |
| OpenAQ air quality | 1h | ~58min | Hourly sensor readings |
| State DOT traffic | 2min | 110s | Traffic incidents update frequently |

### Cache Service Implementation

```typescript
// services/cache.ts
import { createClient, type RedisClientType } from 'redis';

export class CacheService {
  private client: RedisClientType;

  async get(sourceId: string): Promise<LayerFeatureCollection | null> {
    const raw = await this.client.get(`geo:layer:${sourceId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async set(sourceId: string, data: LayerFeatureCollection, ttlSeconds: number): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.setEx(`geo:layer:${sourceId}`, ttlSeconds, JSON.stringify(data));
    pipeline.setEx(`geo:layer:${sourceId}:meta`, ttlSeconds, JSON.stringify({
      fetchedAt: Date.now(),
      count: data.features.length,
      status: 'active',
    }));
    // Clear any previous error on successful fetch
    pipeline.del(`geo:layer:${sourceId}:error`);
    await pipeline.exec();
  }

  async setError(sourceId: string, error: string): Promise<void> {
    await this.client.setEx(`geo:layer:${sourceId}:error`, 60, error);
  }

  async getAllStatuses(): Promise<Record<string, LayerMeta>> {
    // Used by GET /api/status endpoint
    const results: Record<string, LayerMeta> = {};
    for (const config of sourceConfigs) {
      const meta = await this.client.get(`geo:layer:${config.sourceId}:meta`);
      const error = await this.client.get(`geo:layer:${config.sourceId}:error`);
      results[config.sourceId] = {
        ...(meta ? JSON.parse(meta) : { status: 'idle', count: 0 }),
        error: error || null,
      };
    }
    return results;
  }
}
```

**Redis config (cache-only, no persistence):**
```
maxmemory 256mb
maxmemory-policy allkeys-lru
save ""
appendonly no
```

On cold start, all layers re-fetch from APIs. No persistence needed, no backup needed, no data loss concern.

---

## Clustering Pipeline (Supercluster)

### Why Supercluster Over CesiumJS Built-in EntityCluster

CesiumJS has a built-in `EntityCluster` that performs screen-space clustering, but it only works with the Entity API (not Primitive collections) and runs clustering per-frame. For 336K ALPR points:
- Entity API would take 30-60 seconds to load and render at 2fps
- EntityCluster's per-frame clustering on 336K points would destroy frame rate

**Supercluster** pre-indexes all points into a hierarchical spatial index at load time (~200ms for 336K points). Querying clusters for a given bounding box and zoom level is O(log n), not O(n). The query returns only the clusters/points visible in the current viewport, which are then rendered as a manageable number of billboards.

### Pipeline

```
1. Backend fetches ALPR dataset (336K points) -- once per day
2. Frontend receives full FeatureCollection via HTTP GET on layer subscribe
3. Frontend loads FeatureCollection into Supercluster index (one-time, ~200ms)
4. On every camera move/zoom (debounced 100ms after camera stops):
   a. Extract viewport bounding box from CesiumJS camera
   b. Query Supercluster for clusters within bounds at current zoom
   c. Render results as BillboardCollection (cluster markers with counts) or PointPrimitiveCollection (individual points)
5. On zoom-in past maxZoom threshold, individual points appear instead of clusters
```

### Viewport Extraction from CesiumJS Camera

```typescript
// hooks/useViewport.ts
export function useViewport(viewer: Cesium.Viewer | null) {
  const [viewport, setViewport] = useState<Viewport | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const updateViewport = () => {
      const rect = viewer.camera.computeViewRectangle();
      if (!rect) return;

      setViewport({
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
        zoom: heightToZoom(viewer.camera.positionCartographic.height),
      });
    };

    // Debounce: recalculate 100ms after camera stops moving
    let timeout: ReturnType<typeof setTimeout>;
    const listener = () => {
      clearTimeout(timeout);
      timeout = setTimeout(updateViewport, 100);
    };
    viewer.camera.changed.addEventListener(listener);
    updateViewport(); // Initial

    return () => {
      clearTimeout(timeout);
      viewer.camera.changed.removeEventListener(listener);
    };
  }, [viewer]);

  return viewport;
}

// Approximate Cesium camera height (meters) -> Mapbox-style zoom level
function heightToZoom(height: number): number {
  return Math.max(0, Math.min(20, Math.log2(40_000_000 / height)));
}
```

### Supercluster Integration

```typescript
// utils/clustering.ts
import Supercluster from 'supercluster';

export function createClusterIndex(
  data: LayerFeatureCollection,
  options?: Partial<Supercluster.Options<LayerFeatureProperties>>
): Supercluster<LayerFeatureProperties> {
  const index = new Supercluster({
    radius: 60,      // Cluster radius in screen pixels
    maxZoom: 16,      // Stop clustering at this zoom
    minPoints: 3,     // Minimum points to form a cluster
    ...options,
  });
  index.load(data.features as Supercluster.PointFeature<LayerFeatureProperties>[]);
  return index;
}

export function getClustersForViewport(
  index: Supercluster<LayerFeatureProperties>,
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number
): Array<Supercluster.ClusterFeature<LayerFeatureProperties> | Supercluster.PointFeature<LayerFeatureProperties>> {
  return index.getClusters(
    [bounds.west, bounds.south, bounds.east, bounds.north],
    Math.floor(zoom)
  );
}
```

### Which Layers Need Clustering

| Layer | Approx Count | Needs Clustering | Supercluster Config |
|-------|-------------|-----------------|---------------------|
| ALPR cameras | 336K | YES | radius: 80, maxZoom: 14 (aggressive) |
| Speed cameras | ~10K | YES | radius: 60, maxZoom: 16 |
| Crime incidents | 1K-50K | YES | radius: 60, maxZoom: 16 |
| Air quality | ~2K | NO | Direct render (sparse coverage) |
| Flights | ~6,700 | NO | Direct render (global spread) |
| Earthquakes | ~500 | NO | Direct render |
| Wildfires | ~1K | MAYBE | Only at globe scale |
| All others | <500 | NO | Direct render |

### Web Workers for Clustering (v2)

For v1, the ~200ms Supercluster index build for 336K points happens on the main thread. This is a one-time cost when the ALPR layer is first enabled -- imperceptible to users. The viewport queries are sub-millisecond and do not affect frame rate.

For v2, if multiple large datasets need simultaneous clustering, move `index.load()` to a Web Worker to avoid blocking the main thread during index construction.

---

## WebSocket Protocol Detail

### Socket.IO Event Types

```typescript
// types/websocket.ts

// Client -> Server events
interface ClientToServerEvents {
  subscribe: (layerId: string) => void;
  unsubscribe: (layerId: string) => void;
}

// Server -> Client events
interface ServerToClientEvents {
  data: (payload: {
    layerId: string;
    data: LayerFeatureCollection;
    timestamp: number;
  }) => void;

  status: (payload: {
    layerId: string;
    status: 'active' | 'error' | 'loading';
    count: number;
    error?: string;
  }) => void;

  event: (payload: {
    layerId: string;
    type: 'added' | 'removed' | 'updated';
    summary: string;      // "M4.2 earthquake near Tokyo"
    timestamp: number;
  }) => void;
}
```

### Channel Architecture

```
Socket.IO Namespace: /layers
  |
  +-- Room: layer:flights        (clients watching flights)
  +-- Room: layer:earthquakes    (clients watching earthquakes)
  +-- Room: layer:weather        (clients watching weather alerts)
  +-- Room: layer:alpr           (clients watching ALPR cameras)
  +-- ... (one room per active layer)
```

On data update, the backend emits only to the relevant room. A client not subscribed to flights receives zero flight data.

### Initial Data Load Strategy

The frontend uses a dual strategy for initial data:

1. **HTTP GET** `/api/layers/:layerId` -- returns cached FeatureCollection for each enabled layer. Called in parallel for all visible layers on page load. This provides data before the WebSocket connection is fully established.

2. **WebSocket subscribe** -- when the Socket.IO connection opens, the client subscribes to visible layers. The server sends current cached data immediately on subscribe (in case the HTTP request hasn't returned yet or there's been an update since).

After initial load, **only WebSocket is used** for data updates. HTTP routes remain available as a fallback.

### Why Full Replace Over Delta Patching

For v1, each layer update sends the complete FeatureCollection rather than a delta/patch:

- Most layers are small enough that full replace is cheap (USGS ~100 features, NWS ~200 features)
- The dense static layer (ALPR 336K) updates once per day -- full replace is fine for daily cadence
- Flights (6,700 features) at ~500KB uncompressed compress to ~50-80KB with Socket.IO's built-in per-message compression on LAN
- Delta patching adds significant complexity: the client must maintain state, handle out-of-order patches, and implement conflict resolution. The risk of client getting out of sync outweighs the bandwidth savings for a single-user LAN dashboard

---

## Error Isolation Architecture

### Backend: Independent Fetcher Execution

```
Scheduler fires cron jobs for all 17 sources independently:
  |
  +-- opensky.execute()     -> SUCCESS: cache + emit to layer:flights room
  +-- usgs.execute()        -> SUCCESS: cache + emit to layer:earthquakes room
  +-- nws.execute()         -> FAIL (API timeout): log, set error status, continue
  +-- pulsepoint.execute()  -> SUCCESS: cache + emit to layer:fire-ems room
  +-- deflock.execute()     -> FAIL (404): log, set error status, continue
  ...
```

Each `execute()` call is independent. They are NOT coordinated via `Promise.all`. A slow or failed fetcher does not block or affect any other fetcher. The scheduler fires each cron job independently; node-cron handles this by default.

### Frontend: Error Boundaries Per Layer

Each layer component is wrapped in a React Error Boundary. A crash in `SatelliteLayer` (e.g., bad TLE data causing satellite.js to throw) does not take down the globe or other layers.

```tsx
<LayerRenderer>
  <ErrorBoundary fallback={<LayerErrorIndicator layerId="flights" />}>
    <FlightLayer data={flightData} viewer={viewer} />
  </ErrorBoundary>
  <ErrorBoundary fallback={<LayerErrorIndicator layerId="earthquakes" />}>
    <EarthquakeLayer data={earthquakeData} viewer={viewer} />
  </ErrorBoundary>
  ...
</LayerRenderer>
```

### Status Propagation Flow

```
Backend fetcher throws error
  -> cache.setError(sourceId, message) writes to Redis
  -> io.emit('status', { layerId, status: 'error', error: message })
  -> Frontend useWebSocket receives status event
  -> zustand layerStore updates layer.status = 'error', layer.error = message
  -> LayerToggle component shows red error badge with message
  -> User sees "NWS: API timeout" in control panel
  -> All other layers continue operating normally
```

---

## Docker Networking

### docker-compose.yml

```yaml
services:
  frontend:
    build:
      context: ./frontend
      args:
        VITE_CESIUM_ION_TOKEN: ${CESIUM_ION_TOKEN}
    ports:
      - "3010:80"       # Only exposed port
    depends_on:
      - backend
    networks:
      - geospatial

  backend:
    build: ./backend
    expose:
      - "3011"           # Internal only -- nginx proxies to this
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
      - PORT=3011
    env_file:
      - .env             # API keys loaded from .env file
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - geospatial
    restart: unless-stopped

  redis:
    image: redis:7.2-alpine
    command: >
      redis-server
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --save ""
      --appendonly no
    expose:
      - "6379"           # Internal only
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    networks:
      - geospatial
    restart: unless-stopped

networks:
  geospatial:
    driver: bridge
```

**Key decisions:**
- `expose` (not `ports`) for backend and Redis -- accessible only within Docker network
- Only the frontend (nginx) maps port 3010 to the host
- Redis has no persistence volumes (pure cache)
- Backend uses `env_file` for API keys (never committed to git)
- `depends_on` with healthcheck ensures Redis is healthy before backend starts
- All three containers share a single bridge network and resolve each other by service name

### nginx Configuration (frontend/nginx.conf)

```nginx
upstream backend {
    server backend:3011;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name _;

    # SPA static files
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # REST API proxy
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket proxy (Socket.IO)
    location /socket.io/ {
        proxy_pass http://backend/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;   # Keep WebSocket alive (24h)
    }

    # CesiumJS static assets -- cache aggressively (immutable build output)
    location /cesium/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression for text-based assets
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;
}
```

**Critical: WebSocket upgrade headers.** Without `proxy_set_header Upgrade` and the `map` directive, Socket.IO falls back to HTTP long-polling, defeating the real-time architecture. The `proxy_read_timeout 86400s` prevents nginx from closing idle WebSocket connections.

### Frontend Dockerfile (Multi-Stage Build)

```dockerfile
# Stage 1: Build with Vite
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_CESIUM_ION_TOKEN
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

The Cesium Ion token is embedded at build time via Vite's `VITE_` env var convention. This is acceptable: the token is a free-tier public token for loading terrain/imagery tiles, not a secret.

---

## Patterns to Follow

### Pattern 1: Render Nothing from Layer Components

Layer components return `null`. They use `useRef` + `useEffect` to imperatively manage CesiumJS primitives. No React DOM elements are created for thousands of entities. React's reconciler never sees the entities.

### Pattern 2: Debounced Camera Change Handling

CesiumJS fires `camera.changed` on every frame during navigation (60+ times per second). Supercluster queries and viewport recalculations must be debounced -- recalculate only 100ms after the camera stops moving. Without debouncing, cluster queries thrash during pan/zoom.

### Pattern 3: Fire-and-Forget Fetchers

The scheduler calls `fetcher.execute()` without awaiting the result. Each fetcher handles its own errors internally. The scheduler never blocks waiting for a slow API. This ensures a 30-second Overpass API timeout does not prevent the 10-second OpenSky poll from firing.

### Pattern 4: Cache-Then-Network for Initial Load

On page load: HTTP GET requests provide cached data immediately. WebSocket establishes in parallel. Once WebSocket is live, all subsequent updates come via WebSocket. This eliminates the "blank globe while connecting" problem that WebSocket-only approaches have.

### Pattern 5: Stable Entity IDs for Diffing

Every feature has a stable `properties.id` (ICAO24 for flights, event ID for earthquakes, unique hash for cameras). The frontend can diff incoming data against existing primitives by ID, updating positions rather than removing-and-readding all billboards. This produces smoother visual transitions.

### Pattern 6: Subscribe-on-Visibility

The frontend subscribes to a layer's WebSocket room only when that layer is toggled visible. Toggling a layer off unsubscribes from the room. This prevents the backend from pushing ALPR data (potentially megabytes) to a client that isn't even displaying it.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: React Component Per Entity

**What:** `data.features.map(f => <Entity key={f.id} position={...} />)`
**Why bad:** 6,700 React components with virtual DOM diffing and reconciliation at 60fps. React DevTools becomes unusable. Memory usage explodes. GC pauses cause frame drops.
**Instead:** One layer component with one BillboardCollection/PointPrimitiveCollection, managed imperatively via `useRef`.

### Anti-Pattern 2: Storing Cesium Cartesian3 in React State

**What:** `useState(new Cesium.Cartesian3(...))`
**Why bad:** Cesium Cartesian3 objects are mutable. React's comparison-by-reference means state updates with Cartesian3 create infinite re-render loops or silently miss updates.
**Instead:** Store `[lon, lat, alt]` arrays in state. Convert to Cartesian3 only at the imperative render boundary.

### Anti-Pattern 3: Single Broadcast Channel for All Layers

**What:** One WebSocket event with all 17 layers merged, sent to all clients
**Why bad:** A client watching only earthquakes receives 6,700 flight updates every 10 seconds. Wasted bandwidth and JSON parsing CPU.
**Instead:** Room-based subscriptions. Client joins only rooms for visible layers.

### Anti-Pattern 4: Promise.all for Fetcher Execution

**What:** `await Promise.all(fetchers.map(f => f.execute()))`
**Why bad:** If OpenSky is slow (5s timeout), all other fetchers wait for Promise.all. Worse: Promise.all rejects on first failure, potentially skipping 16 successful fetches.
**Instead:** Fire each fetcher independently. No coordination needed.

### Anti-Pattern 5: Re-creating Supercluster Index on Every Data Update

**What:** `new Supercluster().load(data)` on every WebSocket message
**Why bad:** For 336K points, `index.load()` takes ~200ms. If data arrives frequently, this creates 200ms jank per update.
**Instead:** For static datasets (ALPR, speed cameras), create the index once. For dynamic datasets (crime), only re-index when the dataset actually changes (check feature count or metadata timestamp).

### Anti-Pattern 6: Bundling CesiumJS Through Vite/Rollup

**What:** Letting Vite's Rollup process CesiumJS source code
**Why bad:** CesiumJS uses dynamic `require()` internally that Rollup cannot resolve. Build will fail or produce a broken bundle.
**Instead:** Exclude CesiumJS from `optimizeDeps` and use `viteStaticCopy` to copy pre-built CesiumJS static assets from `node_modules/cesium/Build/Cesium/`.

### Anti-Pattern 7: Missing `suspendEvents()` During Bulk Entity Updates

**What:** Adding 6,700 entities to a CustomDataSource without suspending events
**Why bad:** CesiumJS fires `EntityCollection.collectionChanged` for every entity added. 6,700 events per 10-second refresh causes noticeable frame drops.
**Instead:** If using Entity API (e.g., for weather polygons), always bracket bulk operations:
```javascript
dataSource.entities.suspendEvents();
// ... add/remove entities ...
dataSource.entities.resumeEvents();
```
For most layers, using Primitive collections avoids this entirely.

---

## Scalability Considerations

| Concern | 1 Client (v1) | 5 Clients | 50 Clients (future) |
|---------|---------------|-----------|---------------------|
| WebSocket connections | Trivial | Trivial | Socket.IO handles thousands natively |
| API polling frequency | Fixed per source config | Same (no change) | Same (backend polls independently of client count) |
| Redis memory | ~50-100MB (17 cached FeatureCollections) | Same (shared cache) | Same |
| Backend CPU | Low (17 cron jobs, JSON normalization, broadcast) | Low (broadcast is O(rooms)) | Moderate (JSON serialization per room) |
| Frontend GPU | CesiumJS rendering (client-side) | N/A (per-browser) | N/A |
| Backend memory | ~200MB Node.js baseline | ~250MB (Socket.IO connection state) | ~400MB |
| Network bandwidth (LAN) | ~1-5 MB/min (all layers active) | Same per client | Scales linearly but LAN has capacity |

**Key insight:** Backend cost does not scale with client count for the polling/caching layer. It polls the same 17 APIs at the same rate whether 0 or 50 browsers are connected. Only the WebSocket broadcast cost increases with clients, and Socket.IO's room-based emit is efficient for targeted delivery.

---

## Sources

- [WorldView (kevtoe) -- Reference implementation analysis](https://github.com/kevtoe/worldview) -- HIGH confidence, same problem domain, verified architecture patterns
- [worldwideview (silvertakana) -- 100K+ entity rendering with CesiumJS primitives](https://github.com/silvertakana/worldwideview) -- HIGH confidence
- [Resium Guide -- Component lifecycle and read-only properties](https://resium.reearth.io/guide) -- HIGH confidence
- [CesiumJS Entity API Performance Blog](https://cesium.com/blog/2018/06/21/entity-api-performance/) -- HIGH confidence
- [CesiumJS BillboardCollection Documentation](https://cesium.com/learn/cesiumjs/ref-doc/BillboardCollection.html) -- HIGH confidence
- [CesiumJS PostProcessStage Documentation](https://cesium.com/learn/cesiumjs/ref-doc/PostProcessStage.html) -- HIGH confidence
- [CesiumJS Graphics Architecture Blog](https://cesium.com/blog/2015/05/15/graphics-tech-in-cesium-architecture/) -- HIGH confidence
- [CesiumJS EntityCluster Documentation](https://cesium.com/learn/ion-sdk/ref-doc/EntityCluster.html) -- HIGH confidence
- [CesiumJS EntityCollection Performance Discussion](https://community.cesium.com/t/entitycollection-performance-vs-billboardcollection-labelcollection/8168) -- MEDIUM confidence
- [Socket.IO Namespaces Documentation](https://socket.io/docs/v4/namespaces/) -- HIGH confidence
- [Socket.IO Rooms Documentation](https://socket.io/docs/v3/rooms/) -- HIGH confidence
- [Socket.IO Server Initialization (with Fastify)](https://socket.io/docs/v4/server-initialization/) -- HIGH confidence
- [fastify-socket.io npm (community plugin)](https://www.npmjs.com/package/fastify-socket.io) -- MEDIUM confidence
- [Redis Caching Patterns with Node.js](https://redis.io/learn/develop/node/nodecrashcourse/caching) -- HIGH confidence
- [Redis Rate Limiting Algorithms](https://redis.io/learn/howtos/ratelimiting) -- HIGH confidence
- [Redis Caching Strategies for Node.js APIs](https://www.leadwithskills.com/blogs/redis-caching-strategies-nodejs-api) -- MEDIUM confidence
- [Docker Compose Node.js + Nginx + Redis Tutorial](https://redis.io/tutorials/operate/docker/nodejs-nginx-redis/) -- HIGH confidence
- [GeoJSON RFC 7946 Specification](https://www.rfc-editor.org/rfc/rfc7946) -- HIGH confidence
- [Web Workers API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) -- HIGH confidence
- [Node.js Scheduler Comparison (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/) -- MEDIUM confidence
- [Aggregator Pattern in Microservices](https://mdjamilkashemporosh.medium.com/the-aggregator-pattern-in-microservice-architecture-your-go-to-guide-cd54575a5e6e) -- MEDIUM confidence
- [CesiumJS CallbackProperty Performance](https://community.cesium.com/t/using-multiple-callbackproperty-kills-performance-drops-to-zero-fps-code-repaired/10608) -- MEDIUM confidence
