import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// 511 NY API response type
interface NY511Camera {
  Latitude: number;
  Longitude: number;
  ID: string;
  Name: string;
  DirectionOfTravel: string;
  RoadwayName: string;
  Url: string;
  VideoUrl: string | null;
  Disabled: boolean;
  Blocked: boolean;
}

interface TrafficCamRaw {
  ny: NY511Camera[];
}

const NY511_URL = 'https://511ny.org/api/getcameras?format=json&key=public';
const FETCH_TIMEOUT_MS = 20_000;

export class TrafficCamFetcher extends BaseFetcher {
  readonly sourceId = 'traffic_cameras';
  readonly displayName = 'Traffic Cameras (DOT)';
  readonly defaultInterval = '0 */5 * * * *'; // every 5 minutes
  readonly cacheTTL = 300; // 5 minutes

  async fetchRaw(): Promise<TrafficCamRaw> {
    const ny = await this.fetchNY511();
    return { ny };
  }

  private async fetchNY511(): Promise<NY511Camera[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(NY511_URL, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GeospatialDashboard/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`511 NY returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as NY511Camera[];
      if (!Array.isArray(data)) {
        throw new Error('511 NY returned non-array response');
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as TrafficCamRaw;
    const now = Date.now();

    const features: LayerFeature[] = [];

    for (const cam of data.ny) {
      // Skip disabled/blocked cameras
      if (cam.Disabled || cam.Blocked) continue;
      // Skip cameras without coordinates
      if (!cam.Latitude || !cam.Longitude) continue;

      const imageUrl = cam.VideoUrl || null;
      const streamUrl = cam.VideoUrl || null;

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [cam.Longitude, cam.Latitude],
        },
        properties: {
          id: `traffic_cam_${cam.ID}`,
          layer: 'traffic_cameras',
          label: cam.Name || `Traffic Camera ${cam.ID}`,
          timestamp: Math.floor(now / 1000),
          category: 'traffic_camera',
          severity: null,
          imageUrl,
          streamUrl,
          direction: cam.DirectionOfTravel || null,
          route: cam.RoadwayName || null,
          county: null,
          pageUrl: cam.Url || null,
          source: '511ny',
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'traffic_cameras',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 300_000,
      },
    };
  }
}
