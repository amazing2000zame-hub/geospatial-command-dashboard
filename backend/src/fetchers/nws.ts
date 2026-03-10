import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// NWS raw response types
interface NWSFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  } | null;
  properties: {
    id: string;
    event: string;
    sent: string;
    effective: string;
    expires: string;
    severity: string; // Extreme, Severe, Moderate, Minor, Unknown
    urgency: string;
    certainty: string;
    areaDesc: string;
    headline: string | null;
    description: string | null;
    instruction: string | null;
    [key: string]: unknown;
  };
}

interface NWSResponse {
  type: 'FeatureCollection';
  features: NWSFeature[];
}

const NWS_URL = 'https://api.weather.gov/alerts/active';

// Map NWS severity strings to normalized 0-1 values
const SEVERITY_MAP: Record<string, number> = {
  extreme: 1.0,
  severe: 0.75,
  moderate: 0.5,
  minor: 0.25,
  unknown: 0.1,
};

export class NWSFetcher extends BaseFetcher {
  readonly sourceId = 'weather';
  readonly displayName = 'NWS Weather Alerts';
  readonly defaultInterval = '*/120 * * * * *';
  readonly cacheTTL = 110;

  private userAgent: string;

  constructor(
    cache: ConstructorParameters<typeof BaseFetcher>[0],
    io: ConstructorParameters<typeof BaseFetcher>[1],
    userAgent?: string,
  ) {
    super(cache, io);
    this.userAgent = userAgent || 'GeospatialDashboard/1.0 (homelab@localhost)';
  }

  async fetchRaw(): Promise<NWSResponse> {
    // NWS API REQUIRES User-Agent header -- returns 403 without it
    const response = await fetch(NWS_URL, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/geo+json',
      },
    });
    if (!response.ok) {
      throw new Error(
        `NWS API returned ${response.status}: ${response.statusText}`,
      );
    }
    return (await response.json()) as NWSResponse;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as NWSResponse;
    const now = Date.now();

    // CRITICAL: Filter out features with null geometry
    // Many NWS alerts are county-based without polygon geometry (~30-50% of alerts)
    const features: LayerFeature[] = data.features
      .filter(
        (f): f is NWSFeature & { geometry: NonNullable<NWSFeature['geometry']> } =>
          f.geometry !== null && f.geometry !== undefined,
      )
      .map((f) => {
        const severityStr = (f.properties.severity || 'unknown').toLowerCase();
        const severity = SEVERITY_MAP[severityStr] ?? 0.1;

        let timestamp: number;
        try {
          timestamp = Math.floor(new Date(f.properties.sent).getTime() / 1000);
        } catch {
          timestamp = Math.floor(now / 1000);
        }

        return {
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: {
            id: f.properties.id,
            layer: 'weather',
            label: f.properties.event,
            timestamp,
            category: f.properties.event,
            severity,
            // Preserved original properties
            areaDesc: f.properties.areaDesc,
            headline: f.properties.headline,
            description: f.properties.description,
            instruction: f.properties.instruction,
            effective: f.properties.effective,
            expires: f.properties.expires,
            urgency: f.properties.urgency,
            certainty: f.properties.certainty,
          },
        };
      });

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'nws',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 120_000,
      },
    };
  }
}
