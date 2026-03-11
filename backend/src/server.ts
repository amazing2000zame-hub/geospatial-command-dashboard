import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { EnvConfig } from './config/env.js';
import { CacheService } from './services/cache.js';
import { setupWebSocket, type WebSocketResult } from './services/websocket.js';
import { AlertRulesEngine } from './services/alert-rules.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerLayerRoutes } from './routes/layers.js';
import { registerAlertRoutes } from './routes/alerts.js';
import type { Namespace } from 'socket.io';

export interface ServerResult {
  fastify: ReturnType<typeof Fastify>;
  io: WebSocketResult['io'];
  cache: CacheService;
  layerNs: Namespace;
  alertEngine: AlertRulesEngine;
}

export async function createServer(config: EnvConfig): Promise<ServerResult> {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: '*' });

  // Create and connect Redis cache
  const cache = new CacheService(config.REDIS_URL);
  await cache.connect();

  // Initialize alert rules engine (needs cache, will get IO namespace later)
  // Register ALL routes BEFORE listen
  registerHealthRoutes(fastify, cache);
  registerLayerRoutes(fastify, cache);

  // Create a placeholder for alert engine - routes registered before listen
  let alertEngine: AlertRulesEngine;
  // We need layerNs for AlertRulesEngine, but that requires httpServer.
  // Register alert routes with a lazy getter pattern.
  const alertEngineProxy = {
    getRules: () => alertEngine.getRules(),
    addRule: (r: Parameters<AlertRulesEngine['addRule']>[0]) => alertEngine.addRule(r),
    updateRule: (id: string, u: Parameters<AlertRulesEngine['updateRule']>[1]) => alertEngine.updateRule(id, u),
    deleteRule: (id: string) => alertEngine.deleteRule(id),
    getRecentAlerts: (l?: number) => alertEngine.getRecentAlerts(l),
    evaluate: (lid: string, d: Parameters<AlertRulesEngine['evaluate']>[1]) => alertEngine.evaluate(lid, d),
  } as AlertRulesEngine;
  registerAlertRoutes(fastify, alertEngineProxy);

  // Start listening BEFORE attaching Socket.IO
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  console.log(`[server] Fastify listening on port ${config.PORT}`);

  // Attach Socket.IO AFTER Fastify is listening (requires http.Server)
  const httpServer = fastify.server;
  const { io, layerNs } = setupWebSocket(httpServer, cache);

  // Now initialize the real alert engine with layerNs
  alertEngine = new AlertRulesEngine(cache, layerNs);
  console.log('[server] Alert rules engine initialized');

  return { fastify, io, cache, layerNs, alertEngine };
}
