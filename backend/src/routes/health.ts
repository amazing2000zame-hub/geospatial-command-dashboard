import type { FastifyInstance } from 'fastify';
import type { CacheService } from '../services/cache.js';

export function registerHealthRoutes(
  fastify: FastifyInstance,
  cache: CacheService,
): void {
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: Date.now(),
      redis: cache.isConnected(),
      uptime: process.uptime(),
    };
  });
}
