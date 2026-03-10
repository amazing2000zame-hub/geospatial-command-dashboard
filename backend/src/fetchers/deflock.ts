import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// Overpass API raw response types (shared shape with speed cameras)
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

// Query for ALPR/surveillance cameras tagged in OSM (DeFlock contributions)
const OVERPASS_QUERY =
  '[out:json][timeout:180];node["man_made"="surveillance"]["surveillance:type"="ALPR"];out body;';

export class DeflockALPRFetcher extends BaseFetcher {
  readonly sourceId = 'alpr';
  readonly displayName = 'ALPR Cameras (DeFlock/OSM)';
  readonly defaultInterval = '0 0 0 * * *'; // daily
  readonly cacheTTL = 86400; // 24 hours

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
          id: `alpr_${el.id}`,
          layer: 'alpr',
          label: 'ALPR Camera',
          timestamp: Math.floor(now / 1000),
          category: el.tags?.['surveillance:type'] ?? 'ALPR',
          severity: null,
          // Original tags
          operator: el.tags?.operator ?? null,
          network: el.tags?.network ?? null,
          description: el.tags?.description ?? null,
          osmId: el.id,
        },
      }));

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'deflock',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 86_400_000, // 24 hours
      },
    };
  }
}
