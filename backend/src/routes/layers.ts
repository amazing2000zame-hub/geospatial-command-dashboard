import type { FastifyInstance } from 'fastify';
import type { CacheService } from '../services/cache.js';
import { sourceConfigs } from '../config/sources.js';

export function registerLayerRoutes(
  fastify: FastifyInstance,
  cache: CacheService,
): void {
  // Get all available layers with their status
  fastify.get('/api/layers', async () => {
    const layers = await Promise.all(
      sourceConfigs.map(async (src) => {
        const status = await cache.getStatus(src.sourceId);
        return {
          id: src.sourceId,
          displayName: src.displayName,
          interval: src.interval,
          enabled: src.enabled,
          ...status,
        };
      }),
    );
    return { layers };
  });

  // Get layer data by ID
  fastify.get<{ Params: { layerId: string } }>(
    '/api/layers/:layerId',
    async (request, reply) => {
      const { layerId } = request.params;
      const data = await cache.get(layerId);

      if (!data) {
        return reply.status(404).send({
          error: 'Layer not found or not yet cached',
          layerId,
        });
      }

      return data;
    },
  );
}
