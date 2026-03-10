# Phase 1: Foundation - Research

**Researched:** 2026-03-10
**Domain:** CesiumJS 3D globe, Fastify 5 backend, Redis cache, Docker Compose deployment, WebSocket real-time pipeline, USGS earthquakes, NWS weather alerts
**Confidence:** HIGH

## Summary

Phase 1 builds the complete end-to-end pipeline: a CesiumJS 3D globe with terrain, satellite imagery, day/night cycle, and atmosphere; a Fastify 5 backend with Socket.IO for real-time WebSocket updates; Redis caching with TTL; two proof-of-concept data layers (USGS earthquakes + NWS weather alerts); and Docker Compose deployment behind an nginx reverse proxy. The existing codebase has a working skeleton but uses multiple deprecated/incorrect libraries that MUST be replaced before proceeding.

The existing code has **six critical issues** that must be fixed: (1) uses abandoned `vite-plugin-cesium` instead of `vite-plugin-static-copy`, (2) uses Fastify 4 instead of Fastify 5, (3) uses `ioredis` instead of `node-redis` v5, (4) uses raw `ws`/`@fastify/websocket` instead of Socket.IO, (5) uses deprecated `createWorldTerrainAsync` terrain API, and (6) wraps Globe in React `StrictMode` which causes Resium double-initialization. All of these are addressed in this research.

**Primary recommendation:** Replace the existing skeleton code with the correct stack (Fastify 5, Socket.IO, node-redis v5, vite-plugin-static-copy), implement the BaseFetcher pattern from the architecture docs, and use `Terrain.fromWorldTerrain()` with `requestRenderMode: true` for CesiumJS.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GLOB-01 | Photorealistic 3D globe with terrain and satellite imagery on page load | Viewer setup with Terrain.fromWorldTerrain(), Ion token, requestVertexNormals |
| GLOB-02 | Rotate, zoom, tilt with smooth mouse/touch controls | Default CesiumJS navigation; disable unnecessary widgets for clean UI |
| GLOB-03 | Day/night cycle with atmosphere rendering | scene.globe.enableLighting = true; SkyAtmosphere defaults |
| GLOB-06 | Fly to specific coordinates or city via search bar | CesiumJS geocoder or custom search with camera.flyTo() |
| GLOB-07 | Coordinate display (lat/lng) as cursor moves | ScreenSpaceEventHandler MOUSE_MOVE pattern (existing code works) |
| EQKE-01 | Global earthquake events updated every 60 seconds | USGS GeoJSON feed, node-cron scheduler, Redis TTL 55s |
| EQKE-02 | Earthquake markers sized by magnitude with color gradient | PointPrimitiveCollection with magnitude-based pixelSize and color |
| EQKE-03 | Click earthquake for popup: magnitude, depth, location, time | ScreenSpaceEventHandler LEFT_CLICK, entity id lookup |
| WTHR-01 | Active NWS weather alerts as polygon overlays | GeoJsonDataSource for polygon rendering (low-count, OK with Entity API) |
| WTHR-02 | Alerts colored by severity (watch, warning, advisory) | Color mapping function by severity field |
| WTHR-03 | Click alert polygon for details and affected area | Resium Entity description HTML popups |
| BACK-01 | Backend polls external APIs on configurable schedules | node-cron per-source intervals, BaseFetcher pattern |
| BACK-02 | API responses normalized to unified GeoJSON FeatureCollections | LayerFeatureCollection type shared between frontend/backend |
| BACK-03 | Redis caches API responses with per-source TTL | node-redis v5 setEx with source-specific TTL |
| BACK-04 | WebSocket server pushes real-time updates to browsers | Socket.IO room-based broadcast on data update |
| BACK-05 | REST endpoints for initial data load per layer | GET /api/layers/:layerId returns cached FeatureCollection |
| BACK-06 | Each data source isolated in its own fetcher file | usgs.ts and nws.ts extending BaseFetcher |
| BACK-07 | Config file defines all API endpoints, keys, poll intervals | sources.ts with SourceConfig array |
| DEPL-01 | Entire stack deploys via single docker compose up | docker-compose.yml with 3 services (backend, redis, nginx) |
| DEPL-02 | Frontend served by nginx container on port 3010 | nginx reverse proxy on :3010 serving built frontend + proxy backend |
| DEPL-03 | Backend runs on port 4010 with WebSocket support | Fastify + Socket.IO on internal port 4010, proxied via nginx |
| DEPL-04 | Redis container with persistent volume for cache data | Redis 7.2-alpine, no persistence needed (cache only), maxmemory 256mb |
| DEPL-05 | Environment variables for all API keys/tokens via .env | .env file with CESIUM_ION_TOKEN, .env.example committed |
| DEPL-06 | Dashboard accessible at http://192.168.1.65:3010 | nginx container port mapping 3010:80 |
</phase_requirements>

## Existing Code Audit

The existing codebase at `/root/geospatial-dashboard/` has a working skeleton that must be corrected before Phase 1 work proceeds. Here is the gap analysis:

### Files That Must Be Replaced/Rewritten

| File | Current State | Required State | Issue |
|------|--------------|----------------|-------|
| `frontend/vite.config.ts` | Uses `vite-plugin-cesium` (abandoned) | Use `vite-plugin-static-copy` (official CesiumGS approach) | Plugin abandoned, will break on future Vite updates |
| `frontend/package.json` | cesium ^1.115, vite ^5, vite-plugin-cesium | cesium ^1.139, vite ^6, vite-plugin-static-copy | Outdated versions, wrong plugin |
| `frontend/src/main.tsx` | Wraps App in `<StrictMode>` | Remove StrictMode around Viewer or exclude Viewer subtree | Resium double-initialization in dev mode |
| `frontend/src/components/Globe.tsx` | Uses Entity API, `createWorldTerrainAsync()`, empty Ion token | Use PointPrimitiveCollection for earthquakes, `Terrain.fromWorldTerrain()`, env var Ion token | Memory leak risk, deprecated API, missing terrain |
| `frontend/src/hooks/useWebSocket.ts` | Raw WebSocket with manual reconnect | socket.io-client with auto-reconnect and room subscriptions | No rooms, no heartbeat, manual reconnect logic |
| `frontend/src/types.ts` | Raw USGS/NWS types passed through | Unified LayerFeatureCollection type | No normalization layer |
| `backend/package.json` | fastify ^4, ioredis, @fastify/websocket, ws | fastify ^5, redis (node-redis v5), socket.io | Wrong framework version, wrong Redis client, wrong WS lib |
| `backend/src/index.ts` | Fastify 4 + @fastify/websocket + ioredis | Fastify 5 + Socket.IO manual attach + node-redis v5 | Architecture mismatch with decided stack |
| `backend/src/websocket.ts` | Raw ws broadcast via global Set | Socket.IO room-based broadcast | No reconnect, no rooms, fragile global state |
| `nginx/nginx.conf` | Proxies /ws path for raw WebSocket | Must proxy /socket.io/ path with upgrade headers | Socket.IO uses /socket.io/ path, not /ws |
| `docker-compose.yml` | Backend on port 4000, separate frontend container | Backend on port 4010, nginx multi-stage build serves frontend | Port mismatch with DEPL-03, extra container |

### Files That Can Be Kept/Adapted

| File | Status | Notes |
|------|--------|-------|
| `frontend/src/components/SearchBar.tsx` | Keep | Basic search input, works fine |
| `frontend/src/components/CoordinateDisplay.tsx` | Keep | Coordinate display, works fine |
| `backend/src/services/earthquakes.ts` | Adapt | Good fetching structure, needs node-redis v5 API and BaseFetcher pattern |
| `backend/src/services/weather.ts` | Adapt | Good fetching structure, needs node-redis v5 API and BaseFetcher pattern |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CesiumJS | 1.139.1 | 3D globe engine | Latest stable; WebGL2 default; native terrain, 3D Tiles, PostProcessStage |
| Resium | 1.19.4 | React wrappers for CesiumJS | Declarative Viewer setup; peer dep cesium "1.x", react ">=18.2.0" |
| React | 19.x | UI component framework | Resium supports React 19; standard for TypeScript SPA |
| Vite | 6.x | Build tool + dev server | Official CesiumJS recommendation; vite-plugin-cesium is abandoned |
| vite-plugin-static-copy | latest | Copy Cesium static assets to build output | Official CesiumGS approach from cesium-vite-example |
| Fastify | 5.8.x | HTTP server + REST API | 2-3x faster than Express; native TypeScript; JSON schema validation |
| Socket.IO | 4.8.3 | Real-time WebSocket broadcast | Auto-reconnect, rooms, heartbeat; manual attach to fastify.server |
| socket.io-client | 4.8.3 | WebSocket client | Must match server version; auto-reconnect with exponential backoff |
| node-redis (redis) | 5.11.0 | Redis client | Official Redis recommendation; built-in TypeScript; promise-based API |
| Redis | 7.2-alpine | In-memory TTL cache | Docker image; allkeys-lru eviction; no persistence needed |
| nginx | alpine | Reverse proxy + static file server | Serves frontend build; proxies /api and /socket.io to backend |
| TypeScript | 5.x | Type safety | Shared types between frontend and backend |
| Node.js | 22-alpine | Backend runtime | Current LTS; built-in fetch; ESM support |
| node-cron | 3.x | Scheduled API polling | Per-source cron-style intervals with second-level precision |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | 5.x | Client state management | Layer toggle state, UI state (minimal in Phase 1, expands in Phase 2) |
| @vitejs/plugin-react | latest | React HMR in Vite dev server | Dev dependency for frontend build |
| tsx | latest | TypeScript execution for dev | Backend dev server with `tsx watch` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vite-plugin-static-copy | vite-plugin-cesium | vite-plugin-cesium is ABANDONED -- do not use under any circumstances |
| Socket.IO | raw ws library | ws has no auto-reconnect, no rooms, no heartbeat; requires manual broadcast logic |
| node-redis v5 | ioredis | ioredis works but node-redis v5 is the official Redis recommendation for new projects |
| Fastify 5 | Express | Express is slower and has weaker TypeScript support |
| node-cron | setInterval | setInterval lacks cron expression flexibility for varied schedules |

**Installation (frontend):**
```bash
npm install cesium@^1.139.0 resium@^1.19.0 react@^19.0.0 react-dom@^19.0.0 socket.io-client@^4.8.3 zustand@^5.0.0
npm install -D typescript@^5.4.0 vite@^6.0.0 @vitejs/plugin-react vite-plugin-static-copy @types/react @types/react-dom
```

**Installation (backend):**
```bash
npm install fastify@^5.8.0 socket.io@^4.8.3 redis@^5.11.0 node-cron@^3.0.0
npm install -D typescript@^5.4.0 tsx @types/node @types/node-cron
```

## Architecture Patterns

### Recommended Project Structure

```
geospatial-dashboard/
|
+-- docker-compose.yml
+-- .env                         # CESIUM_ION_TOKEN (never committed)
+-- .env.example                 # Template with placeholder values (committed)
+-- .gitignore
|
+-- frontend/
|   +-- nginx.conf               # SPA fallback (try_files) -- used inside nginx container
|   +-- index.html
|   +-- vite.config.ts           # viteStaticCopy for Cesium assets
|   +-- tsconfig.json
|   +-- tsconfig.node.json
|   +-- package.json
|   +-- src/
|       +-- main.tsx             # ReactDOM entry, Ion token init (NO StrictMode)
|       +-- App.tsx              # Root component, WebSocket provider
|       +-- components/
|       |   +-- Globe.tsx        # Resium Viewer, scene config, lighting, terrain
|       |   +-- EarthquakeLayer.tsx  # PointPrimitiveCollection for earthquake markers
|       |   +-- WeatherLayer.tsx     # GeoJsonDataSource for weather alert polygons
|       |   +-- SearchBar.tsx    # Fly-to search input (keep existing)
|       |   +-- CoordinateDisplay.tsx # Lat/lng cursor display (keep existing)
|       |   +-- StatusBar.tsx    # Connection status, layer counts, clock
|       +-- hooks/
|       |   +-- useWebSocket.ts  # Socket.IO client connection + room subscriptions
|       +-- types/
|       |   +-- geojson.ts      # Unified LayerFeatureCollection types
|       +-- utils/
|           +-- cesiumHelpers.ts # Color scale functions, coordinate conversion
|
+-- backend/
|   +-- Dockerfile               # Node 22-alpine
|   +-- tsconfig.json
|   +-- package.json
|   +-- src/
|       +-- index.ts             # Entry point, startup sequence
|       +-- server.ts            # Fastify + Socket.IO creation
|       +-- config/
|       |   +-- sources.ts      # Source configs: ID, URL, interval, TTL, enabled
|       |   +-- env.ts          # Typed env var loading
|       +-- fetchers/
|       |   +-- BaseFetcher.ts  # Abstract class: fetch, normalize, cache, emit
|       |   +-- usgs.ts        # USGS earthquake fetcher
|       |   +-- nws.ts         # NWS weather alerts fetcher
|       +-- services/
|       |   +-- cache.ts       # Redis get/setEx with TTL, key naming
|       |   +-- scheduler.ts   # node-cron job registration with staggered startup
|       |   +-- websocket.ts   # Socket.IO namespace/room management
|       +-- routes/
|       |   +-- layers.ts      # GET /api/layers/:layerId
|       |   +-- health.ts      # GET /api/health
|       +-- types/
|           +-- geojson.ts     # Shared types (identical to frontend)
|
+-- nginx/
    +-- Dockerfile              # Multi-stage: build frontend then serve via nginx
    +-- nginx.conf              # Reverse proxy configuration
```

### Pattern 1: Vite Configuration for CesiumJS (CRITICAL -- replaces existing broken config)

**What:** Copy CesiumJS static assets (Workers, Assets, ThirdParty, Widgets) to the build output and define `CESIUM_BASE_URL` as a global variable.

**When to use:** Every CesiumJS project using Vite. This replaces the abandoned `vite-plugin-cesium`.

**Example:**
```typescript
// frontend/vite.config.ts
// Source: https://github.com/CesiumGS/cesium-vite-example
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  optimizeDeps: {
    exclude: ['cesium'],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:4010',
      '/socket.io': {
        target: 'http://localhost:4010',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
```

**Key details:**
- `cesiumSource` points to the pre-built CesiumJS assets in node_modules
- `cesiumBaseUrl` is the path under which assets are served (must match `CESIUM_BASE_URL`)
- `optimizeDeps.exclude: ['cesium']` prevents Vite from trying to bundle CesiumJS
- Dev server proxy routes `/api` and `/socket.io` to the backend for local development
- The `define` block sets a global `CESIUM_BASE_URL` that CesiumJS reads at runtime

### Pattern 2: Resium Viewer with requestRenderMode and Terrain

**What:** Initialize CesiumJS Viewer with terrain, lighting, atmosphere, and explicit render mode to minimize idle CPU.

**When to use:** Phase 1 globe setup (GLOB-01, GLOB-02, GLOB-03).

**Example:**
```typescript
// frontend/src/components/Globe.tsx
import { Viewer } from 'resium';
import * as Cesium from 'cesium';
import { useMemo, useRef, useCallback } from 'react';

// Set Ion token from env var -- MUST be set before Viewer creation
Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

function Globe({ children }: { children?: React.ReactNode }) {
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  // Memoize terrain to prevent re-creation on re-render (CRITICAL)
  const terrain = useMemo(
    () => Cesium.Terrain.fromWorldTerrain({ requestVertexNormals: true }),
    []
  );

  const handleViewerReady = useCallback((viewer: Cesium.Viewer) => {
    viewerRef.current = viewer;
    // GLOB-03: Enable day/night cycle
    viewer.scene.globe.enableLighting = true;
    // Performance: render only when scene changes (idle CPU ~0%)
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Infinity;
  }, []);

  return (
    <Viewer
      full
      terrain={terrain}
      timeline={false}
      animation={false}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      infoBox={true}
      selectionIndicator={true}
      ref={(e) => {
        if (e?.cesiumElement && !viewerRef.current) {
          handleViewerReady(e.cesiumElement);
        }
      }}
    >
      {children}
    </Viewer>
  );
}
```

**Key notes:**
- `Terrain.fromWorldTerrain()` replaces the deprecated `createWorldTerrainAsync()` (deprecated in CesiumJS 1.104, removed in 1.107)
- `requestVertexNormals: true` is **required** for `enableLighting` to produce proper day/night shading on terrain
- `requestRenderMode: true` drops idle CPU from ~100% to ~0% -- essential for a 24/7 dashboard
- `maximumRenderTimeChange = Infinity` prevents unnecessary re-renders from clock tick
- All CesiumJS object props passed to Resium components MUST be memoized with `useMemo`
- Do NOT wrap the Viewer in React StrictMode -- StrictMode double-invokes effects in dev

### Pattern 3: Fastify 5 + Socket.IO Manual Attach

**What:** Attach Socket.IO directly to Fastify's underlying `http.Server`. The `fastify-socket.io` plugin does NOT support Fastify 5.

**When to use:** Any Fastify 5 project needing WebSocket broadcast (BACK-04).

**Example:**
```typescript
// backend/src/server.ts
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';

export async function createServer() {
  const fastify = Fastify({ logger: true });

  // node-redis v5: createClient returns a promise-based client
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379',
  });
  redis.on('error', (err) => console.error('Redis error:', err));
  await redis.connect();

  // Register Fastify routes BEFORE listen
  // ... register routes here ...

  // Start listening
  await fastify.listen({ port: 4010, host: '0.0.0.0' });

  // Attach Socket.IO to the underlying http.Server AFTER listen
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: '*' },
    transports: ['websocket'],
    path: '/socket.io',
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Layer namespace for room-based data subscriptions
  const layerNs = io.of('/layers');

  layerNs.on('connection', (socket) => {
    console.log(`[ws] Client connected: ${socket.id}`);

    socket.on('subscribe', async (layerId: string) => {
      socket.join(`layer:${layerId}`);
      // Send cached data immediately on subscribe
      const cached = await redis.get(`geo:layer:${layerId}`);
      if (cached) {
        socket.emit('data', {
          layerId,
          data: JSON.parse(cached),
          timestamp: Date.now(),
        });
      }
    });

    socket.on('unsubscribe', (layerId: string) => {
      socket.leave(`layer:${layerId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[ws] Client disconnected: ${socket.id}`);
    });
  });

  return { fastify, io, redis, layerNs };
}
```

**Key details:**
- Socket.IO is attached to `fastify.server` (the raw `http.Server`), NOT via a Fastify plugin
- `transports: ['websocket']` skips HTTP long-polling fallback for better performance
- `pingInterval`/`pingTimeout` keeps connections alive through NAT timeout
- Room-based subscriptions: clients only receive data for layers they subscribe to
- On subscribe, cached data is sent immediately so the client does not wait for the next poll cycle

### Pattern 4: nginx Reverse Proxy with WebSocket Upgrade

**What:** nginx configuration that proxies frontend static files, REST API, and Socket.IO WebSocket connections.

**When to use:** Docker Compose deployment with frontend served from nginx (DEPL-02, DEPL-06).

**Example:**
```nginx
# nginx/nginx.conf
# Sources: https://socket.io/docs/v3/reverse-proxy/
#          https://nginx.org/en/docs/http/websocket.html

map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream backend {
    server backend:4010;
}

server {
    listen 80;
    server_name _;

    # Frontend static files (Vite build output)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # Backend REST API
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Socket.IO WebSocket (CRITICAL: must include upgrade headers)
    location /socket.io/ {
        proxy_pass http://backend/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }

    # Cache Cesium static assets aggressively (they never change for a given version)
    location /cesiumStatic/ {
        root /usr/share/nginx/html;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip for JSON and JavaScript
    gzip on;
    gzip_types application/json application/javascript text/css;
    gzip_min_length 1000;
}
```

**Key details:**
- The `map $http_upgrade` block is REQUIRED for WebSocket protocol upgrade
- `proxy_read_timeout 86400s` prevents nginx from closing idle WebSocket connections
- `proxy_buffering off` ensures real-time data flows without buffering delay
- Socket.IO path is `/socket.io/` (with trailing slash), NOT `/ws`
- Frontend is served from `/usr/share/nginx/html` (multi-stage Docker build output)
- CesiumJS static assets get 30-day cache headers since they are version-locked

### Pattern 5: BaseFetcher Abstract Class

**What:** Template method pattern for data source fetchers with isolated error handling.

**When to use:** Every data source fetcher (BACK-06, BACK-01).

**Example:**
```typescript
// backend/src/fetchers/BaseFetcher.ts
import type { CacheService } from '../services/cache.js';
import type { Namespace } from 'socket.io';
import type { LayerFeatureCollection } from '../types/geojson.js';

export abstract class BaseFetcher {
  abstract readonly sourceId: string;
  abstract readonly displayName: string;
  abstract readonly defaultInterval: string; // node-cron expression
  abstract readonly cacheTTL: number;        // seconds

  constructor(
    protected cache: CacheService,
    protected io: Namespace
  ) {}

  abstract fetchRaw(): Promise<unknown>;
  abstract normalize(raw: unknown): LayerFeatureCollection;

  async execute(): Promise<void> {
    try {
      // Check if cache is still fresh (skip redundant fetch)
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

      // Broadcast status update to ALL connected clients
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

### Pattern 6: Earthquake Rendering with PointPrimitiveCollection

**What:** Imperative rendering of earthquake markers using PointPrimitiveCollection instead of Entity API to avoid memory leaks.

**When to use:** Any layer with > 100 frequently-updating data points (EQKE-01, EQKE-02).

**Example:**
```typescript
// frontend/src/components/EarthquakeLayer.tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import type { LayerFeatureCollection } from '../types/geojson';

function magnitudeToColor(mag: number): Cesium.Color {
  if (mag >= 6.0) return Cesium.Color.RED;
  if (mag >= 5.0) return Cesium.Color.ORANGE;
  if (mag >= 4.0) return Cesium.Color.YELLOW;
  if (mag >= 3.0) return Cesium.Color.YELLOWGREEN;
  return Cesium.Color.LIGHTGREEN;
}

function magnitudeToSize(mag: number): number {
  return Math.max(5, mag * 3);
}

export function EarthquakeLayer({ viewer, data }: {
  viewer: Cesium.Viewer | null;
  data: LayerFeatureCollection | null;
}) {
  const pointsRef = useRef<Cesium.PointPrimitiveCollection | null>(null);

  // Create collection once on mount
  useEffect(() => {
    if (!viewer) return;
    const points = viewer.scene.primitives.add(
      new Cesium.PointPrimitiveCollection()
    );
    pointsRef.current = points;
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(points);
      }
    };
  }, [viewer]);

  // Update points when data changes (no React re-render of globe)
  useEffect(() => {
    const points = pointsRef.current;
    if (!points || !data) return;

    points.removeAll();
    for (const feature of data.features) {
      if (feature.geometry.type !== 'Point') continue;
      const [lon, lat] = feature.geometry.coordinates as number[];
      const mag = (feature.properties.mag as number) ?? 0;

      points.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        pixelSize: magnitudeToSize(mag),
        color: magnitudeToColor(mag),
        id: feature.properties.id, // for click handler lookup
      });
    }

    // Request render since we are in requestRenderMode
    viewer?.scene.requestRender();
  }, [data, viewer]);

  return null; // No React DOM output -- purely imperative CesiumJS
}
```

### Pattern 7: Weather Alerts with GeoJsonDataSource

**What:** Use CesiumJS GeoJsonDataSource for weather alert polygon rendering. Acceptable with Entity API because weather alerts are low-count (<100) and update infrequently (every 2-5 minutes).

**When to use:** Polygon/polyline layers with < 100 features and infrequent updates (WTHR-01, WTHR-02, WTHR-03).

**Example:**
```typescript
// frontend/src/components/WeatherLayer.tsx
import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

function severityToColor(severity: string): Cesium.Color {
  switch (severity?.toLowerCase()) {
    case 'extreme': return Cesium.Color.RED.withAlpha(0.5);
    case 'severe': return Cesium.Color.ORANGE.withAlpha(0.5);
    case 'moderate': return Cesium.Color.YELLOW.withAlpha(0.5);
    case 'minor': return Cesium.Color.LIGHTBLUE.withAlpha(0.4);
    default: return Cesium.Color.GRAY.withAlpha(0.3);
  }
}

export function WeatherLayer({ viewer, data }: {
  viewer: Cesium.Viewer | null;
  data: any | null;
}) {
  const dataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);

  useEffect(() => {
    if (!viewer || !data) return;

    // CRITICAL: Filter to only features WITH geometry (many NWS alerts lack polygons)
    const withGeometry = {
      type: 'FeatureCollection',
      features: data.features.filter((f: any) => f.geometry !== null),
    };

    if (withGeometry.features.length === 0) return;

    const ds = new Cesium.GeoJsonDataSource('weather-alerts');
    ds.load(withGeometry, {
      stroke: Cesium.Color.WHITE,
      strokeWidth: 2,
      fill: Cesium.Color.YELLOW.withAlpha(0.3),
      clampToGround: true,
    }).then(() => {
      // Apply severity-based colors per entity
      const entities = ds.entities.values;
      for (const entity of entities) {
        if (entity.polygon) {
          const severity = (entity.properties as any)?.severity?.getValue?.() ?? 'unknown';
          entity.polygon.material = new Cesium.ColorMaterialProperty(
            severityToColor(severity)
          );
        }
      }
      viewer.dataSources.add(ds);
      dataSourceRef.current = ds;
      viewer.scene.requestRender();
    });

    return () => {
      if (!viewer.isDestroyed() && dataSourceRef.current) {
        // Remove with destroy=true to clean up entity references
        viewer.dataSources.remove(dataSourceRef.current, true);
        dataSourceRef.current = null;
      }
    };
  }, [viewer, data]);

  return null;
}
```

### Pattern 8: Socket.IO Client Hook

**What:** Socket.IO client connection with room-based layer subscriptions and auto-reconnect.

**When to use:** Frontend WebSocket connection (BACK-04 client side).

**Example:**
```typescript
// frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const subscribeLayer = useCallback((layerId: string) => {
    socketRef.current?.emit('subscribe', layerId);
  }, []);

  const unsubscribeLayer = useCallback((layerId: string) => {
    socketRef.current?.emit('unsubscribe', layerId);
  }, []);

  useEffect(() => {
    const socket = io('/layers', {
      transports: ['websocket'],  // Skip HTTP long-polling fallback
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ws] Connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[ws] Disconnected');
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected, socket: socketRef, subscribeLayer, unsubscribeLayer };
}
```

### Pattern 9: node-redis v5 Cache Service

**What:** Redis cache with TTL-based expiry, key namespacing, and pipeline writes.

**When to use:** All backend caching (BACK-03).

**Example:**
```typescript
// backend/src/services/cache.ts
import { createClient, type RedisClientType } from 'redis';

export class CacheService {
  private client: RedisClientType;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on('error', (err) => console.error('Redis error:', err));
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('Redis connected');
  }

  async get(sourceId: string): Promise<any | null> {
    const raw = await this.client.get(`geo:layer:${sourceId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async set(sourceId: string, data: any, ttlSeconds: number): Promise<void> {
    const pipeline = this.client.multi();
    pipeline.setEx(`geo:layer:${sourceId}`, ttlSeconds, JSON.stringify(data));
    pipeline.setEx(`geo:layer:${sourceId}:meta`, ttlSeconds, JSON.stringify({
      fetchedAt: Date.now(),
      count: data.features?.length ?? 0,
      status: 'active',
    }));
    pipeline.del(`geo:layer:${sourceId}:error`);
    await pipeline.exec();
  }

  async setError(sourceId: string, error: string): Promise<void> {
    await this.client.setEx(`geo:layer:${sourceId}:error`, 60, error);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
```

**Key details for node-redis v5:**
- `createClient({ url })` -- accepts Redis URL string
- `await client.connect()` -- MUST be called before any commands (unlike ioredis which auto-connects)
- `client.setEx(key, ttl, value)` -- set with TTL in one call
- `client.multi()` -- pipeline for atomic batch writes
- `client.on('error', cb)` -- must attach error handler or unhandled errors crash the process
- `client.disconnect()` -- graceful shutdown (vs `client.quit()` which sends QUIT command)

### Anti-Patterns to Avoid

- **Using Entity API for dynamic layers:** Entity add/remove leaks memory via AssociativeArray. Use PointPrimitiveCollection for earthquakes, BillboardCollection for flights.
- **Creating CesiumJS objects inline in JSX:** `<ImageryLayer imageryProvider={new Cesium.OpenStreetMapImageryProvider()} />` creates a new object every render. Always use `useMemo`.
- **Wrapping Viewer in React StrictMode:** StrictMode double-invokes effects in dev, causing duplicate CesiumJS entity registration and viewer creation. Remove StrictMode around the Viewer subtree.
- **Using `createWorldTerrainAsync()`:** Deprecated in CesiumJS 1.104, removed in 1.107. Use `Cesium.Terrain.fromWorldTerrain()`.
- **Setting `Ion.defaultAccessToken = ''`:** Globe falls back to featureless ellipsoid without a valid token. Register at https://cesium.com/ion/ (free tier).
- **Using `vite-plugin-cesium`:** Abandoned by author. Use `vite-plugin-static-copy` as shown in cesium-vite-example.
- **Polling APIs from the frontend browser:** CORS blocks most data sources. All API calls go through the backend proxy.
- **Using `localhost` between Docker containers:** Each container has its own localhost. Use Docker Compose service names (`redis`, `backend`).
- **Not calling `viewer.scene.requestRender()`:** When `requestRenderMode: true`, the scene will NOT re-render until explicitly asked. Call `requestRender()` after every data update.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect logic | Custom retry loops with raw ws | Socket.IO auto-reconnect | Socket.IO handles exponential backoff, heartbeat, connection state, room management |
| CesiumJS static asset bundling | Custom copy scripts or symlinks | vite-plugin-static-copy | Official approach; handles Workers, Assets, Widgets, ThirdParty correctly |
| Terrain provider setup | Manual CesiumTerrainProvider URLs | Terrain.fromWorldTerrain() | Handles async init, vertex normals, water mask transparently |
| Cron scheduling | setInterval chains | node-cron | Cron expressions with second-level precision, human-readable schedules |
| Redis connection management | Manual retry/reconnect logic | node-redis v5 built-in reconnect | Auto-reconnect, promise-based, typed error events |
| GeoJSON polygon rendering | Manual coordinate conversion to Cesium primitives | GeoJsonDataSource.load() | Handles MultiPolygon, coordinate holes, clampToGround, entity styling automatically |
| WebSocket broadcast routing | Custom client tracking + filtering | Socket.IO rooms | Room-based routing is built-in, no custom broadcast logic needed |

**Key insight:** The existing skeleton hand-rolled WebSocket broadcasting via a global Set and raw ws. Socket.IO replaces this with 3 lines: `socket.join(room)`, `io.to(room).emit()`, and automatic cleanup on disconnect.

## Common Pitfalls

### Pitfall 1: CesiumJS Static Assets Not Found at Runtime
**What goes wrong:** Globe renders as blank sphere or crashes with "Web Worker not found" errors. Console shows 404s for `/cesiumStatic/Workers/...` files.
**Why it happens:** `CESIUM_BASE_URL` not set in Vite define block, or Cesium Workers/Assets not copied to build output by viteStaticCopy.
**How to avoid:** Use the exact viteStaticCopy configuration from Pattern 1. Verify `CESIUM_BASE_URL` is defined in Vite's `define` block. In production (nginx), verify the `cesiumStatic/` directory exists in the nginx html root after the Docker build.
**Warning signs:** Console errors mentioning "TaskProcessor", "Workers", or "cesium" path resolution failures.

### Pitfall 2: Resium Flicker from Unstable CesiumJS Object References
**What goes wrong:** Globe imagery keeps reloading, terrain flashes white, FPS drops to single digits.
**Why it happens:** CesiumJS objects created inline in JSX produce new references every render, causing Resium to destroy and recreate CesiumJS primitives.
**How to avoid:** Memoize ALL CesiumJS objects passed as props with `useMemo`. Terrain: `useMemo(() => Terrain.fromWorldTerrain(...), [])`. Never create CesiumJS objects inside the JSX return block.
**Warning signs:** Chrome DevTools showing constant network requests for terrain tiles even when camera is stationary. React Profiler showing Resium components re-rendering on every state change.

### Pitfall 3: Ion Token Missing or Empty
**What goes wrong:** Globe shows low-resolution ellipsoid with watermark. No terrain. No satellite imagery. No error message in console.
**Why it happens:** Existing code sets `Ion.defaultAccessToken = ''` which uses no token, silently falling back to a featureless globe.
**How to avoid:** Register for free Cesium Ion account (https://cesium.com/ion/), store token as `CESIUM_ION_TOKEN` in root `.env`. Access in frontend via `import.meta.env.VITE_CESIUM_ION_TOKEN`. Pass to nginx Dockerfile as build arg.
**Warning signs:** Globe looks like a featureless blue sphere without continent detail or terrain.

### Pitfall 4: Socket.IO Path Mismatch Through nginx
**What goes wrong:** WebSocket connection fails silently. Socket.IO falls back to HTTP long-polling which is dramatically slower and creates many XHR requests.
**Why it happens:** nginx not configured with `proxy_http_version 1.1`, `Upgrade`, and `Connection "upgrade"` headers for the `/socket.io/` path. Or the location path is `/ws` instead of `/socket.io/`.
**How to avoid:** Use the exact nginx config from Pattern 4. Include `map $http_upgrade $connection_upgrade` directive. Set `proxy_read_timeout 86400s` to prevent nginx from closing idle WebSocket connections.
**Warning signs:** Browser DevTools Network tab showing repeated XHR requests to `/socket.io/?transport=polling` instead of a single WebSocket connection upgrade.

### Pitfall 5: Docker Compose Service Name Resolution
**What goes wrong:** Backend cannot connect to Redis. Frontend tries to connect WebSocket to `localhost` inside container, which resolves to the container itself, not the backend.
**Why it happens:** Using `localhost` instead of Docker Compose service names. Each container has its own network namespace.
**How to avoid:** Backend Redis URL: `redis://redis:6379` (service name `redis`). nginx upstream: `server backend:4010` (service name `backend`). Frontend browser connects via the HOST IP through nginx, not directly to backend container.
**Warning signs:** ECONNREFUSED errors in backend logs. Browser console showing WebSocket connection refused.

### Pitfall 6: NWS API Requires User-Agent Header
**What goes wrong:** NWS API returns 403 Forbidden on all requests.
**Why it happens:** NWS requires a User-Agent header identifying the application and a contact email. Requests without this header are blocked.
**How to avoid:** Set `User-Agent: '(GeospatialDashboard, admin@localhost)'` header on all NWS requests. Also set `Accept: 'application/geo+json'` to get GeoJSON format.
**Warning signs:** HTTP 403 responses from api.weather.gov in backend logs.

### Pitfall 7: NWS Weather Alerts Without Geometry
**What goes wrong:** Code crashes trying to render polygons for alerts that have `geometry: null`.
**Why it happens:** Many NWS alerts are county-based and do NOT include polygon geometry. Only certain alert types (tornado warnings, severe thunderstorm warnings) have polygon coordinates.
**How to avoid:** Filter features before rendering: `data.features.filter(f => f.geometry !== null)`. Typically 30-50% of active alerts lack geometry.
**Warning signs:** TypeError accessing `coordinates` of null geometry. GeoJsonDataSource throwing parse errors.

### Pitfall 8: Entity API Memory Leak on 60-Second Earthquake Updates
**What goes wrong:** Browser memory grows 50-100 MB per hour when earthquake data refreshes every 60 seconds using the Entity API.
**Why it happens:** Entity add/remove leaks memory in CesiumJS's internal AssociativeArray. The leak is cumulative and never garbage collected.
**How to avoid:** Use PointPrimitiveCollection for earthquakes. Call `points.removeAll()` then re-add on each data update. PointPrimitiveCollection does not have the Entity API memory leak.
**Warning signs:** Chrome Task Manager showing tab memory growing steadily without plateau.

## Code Examples

### USGS Earthquake GeoJSON Feed Response

The USGS feed at `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` returns a standard GeoJSON FeatureCollection:

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "generated": 1710000000000,
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "title": "USGS All Earthquakes, Past Day",
    "status": 200,
    "api": "1.10.3",
    "count": 245
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "mag": 4.2,
        "place": "5 km NE of Coalinga, CA",
        "time": 1710000000000,
        "updated": 1710000060000,
        "url": "https://earthquake.usgs.gov/earthquakes/eventpage/ci40000001",
        "title": "M 4.2 - 5km NE of Coalinga, CA",
        "type": "earthquake",
        "felt": null,
        "cdi": null,
        "mmi": null,
        "alert": null,
        "status": "automatic",
        "tsunami": 0,
        "sig": 271,
        "magType": "ml"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [-120.3, 36.2, 10.5]
      },
      "id": "ci40000001"
    }
  ]
}
```

**Key facts for normalization:**
- Coordinates: `[longitude, latitude, depth_km]` (GeoJSON standard: lon first)
- `time` and `updated`: Unix epoch **milliseconds** (divide by 1000 for seconds)
- `mag`: Richter magnitude (float, can be negative for micro-quakes)
- `id`: Stable event identifier (use as entity ID for click lookups)
- No authentication required, no rate limiting
- Feed updates every 60 seconds server-side
- `all_day.geojson` contains ~150-400 events typically

### NWS Weather Alerts Response

The NWS API at `https://api.weather.gov/alerts/active` returns GeoJSON:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "https://api.weather.gov/alerts/NWS-IDP-PROD-12345",
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-95.0, 30.0], [-95.0, 31.0], [-94.0, 31.0], [-94.0, 30.0], [-95.0, 30.0]]]
      },
      "properties": {
        "id": "NWS-IDP-PROD-12345",
        "areaDesc": "Harris County, TX",
        "severity": "Severe",
        "certainty": "Likely",
        "urgency": "Immediate",
        "event": "Tornado Warning",
        "headline": "Tornado Warning issued March 10 at 2:00PM CDT",
        "description": "A severe thunderstorm capable of producing a tornado...",
        "instruction": "Take shelter now...",
        "effective": "2026-03-10T14:00:00-05:00",
        "expires": "2026-03-10T15:00:00-05:00",
        "onset": "2026-03-10T14:00:00-05:00",
        "ends": "2026-03-10T15:00:00-05:00",
        "sent": "2026-03-10T14:00:00-05:00"
      }
    },
    {
      "id": "https://api.weather.gov/alerts/NWS-IDP-PROD-67890",
      "type": "Feature",
      "geometry": null,
      "properties": {
        "severity": "Moderate",
        "event": "Heat Advisory",
        "areaDesc": "Maricopa County, AZ",
        "headline": "..."
      }
    }
  ],
  "title": "Current watches, warnings, and advisories",
  "updated": "2026-03-10T19:00:00+00:00"
}
```

**Key facts for normalization:**
- `geometry` is `null` for many alerts (county-based alerts without polygons) -- MUST filter before rendering
- Severity values: "Extreme", "Severe", "Moderate", "Minor", "Unknown"
- Requires `User-Agent` header (or 403 Forbidden)
- Requires `Accept: application/geo+json` header for GeoJSON format
- No API key needed
- Generous rate limits (100+ req/minute)
- Timestamps are ISO 8601 with timezone info (must convert to UTC epoch)
- Polygon coordinates follow GeoJSON spec: `[[[lon, lat], [lon, lat], ...]]`

### Unified GeoJSON Type (Shared Frontend/Backend)

```typescript
// types/geojson.ts -- identical copy in frontend/src/types/ and backend/src/types/
export interface LayerFeatureProperties {
  id: string;                    // Unique within layer (event ID, etc.)
  layer: string;                 // Source layer ID ('earthquakes', 'weather')
  label: string | null;          // Display name ('M4.2', 'Tornado Warning')
  timestamp: number;             // Unix epoch seconds (normalized)
  category: string | null;       // Sub-type for icon selection
  severity: number | null;       // 0-1 normalized for universal color scaling
  [key: string]: unknown;        // Layer-specific extended properties
}

export interface LayerFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][] | number[][][][];
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

### Source Configuration

```typescript
// backend/src/config/sources.ts
export interface SourceConfig {
  sourceId: string;
  displayName: string;
  interval: string;     // node-cron expression
  cacheTTL: number;     // seconds
  enabled: boolean;
}

export const sourceConfigs: SourceConfig[] = [
  {
    sourceId: 'earthquakes',
    displayName: 'USGS Earthquakes',
    interval: '*/60 * * * * *',  // every 60 seconds
    cacheTTL: 55,                // expire slightly before next poll
    enabled: true,
  },
  {
    sourceId: 'weather',
    displayName: 'NWS Weather Alerts',
    interval: '*/120 * * * * *', // every 2 minutes
    cacheTTL: 110,               // expire slightly before next poll
    enabled: true,
  },
];
```

### Docker Compose Configuration

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7.2-alpine
    container_name: geospatial-redis
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --save ""
    restart: unless-stopped
    networks:
      - geospatial
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  backend:
    build: ./backend
    container_name: geospatial-backend
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=4010
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - geospatial

  nginx:
    build:
      context: .
      dockerfile: nginx/Dockerfile
      args:
        - VITE_CESIUM_ION_TOKEN=${CESIUM_ION_TOKEN}
    container_name: geospatial-nginx
    restart: unless-stopped
    ports:
      - "3010:80"
    depends_on:
      - backend
    networks:
      - geospatial

networks:
  geospatial:
    driver: bridge
```

**Key design decisions:**
- No separate frontend container -- nginx serves the built static files directly via multi-stage build
- Multi-stage Dockerfile in nginx/: Stage 1 builds frontend with Vite, Stage 2 copies dist to nginx
- `CESIUM_ION_TOKEN` passed as build arg for Vite to inline via `import.meta.env.VITE_CESIUM_ION_TOKEN`
- Redis command: `--maxmemory 256mb --maxmemory-policy allkeys-lru --save ""` (cache-only, no persistence)
- Redis has no volumes needed (pure cache, re-fetched on restart)
- Backend port 4010 (per DEPL-03 requirement, avoids conflict with Jarvis backend at 4000)

### nginx Multi-Stage Dockerfile

```dockerfile
# nginx/Dockerfile
# Stage 1: Build frontend with Vite
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_CESIUM_ION_TOKEN
ENV VITE_CESIUM_ION_TOKEN=${VITE_CESIUM_ION_TOKEN}
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 4010
CMD ["node", "dist/index.js"]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createWorldTerrain()` / `createWorldTerrainAsync()` | `Terrain.fromWorldTerrain()` | CesiumJS 1.104 (deprecated) / 1.107 (removed) | Must use new API or get runtime error |
| `vite-plugin-cesium` | `vite-plugin-static-copy` | Author abandoned ~2024 | Must switch; plugin will not receive updates |
| ioredis | node-redis v5 (npm: redis) | Redis official recommendation since 2024 | Better TypeScript support, promise-based, official client |
| `fastify-socket.io` plugin | Manual `new Server(fastify.server)` | fastify-socket.io only supports Fastify 4 | 3-line manual attach vs broken plugin |
| Entity API for dynamic markers | PointPrimitiveCollection / BillboardCollection | CesiumJS memory leak documented ~2020+ | Prevents memory leaks on dynamic updates |
| Fastify 4 | Fastify 5 | Released 2024 | Breaking changes in plugin API, TypeScript types |

**Items deprecated/outdated in existing codebase:**
- `createWorldTerrainAsync()` in Globe.tsx: Replace with `Terrain.fromWorldTerrain()`
- `vite-plugin-cesium ^1.2.22` in frontend package.json: Replace with `vite-plugin-static-copy`
- `fastify ^4.26.2` in backend package.json: Upgrade to `fastify ^5.8.0`
- `ioredis ^5.4.1` in backend package.json: Replace with `redis ^5.11.0` (node-redis)
- `@fastify/websocket` and `ws` in backend: Replace with `socket.io ^4.8.3`

## Open Questions

1. **Cesium Ion Token Quota**
   - What we know: Free Community tier gives 5GB storage + 15GB/month streaming. Registration at https://cesium.com/ion/
   - What's unclear: Whether a 24/7 dashboard running on one browser approaches the 15GB/month streaming limit
   - Recommendation: Register for token immediately. Monitor usage in the first week via the Ion dashboard. If approaching limits, consider using OpenStreetMap imagery as fallback basemap for non-critical viewing.

2. **Backend Port: 4000 vs 4010**
   - What we know: Existing code uses port 4000. DEPL-03 specifies port 4010. Jarvis backend on Home node already uses port 4000.
   - What's unclear: The dashboard deploys to the management VM (192.168.1.65), not Home node -- so port 4000 would not actually conflict.
   - Recommendation: Use port 4010 per DEPL-03. Avoids confusion with Jarvis backend even though they are on different nodes. The internal port is only visible within the Docker network anyway.

3. **StrictMode Removal Scope**
   - What we know: React StrictMode double-invokes effects, which causes Resium to create two Viewer instances in dev mode.
   - What's unclear: Whether to remove StrictMode entirely or wrap only the Viewer subtree in a non-StrictMode boundary.
   - Recommendation: Remove StrictMode entirely from main.tsx. The dashboard is a real-time visualization app where double-invocation of effects causes real bugs, not just development warnings.

## Sources

### Primary (HIGH confidence)
- [CesiumGS/cesium-vite-example](https://github.com/CesiumGS/cesium-vite-example) - Official Vite configuration for CesiumJS with viteStaticCopy
- [Cesium Blog: Configuring Vite for CesiumJS](https://cesium.com/blog/2024/02/13/configuring-vite-or-webpack-for-cesiumjs/) - Official blog post confirming viteStaticCopy approach
- [USGS GeoJSON Summary Format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) - Official USGS earthquake feed documentation
- [NWS API Web Service](https://www.weather.gov/documentation/services-web-api) - Official NWS API documentation
- [Socket.IO Server Initialization](https://socket.io/docs/v4/server-initialization/) - Manual attach to http.Server pattern
- [Socket.IO Reverse Proxy Guide](https://socket.io/docs/v3/reverse-proxy/) - nginx WebSocket proxy configuration
- [nginx WebSocket Proxying](https://nginx.org/en/docs/http/websocket.html) - Official nginx WebSocket proxy documentation
- [Redis Node.js Guide](https://redis.io/docs/latest/develop/clients/nodejs/) - Official node-redis v5 documentation
- [node-redis GitHub](https://github.com/redis/node-redis) - Official Redis Node.js client

### Secondary (MEDIUM confidence)
- [Resium Installation Guide](https://resium.reearth.io/installation) - Viewer setup and compatibility matrix
- [Resium Guide: Read-only props](https://resium.reearth.io/guide) - Memoization requirements for CesiumJS objects
- [NWS API CORS Discussion](https://github.com/weather-gov/api/discussions/312) - Confirms User-Agent requirement
- [CesiumJS GitHub #8837: Memory leak](https://github.com/CesiumGS/cesium/issues/8837) - Entity API memory leak documentation

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all versions verified via npm registry metadata and official docs
- Architecture: HIGH - patterns validated against CesiumJS docs, Socket.IO docs, and project's own architecture research
- Pitfalls: HIGH - documented in CesiumJS GitHub issues, community forums, and project PITFALLS.md
- Existing code audit: HIGH - all source files directly read and analyzed
- API response formats: HIGH - USGS and NWS are US government APIs with stable, documented formats

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable ecosystem, 30-day validity)
