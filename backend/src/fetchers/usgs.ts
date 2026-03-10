import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// USGS raw response types
interface USGSFeature {
  id: string;
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  properties: {
    mag: number | null;
    place: string | null;
    time: number; // milliseconds
    url: string;
    title: string;
    type: string;
    [key: string]: unknown;
  };
}

interface USGSResponse {
  type: 'FeatureCollection';
  features: USGSFeature[];
  metadata: {
    generated: number;
    url: string;
    title: string;
    count: number;
  };
}

const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

export class USGSFetcher extends BaseFetcher {
  readonly sourceId = 'earthquakes';
  readonly displayName = 'USGS Earthquakes';
  readonly defaultInterval = '*/60 * * * * *';
  readonly cacheTTL = 55;

  async fetchRaw(): Promise<USGSResponse> {
    const response = await fetch(USGS_URL);
    if (!response.ok) {
      throw new Error(
        `USGS API returned ${response.status}: ${response.statusText}`,
      );
    }
    return (await response.json()) as USGSResponse;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as USGSResponse;
    const now = Date.now();

    const features: LayerFeature[] = data.features.map((f) => {
      const mag = f.properties.mag ?? 0;
      const depth = f.geometry.coordinates[2] ?? 0;

      return {
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          id: f.id,
          layer: 'earthquakes',
          label: `M${mag.toFixed(1)}`,
          timestamp: Math.floor(f.properties.time / 1000),
          category: f.properties.type || 'earthquake',
          severity: Math.max(0, Math.min(1, mag / 10)),
          // Preserved original properties
          mag,
          place: f.properties.place,
          url: f.properties.url,
          title: f.properties.title,
          depth,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'usgs',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 60_000,
      },
    };
  }
}
