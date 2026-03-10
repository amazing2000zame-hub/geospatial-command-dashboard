import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';
import { earthquakeService } from './services/earthquakes.js';
import { weatherService } from './services/weather.js';
import { broadcastToClients } from './websocket.js';

const app = Fastify({ logger: true });

// Redis connection
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

// Register plugins
await app.register(cors, { origin: true });
await app.register(websocket);

// Health check
app.get('/api/health', async () => {
  const redisStatus = redis.status === 'ready' ? 'connected' : 'disconnected';
  return { 
    status: 'ok', 
    redis: redisStatus,
    timestamp: new Date().toISOString()
  };
});

// WebSocket endpoint
app.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    console.log('WebSocket client connected');
    
    // Add to clients set
    const clients = (global as any).wsClients || new Set();
    clients.add(socket);
    (global as any).wsClients = clients;

    // Send initial data
    (async () => {
      try {
        const earthquakes = await earthquakeService.getEarthquakes();
        const weather = await weatherService.getAlerts();
        
        socket.send(JSON.stringify({
          type: 'initial',
          data: { earthquakes, weather }
        }));
      } catch (error) {
        console.error('Error sending initial data:', error);
      }
    })();

    socket.on('message', (message) => {
      console.log('Received:', message.toString());
    });

    socket.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(socket);
    });

    socket.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(socket);
    });
  });
});

// REST endpoints
app.get('/api/earthquakes', async () => {
  return await earthquakeService.getEarthquakes();
});

app.get('/api/weather', async () => {
  return await weatherService.getAlerts();
});

// Start polling services
earthquakeService.startPolling((data) => {
  broadcastToClients({ type: 'earthquakes', data });
});

weatherService.startPolling((data) => {
  broadcastToClients({ type: 'weather', data });
});

// Start server
const PORT = parseInt(process.env.PORT || '4000');
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Backend running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  earthquakeService.stopPolling();
  weatherService.stopPolling();
  await redis.quit();
  await app.close();
  process.exit(0);
});
