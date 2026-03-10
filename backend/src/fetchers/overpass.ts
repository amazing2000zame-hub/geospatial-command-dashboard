import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// Overpass API raw response types
interface OverpassElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

const PRIMARY_URL = 'https://overpass-api.de/api/interpreter';
const MIRROR_URL = 'https://lz4.overpass-api.de/api/interpreter';

// Query US + Europe speed cameras with bbox to avoid timeout on global query
const OVERPASS_QUERY =
  '[out:json][timeout:180];(' +
  'node["highway"="speed_camera"](24.0,-125.0,50.0,-66.0);' + // US
  'node["highway"="speed_camera"](35.0,-11.0,72.0,45.0);' +   // Europe
  ');out body;';

export class OverpassSpeedCameraFetcher extends BaseFetcher {
  readonly sourceId = 'speed_cameras';
  readonly displayName = 'Speed Cameras (Overpass)';
  readonly defaultInterval = '0 0 */6 * * *';
  readonly cacheTTL = 21600; // 6 hours

  async fetchRaw(): Promise<OverpassResponse> {
    // Try primary endpoint first, fall back to mirror
    try {
      return await this.queryOverpass(PRIMARY_URL);
    } catch (primaryErr) {
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn(
        `[${this.sourceId}] Primary Overpass failed: ${primaryMsg}, trying mirror...`,
      );
      return await this.queryOverpass(MIRROR_URL);
    }
  }

  private async queryOverpass(url: string): Promise<OverpassResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    });

    if (!response.ok) {
      throw new Error(
        `Overpass API returned ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as OverpassResponse;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as OverpassResponse;
    const now = Date.now();

    const features: LayerFeature[] = data.elements
      .filter((el) => el.type === 'node' && el.lat != null && el.lon != null)
      .map((el) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [el.lon, el.lat],
        },
        properties: {
          id: `speed_camera_${el.id}`,
          layer: 'speed_cameras',
          label: el.tags?.maxspeed
            ? `Speed Camera (${el.tags.maxspeed})`
            : 'Speed Camera',
          timestamp: Math.floor(now / 1000),
          category: 'speed_camera',
          severity: null,
          // Original tags
          maxspeed: el.tags?.maxspeed ?? null,
          direction: el.tags?.direction ?? null,
          ref: el.tags?.ref ?? null,
          osmId: el.id,
        },
      }));

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'overpass',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 21_600_000, // 6 hours
      },
    };
  }
}
