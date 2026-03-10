# Real-Time 3D Geospatial Command Dashboard

A self-hosted real-time 3D geospatial visualization platform built with CesiumJS, React, and Fastify.

## Features (Phase 1)

- **3D Globe Visualization** - CesiumJS with terrain, satellite imagery, day/night cycle
- **Real-Time Data Feeds**
  - USGS earthquake data (60s polling)
  - NWS weather alerts (5min polling)
- **Interactive Elements**
  - Search bar for cities and coordinates
  - Live coordinate display on mouse movement
  - Clickable markers with detailed popups
- **WebSocket Updates** - Real-time data push to connected clients
- **Redis Caching** - Rate limit management for external APIs
- **Single-Port Deployment** - nginx reverse proxy on port 3010

## Tech Stack

- **Frontend:** React 19 + CesiumJS/Resium + Vite
- **Backend:** Fastify + TypeScript + WebSocket
- **Cache:** Redis 7
- **Proxy:** nginx
- **Deploy:** Docker Compose

## Quick Start

### Prerequisites
- Docker & Docker Compose
- 2GB+ RAM available
- Port 3010 open

### Deploy

```bash
# Clone or navigate to project
cd /root/geospatial-dashboard

# Build and start all services
docker compose up -d

# Check logs
docker compose logs -f

# Verify deployment
curl -I http://192.168.1.50:3010
```

### Access

- **Dashboard:** http://192.168.1.50:3010
- **Backend Health:** http://192.168.1.50:3010/api/health
- **WebSocket:** ws://192.168.1.50:3010/ws

## Architecture

```
nginx (port 3010)
  ├── / → frontend (React + CesiumJS)
  ├── /api/ → backend (Fastify REST)
  └── /ws → backend (WebSocket)
        └── Redis (cache)
```

## Data Sources

1. **USGS Earthquakes**
   - URL: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
   - Update: Every 60 seconds
   - Display: Color-coded markers by magnitude

2. **NWS Weather Alerts**
   - URL: https://api.weather.gov/alerts/active
   - Update: Every 5 minutes
   - Display: Polygon overlays by severity

## Development

### Backend
```bash
cd backend
npm install
npm run dev  # Runs on port 4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev  # Runs on port 5173
```

## Management

```bash
# Stop all services
docker compose down

# Rebuild and restart
docker compose up -d --build

# View logs
docker compose logs -f [service]

# Check service health
docker compose ps
```

## Troubleshooting

### Services won't start
```bash
# Check container logs
docker compose logs backend
docker compose logs frontend
docker compose logs nginx

# Verify Redis
docker compose exec redis redis-cli ping
```

### WebSocket not connecting
- Check browser console for errors
- Verify backend is healthy: `curl http://192.168.1.50:3010/api/health`
- Check nginx logs: `docker compose logs nginx`

### No data appearing
- Backend logs should show "Earthquake update" and "Weather update" messages
- Check Redis cache: `docker compose exec redis redis-cli KEYS '*'`
- Verify external APIs are accessible

## Future Phases

- Phase 2: Flight tracking (ADS-B), ISS position, satellite tracking
- Phase 3: Marine traffic, hurricane tracking, wildfire data
- Phase 4: User accounts, saved views, custom data layers

## License

MIT
