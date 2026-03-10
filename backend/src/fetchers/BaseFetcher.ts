import type { Namespace } from 'socket.io';
import type { CacheService } from '../services/cache.js';
import type { LayerFeatureCollection } from '../types/geojson.js';

export abstract class BaseFetcher {
  abstract readonly sourceId: string;
  abstract readonly displayName: string;
  abstract readonly defaultInterval: string;
  abstract readonly cacheTTL: number;

  protected cache: CacheService;
  protected io: Namespace;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  /**
   * Fetch raw data from the external API.
   */
  abstract fetchRaw(): Promise<unknown>;

  /**
   * Normalize raw API response into unified GeoJSON FeatureCollection.
   */
  abstract normalize(raw: unknown): LayerFeatureCollection;

  /**
   * Execute the full fetch-normalize-cache-emit pipeline.
   * Errors are caught and logged -- never rethrown to isolate fetcher failures.
   */
  async execute(): Promise<void> {
    try {
      // Fetch raw data from the API
      console.log(`[${this.sourceId}] Fetching data...`);
      const raw = await this.fetchRaw();

      // Normalize to unified GeoJSON
      const normalized = this.normalize(raw);
      console.log(
        `[${this.sourceId}] Normalized ${normalized.features.length} features`,
      );

      // Cache in Redis with TTL
      await this.cache.set(this.sourceId, normalized, this.cacheTTL);

      // Broadcast to subscribed Socket.IO clients
      this.io.to(`layer:${this.sourceId}`).emit('data', {
        layerId: this.sourceId,
        data: normalized,
        timestamp: Date.now(),
      });

      // Emit status update to ALL clients in namespace
      this.io.emit('status', {
        layerId: this.sourceId,
        status: 'active',
        count: normalized.features.length,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${this.sourceId}] Fetch failed:`, message);

      // Cache the error state
      try {
        await this.cache.setError(this.sourceId, message);
      } catch (cacheErr) {
        console.error(`[${this.sourceId}] Failed to cache error:`, cacheErr);
      }

      // Emit error status to all clients
      this.io.emit('status', {
        layerId: this.sourceId,
        status: 'error',
        error: message,
        timestamp: Date.now(),
      });

      // DO NOT rethrow -- other fetchers must continue running
    }
  }
}
