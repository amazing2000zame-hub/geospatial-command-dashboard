import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';
import { gunzipSync } from 'node:zlib';

/**
 * Finnish Digitraffic AIS Vessel Tracking Fetcher.
 * Fetches live vessel positions and metadata from the free Digitraffic
 * marine API (no API key needed). Merges position + metadata by MMSI.
 *
 * Positions: https://meri.digitraffic.fi/api/ais/v1/locations
 * Metadata:  https://meri.digitraffic.fi/api/ais/v1/vessels
 */

const LOCATIONS_URL = 'https://meri.digitraffic.fi/api/ais/v1/locations';
const VESSELS_URL = 'https://meri.digitraffic.fi/api/ais/v1/vessels';

const MAX_VESSELS = 2000;

/** AIS ship type code → human-readable category */
function classifyShipType(shipType: number): string {
  if (shipType === 30) return 'fishing';
  if (shipType === 35) return 'military';
  if (shipType >= 60 && shipType <= 69) return 'passenger';
  if (shipType >= 70 && shipType <= 79) return 'cargo';
  if (shipType >= 80 && shipType <= 89) return 'tanker';
  if (shipType >= 50 && shipType <= 59) return 'utility';
  if (shipType === 36 || shipType === 37) return 'pleasure';
  return 'other';
}

/** Map category → severity for UI theming */
function categorySeverity(category: string): number {
  switch (category) {
    case 'cargo':
    case 'tanker':
    case 'passenger':
      return 0.3;
    case 'military':
      return 0.6;
    case 'pleasure':
    case 'fishing':
      return 0.1;
    default:
      return 0.2;
  }
}

/** Digitraffic AIS location GeoJSON feature */
interface AISLocationFeature {
  mmsi: number;
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    mmsi: number;
    sog: number;
    cog: number;
    navStat: number;
    rot: number;
    posAcc: boolean;
    raim: boolean;
    heading: number;
    timestamp: number;
    timestampExternal: number;
  };
}

interface AISLocationsResponse {
  type: 'FeatureCollection';
  features: AISLocationFeature[];
}

/** Digitraffic AIS vessel metadata */
interface AISVesselMetadata {
  mmsi: number;
  name: string;
  shipType: number;
  destination: string;
  callSign: string;
  imo: number;
  draught: number;
  eta: number;
  posType: number;
  referencePointA: number;
  referencePointB: number;
  referencePointC: number;
  referencePointD: number;
  timestamp: number;
}

interface RawData {
  locations: AISLocationsResponse;
  vessels: AISVesselMetadata[];
}

export class VesselFetcher extends BaseFetcher {
  readonly sourceId = 'vessels';
  readonly displayName = 'Vessel Tracking (AIS)';
  readonly defaultInterval = '0 */3 * * * *'; // every 3 minutes
  readonly cacheTTL = 180; // 3 minutes

  async fetchRaw(): Promise<RawData> {
    const headers: Record<string, string> = {
      'Accept-Encoding': 'gzip',
      Accept: 'application/json',
    };

    const [locationsResult, vesselsResult] = await Promise.allSettled([
      fetch(LOCATIONS_URL, { headers }).then(async (res) => {
        if (!res.ok) {
          throw new Error(
            `Digitraffic locations API returned ${res.status}: ${res.statusText}`,
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        // Decompress if gzipped (response may be gzip even without content-encoding in some environments)
        let text: string;
        try {
          text = gunzipSync(buf).toString('utf-8');
        } catch {
          // Not gzipped, use raw buffer
          text = buf.toString('utf-8');
        }
        return JSON.parse(text) as AISLocationsResponse;
      }),
      fetch(VESSELS_URL, { headers }).then(async (res) => {
        if (!res.ok) {
          throw new Error(
            `Digitraffic vessels API returned ${res.status}: ${res.statusText}`,
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let text: string;
        try {
          text = gunzipSync(buf).toString('utf-8');
        } catch {
          text = buf.toString('utf-8');
        }
        return JSON.parse(text) as AISVesselMetadata[];
      }),
    ]);

    if (locationsResult.status === 'rejected') {
      throw new Error(
        `Failed to fetch vessel locations: ${locationsResult.reason}`,
      );
    }

    const locations = locationsResult.value;
    const vessels =
      vesselsResult.status === 'fulfilled' ? vesselsResult.value : [];

    if (vesselsResult.status === 'rejected') {
      console.warn(
        `[vessels] Metadata fetch failed (continuing with positions only): ${vesselsResult.reason}`,
      );
    }

    return { locations, vessels };
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const { locations, vessels } = raw as RawData;
    const now = Date.now();

    // Build MMSI → metadata lookup
    const metadataMap = new Map<number, AISVesselMetadata>();
    for (const v of vessels) {
      metadataMap.set(v.mmsi, v);
    }

    if (
      !locations?.features ||
      !Array.isArray(locations.features)
    ) {
      return {
        type: 'FeatureCollection',
        features: [],
        metadata: {
          source: 'digitraffic-ais',
          fetchedAt: now,
          count: 0,
          nextUpdate: now + 180_000,
        },
      };
    }

    // Prioritize moving vessels (SOG > 0), then fill up to MAX_VESSELS
    const moving: AISLocationFeature[] = [];
    const stationary: AISLocationFeature[] = [];

    for (const f of locations.features) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (lon == null || lat == null || isNaN(lon) || isNaN(lat)) continue;

      const sog = f.properties?.sog ?? 0;
      if (sog > 0) {
        moving.push(f);
      } else {
        stationary.push(f);
      }
    }

    // Take moving vessels first, then fill remaining slots with stationary
    const selected = moving.slice(0, MAX_VESSELS);
    const remaining = MAX_VESSELS - selected.length;
    if (remaining > 0) {
      selected.push(...stationary.slice(0, remaining));
    }

    const features: LayerFeature[] = [];

    for (const f of selected) {
      const mmsi = f.mmsi ?? f.properties?.mmsi;
      if (!mmsi) continue;

      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties;
      const meta = metadataMap.get(mmsi);

      const shipType = meta?.shipType ?? 0;
      const category = classifyShipType(shipType);
      const severity = categorySeverity(category);
      const vesselName = meta?.name?.trim() || null;
      const label = vesselName || `MMSI ${mmsi}`;

      // Timestamp: Digitraffic uses milliseconds
      const aisTimestamp = props?.timestampExternal ?? props?.timestamp ?? 0;
      const timestamp =
        aisTimestamp > 1_000_000_000_000
          ? Math.floor(aisTimestamp / 1000) // ms → s
          : aisTimestamp; // already seconds

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `vessel-${mmsi}`,
          layer: 'vessels',
          label,
          timestamp: timestamp || Math.floor(now / 1000),
          category,
          severity,
          // Vessel-specific properties
          vesselName,
          mmsi,
          imo: meta?.imo ?? null,
          callSign: meta?.callSign?.trim() || null,
          destination: meta?.destination?.trim() || null,
          shipType,
          heading: props?.heading ?? null,
          sog: props?.sog ?? null,
          cog: props?.cog ?? null,
          navStatus: props?.navStat ?? null,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'digitraffic-ais',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 180_000,
      },
    };
  }
}
