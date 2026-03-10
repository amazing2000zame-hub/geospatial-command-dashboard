import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { EnvConfig } from './config/env.js';
import { CacheService } from './services/cache.js';
import { setupWebSocket, type WebSocketResult } from './services/websocket.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerLayerRoutes } from './routes/layers.js';
import type { Namespace } from 'socket.io';

export interface ServerResult {
  fastify: ReturnType<typeof Fastify>;
  io: WebSocketResult['io'];
  cache: CacheService;
  layerNs: Namespace;
}

export async function createServer(config: EnvConfig): Promise<ServerResult> {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: '*' });

  // Create and connect Redis cache
  const cache = new CacheService(config.REDIS_URL);
  await cache.connect();

  // Register REST routes
  registerHealthRoutes(fastify, cache);
  registerLayerRoutes(fastify, cache);

  // Start listening BEFORE attaching Socket.IO
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`[server] Fastify listening on port ${config.PORT}`);

  // Attach Socket.IO AFTER Fastify is listening (requires http.Server)
  const httpServer = fastify.server;
  const { io, layerNs } = setupWebSocket(httpServer, cache);

  return { fastify, io, cache, layerNs };
}
