import { createClient, type RedisClientType } from 'redis';
import type { LayerFeatureCollection } from '../types/geojson.js';

export class CacheService {
  private client: RedisClientType;
  private url: string;

  constructor(url: string) {
    this.url = url;
    this.client = createClient({ url }) as RedisClientType;
    this.client.on('error', (err) => {
      console.error('[cache] Redis error:', err.message);
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('[cache] Connected to Redis at', this.url);
  }

  async get(sourceId: string): Promise<LayerFeatureCollection | null> {
    const raw = await this.client.get(`geo:layer:${sourceId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LayerFeatureCollection;
  }

  async set(
    sourceId: string,
    data: LayerFeatureCollection,
    ttlSeconds: number,
  ): Promise<void> {
    const meta = {
      fetchedAt: Date.now(),
      count: data.features.length,
      status: 'active',
    };

    const pipeline = this.client.multi();
    pipeline.setEx(`geo:layer:${sourceId}`, ttlSeconds, JSON.stringify(data));
    pipeline.setEx(
      `geo:meta:${sourceId}`,
      ttlSeconds,
      JSON.stringify(meta),
    );
    pipeline.del(`geo:error:${sourceId}`);
    await pipeline.exec();
  }

  async setError(sourceId: string, error: string): Promise<void> {
    await this.client.setEx(`geo:error:${sourceId}`, 60, error);
  }

  async getStatus(
    sourceId: string,
  ): Promise<{ meta: Record<string, unknown> | null; error: string | null }> {
    const [metaRaw, errorRaw] = await Promise.all([
      this.client.get(`geo:meta:${sourceId}`),
      this.client.get(`geo:error:${sourceId}`),
    ]);

    return {
      meta: metaRaw ? (JSON.parse(metaRaw) as Record<string, unknown>) : null,
      error: errorRaw,
    };
  }

  /**
   * Store arbitrary JSON data under a raw key (no prefix).
   * Used for non-GeoJSON intel panel data.
   */
  async setRaw(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    await this.client.setEx(key, ttlSeconds, JSON.stringify(data));
  }

  /**
   * Retrieve arbitrary JSON data by raw key (no prefix).
   */
  async getRaw<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    console.log('[cache] Disconnected from Redis');
  }

  isConnected(): boolean {
    return this.client.isReady;
  }
}
