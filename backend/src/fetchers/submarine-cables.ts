import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// --- Raw submarine cable GeoJSON types ---

interface CableProperties {
  id: string;
  name: string;
  color: string;
  feature_id: string;
  coordinates?: [number, number]; // centroid
  [key: string]: unknown;
}

interface CableFeature {
  type: 'Feature';
  geometry: {
    type: 'MultiLineString';
    coordinates: number[][][];
  };
  properties: CableProperties;
}

interface CableGeoJSON {
  type: 'FeatureCollection';
  features: CableFeature[];
}

const CABLE_URL =
  'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';

export class SubmarineCableFetcher extends BaseFetcher {
  readonly sourceId = 'submarine_cables';
  readonly displayName = 'Submarine Cables';
  readonly defaultInterval = '0 0 0 * * *'; // once daily
  readonly cacheTTL = 86400; // 24 hours

  async fetchRaw(): Promise<CableGeoJSON> {
    const response = await fetch(CABLE_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `Submarine Cable API returned ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as CableGeoJSON;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const geojson = raw as CableGeoJSON;
    const now = Date.now();
    const features: LayerFeature[] = [];

    if (!geojson?.features || !Array.isArray(geojson.features)) {
      return {
        type: 'FeatureCollection',
        features: [],
        metadata: {
          source: 'submarinecablemap',
          fetchedAt: now,
          count: 0,
          nextUpdate: now + this.cacheTTL * 1000,
        },
      };
    }

    for (const cable of geojson.features) {
      if (!cable.geometry || cable.geometry.type !== 'MultiLineString') continue;
      if (!cable.properties?.feature_id) continue;

      const props = cable.properties;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'MultiLineString',
          coordinates: cable.geometry.coordinates,
        },
        properties: {
          id: `cable-${props.feature_id}`,
          layer: 'submarine_cables',
          label: props.name || 'Unknown Cable',
          timestamp: Math.floor(now / 1000),
          category: 'submarine_cable',
          severity: 0.1,
          cableName: props.name || 'Unknown Cable',
          cableColor: props.color || '#00ffff',
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'submarinecablemap',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }
}
