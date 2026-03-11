import type { CacheService } from './cache.js';
import type { LayerFeatureCollection } from '../types/geojson.js';

export interface SimplifiedFeature {
  id: string;
  coordinates: number[];
  label: string | null;
  timestamp: number;
  severity: number | null;
  category: string | null;
}

export interface HistorySnapshot {
  timestamp: number;
  count: number;
  features: SimplifiedFeature[];
}

/**
 * Stores simplified snapshots of layer data for historical playback.
 *
 * Storage strategy:
 *   Key:  history:{layerId}:{hourBucket}
 *   Value: JSON array of HistorySnapshot (one per fetch cycle within that hour)
 *   TTL:  86400 seconds (24 hours) — old data auto-expires
 *
 * hourBucket = Math.floor(timestamp / 3600000)
 *
 * Each snapshot keeps at most 500 features, stripped to essential fields
 * (id, coordinates, label, timestamp, severity, category) so memory
 * stays bounded.
 */
export class HistoryService {
  private cache: CacheService;
  private static readonly MAX_FEATURES_PER_SNAPSHOT = 500;
  private static readonly TTL_SECONDS = 86400; // 24 hours

  constructor(cache: CacheService) {
    this.cache = cache;
  }

  /**
   * Store a snapshot of layer data at current time.
   * Called after each fetcher normalize.
   *
   * Only essential fields are kept from each feature to conserve memory.
   * Features are capped at MAX_FEATURES_PER_SNAPSHOT per snapshot.
   */
  async storeSnapshot(
    layerId: string,
    data: LayerFeatureCollection,
  ): Promise<void> {
    const now = Date.now();
    const hourBucket = Math.floor(now / 3600000);
    const key = `history:${layerId}:${hourBucket}`;

    // Simplify features — keep only id, coordinates, label, timestamp, severity, category
    const simplified: SimplifiedFeature[] = data.features
      .slice(0, HistoryService.MAX_FEATURES_PER_SNAPSHOT)
      .map((f) => ({
        id: f.properties.id,
        coordinates:
          f.geometry.type === 'Point'
            ? (f.geometry.coordinates as number[])
            : // For non-point geometries, take the first coordinate pair
              Array.isArray(f.geometry.coordinates[0])
              ? (f.geometry.coordinates[0] as number[]).slice(0, 2)
              : (f.geometry.coordinates as number[]).slice(0, 2),
        label: f.properties.label,
        timestamp: f.properties.timestamp,
        severity: f.properties.severity,
        category: f.properties.category,
      }));

    const snapshot: HistorySnapshot = {
      timestamp: now,
      count: data.features.length,
      features: simplified,
    };

    // Load existing snapshots for this hour bucket (if any)
    const existing =
      (await this.cache.getRaw<HistorySnapshot[]>(key)) ?? [];

    existing.push(snapshot);

    // Store back with 24h TTL
    await this.cache.setRaw(key, existing, HistoryService.TTL_SECONDS);

    console.log(
      `[history] Stored snapshot for ${layerId}: ${snapshot.count} features (bucket ${hourBucket})`,
    );
  }

  /**
   * Get snapshots for a layer within a time range.
   * Returns array of { timestamp, count, features (simplified) }.
   *
   * Scans all hour buckets that overlap the requested range and filters
   * individual snapshots to those within [startTime, endTime].
   */
  async getSnapshots(
    layerId: string,
    startTime: number,
    endTime: number,
  ): Promise<HistorySnapshot[]> {
    const startBucket = Math.floor(startTime / 3600000);
    const endBucket = Math.floor(endTime / 3600000);

    const results: HistorySnapshot[] = [];

    for (let bucket = startBucket; bucket <= endBucket; bucket++) {
      const key = `history:${layerId}:${bucket}`;
      const snapshots =
        await this.cache.getRaw<HistorySnapshot[]>(key);

      if (!snapshots) continue;

      for (const snap of snapshots) {
        if (snap.timestamp >= startTime && snap.timestamp <= endTime) {
          results.push(snap);
        }
      }
    }

    // Sort ascending by timestamp
    results.sort((a, b) => a.timestamp - b.timestamp);

    return results;
  }

  /**
   * Clean up old snapshots (older than 24 hours).
   *
   * Since each hour-bucket key has a 24h TTL set on write, Redis handles
   * most of the expiration automatically. This method provides an explicit
   * sweep for any edge cases (e.g., keys written with stale TTLs).
   *
   * In practice, calling this is optional — Redis TTL does the heavy lifting.
   */
  async cleanup(): Promise<void> {
    // Redis TTL handles automatic expiration of old hour-bucket keys.
    // This method is provided as a hook for scheduled maintenance.
    // A full implementation would scan `history:*` keys via the raw Redis
    // client, but since setRaw already applies a 24h TTL on every write,
    // manual cleanup is rarely needed.
    console.log(
      '[history] Cleanup invoked — Redis TTL handles expiration automatically',
    );
  }
}
