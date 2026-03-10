# AGENTS.md — Geospatial Dashboard Build Guide

## Project Structure
```
geospatial-dashboard/
├── docker-compose.yml          # Orchestrates all services
├── .env                        # API keys and config (gitignored)
├── frontend/                   # React + CesiumJS + Vite
│   ├── src/
│   │   ├── App.tsx             # Main app with CesiumJS viewer
│   │   ├── components/         # UI components (Globe, SearchBar, ControlPanel, etc)
│   │   ├── layers/             # Data layer renderers (EarthquakeLayer, FlightLayer, etc)
│   │   ├── hooks/              # useWebSocket, useLayerData
│   │   ├── shaders/            # GLSL: nightvision, thermal, crt
│   │   └── utils/              # Supercluster, formatting
│   └── Dockerfile
├── backend/                    # Fastify + TypeScript
│   ├── src/
│   │   ├── index.ts            # Server entry
│   │   ├── websocket.ts        # WebSocket manager
│   │   ├── redis.ts            # Cache helpers
│   │   ├── fetchers/           # One per data source
│   │   └── routes/             # REST endpoints
│   └── Dockerfile
├── nginx/                      # Reverse proxy (port 3010)
└── .planning/                  # Roadmap, requirements, research
```

## API Sources (All Free)
1. USGS Earthquakes: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson (no auth)
2. NWS Weather: https://api.weather.gov/alerts/active (User-Agent required)
3. OpenSky Flights: https://opensky-network.org/api/states/all (OAuth2 after Mar 18)
4. DeFlock ALPR: Static GeoJSON from deflock.me (download once)
5. OSM Speed Cameras: Overpass API (no auth)
6. CelesTrak Satellites: TLE files (no auth)
7. Socrata Crime: City open data (no auth for basic)
8. NASA FIRMS: https://firms.modaps.eosdis.nasa.gov (free API key)
9. OpenAQ: https://api.openaq.org/v3 (free API key)

## Build Phases
- Phase 1: Globe + Earthquakes + Weather → docker compose up on port 3010
- Phase 2: Flights + ALPR + Speed Cameras + Satellites + Layer UI
- Phase 3: Crime + Fire/EMS + Scanner Audio + Traffic + Time filtering
- Phase 4: GLSL shaders (night vision/thermal/CRT) + Wildfires + Air Quality + Military

## Deploy
- Host: 192.168.1.50 (Home node)
- Port: 3010
- GitHub: github.com/amazing2000zame-hub/geospatial-command-dashboard
- Commit after each phase completion
