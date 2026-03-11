import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// --- Seattle Real-Time Fire 911 Calls (Socrata) ---
interface SeattleRecord {
  datetime: string;
  address: string;
  type: string;
  incident_number: string;
  latitude: string;
  longitude: string;
  report_location?: {
    latitude: string;
    longitude: string;
  };
  [key: string]: unknown;
}

// --- SF Fire Department Calls for Service (Socrata) ---
interface SFRecord {
  call_number: string;
  call_type: string;
  call_type_group?: string;
  received_dttm: string;
  address?: string;
  city?: string;
  unit_id?: string;
  final_priority?: string;
  call_final_disposition?: string;
  case_location?: {
    type: string;
    coordinates: [number, number];
  };
  [key: string]: unknown;
}

interface RawDispatchData {
  seattle: SeattleRecord[];
  sf: SFRecord[];
}

const SEATTLE_URL =
  'https://data.seattle.gov/resource/kzjm-xkqj.json?$limit=200&$order=datetime%20DESC';
const SF_URL =
  'https://data.sfgov.org/resource/nuek-vuh3.json?$limit=200&$order=received_dttm%20DESC';

const FETCH_TIMEOUT_MS = 10_000;

/** Fire-related type keywords for category/severity mapping */
const FIRE_KEYWORDS = [
  'fire',
  'smoke',
  'burn',
  'arson',
  'explosion',
  'hazmat',
  'gas leak',
  'fuel spill',
];

const EMS_KEYWORDS = [
  'medic',
  'medical',
  'aid',
  'cardiac',
  'stroke',
  'overdose',
  'choking',
  'breathing',
  'fall',
  'injury',
  'trauma',
  'unconscious',
  'seizure',
  'diabetic',
  'allergic',
  'chest pain',
  'hemorrhage',
  'childbirth',
  'drowning',
];

function classifyCategory(
  type: string,
): 'fire' | 'ems' | 'other' {
  const lower = type.toLowerCase();
  if (FIRE_KEYWORDS.some((kw) => lower.includes(kw))) return 'fire';
  if (EMS_KEYWORDS.some((kw) => lower.includes(kw))) return 'ems';
  return 'other';
}

function mapSeverity(category: 'fire' | 'ems' | 'other'): number {
  switch (category) {
    case 'fire':
      return 0.8;
    case 'ems':
      return 0.5;
    default:
      return 0.3;
  }
}

function toUnixSeconds(dateStr: string): number {
  const ms = Date.parse(dateStr);
  return Number.isNaN(ms) ? Math.floor(Date.now() / 1000) : Math.floor(ms / 1000);
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export class DispatchFetcher extends BaseFetcher {
  readonly sourceId = 'dispatch';
  readonly displayName = 'Fire/EMS Dispatch';
  readonly defaultInterval = '0 */5 * * * *';
  readonly cacheTTL = 300;

  async fetchRaw(): Promise<RawDispatchData> {
    const [seattleResult, sfResult] = await Promise.allSettled([
      this.fetchSeattle(),
      this.fetchSF(),
    ]);

    const seattle =
      seattleResult.status === 'fulfilled' ? seattleResult.value : [];
    const sf =
      sfResult.status === 'fulfilled' ? sfResult.value : [];

    if (seattleResult.status === 'rejected') {
      console.warn(
        `[${this.sourceId}] Seattle fetch failed:`,
        seattleResult.reason,
      );
    }
    if (sfResult.status === 'rejected') {
      console.warn(
        `[${this.sourceId}] SF fetch failed:`,
        sfResult.reason,
      );
    }

    if (seattle.length === 0 && sf.length === 0) {
      throw new Error('All dispatch sources returned empty or failed');
    }

    return { seattle, sf };
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as RawDispatchData;
    const now = Date.now();

    const seattleFeatures = this.normalizeSeattle(data.seattle);
    const sfFeatures = this.normalizeSF(data.sf);

    const features = [...seattleFeatures, ...sfFeatures];

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'dispatch',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 300_000,
      },
    };
  }

  // --- Private helpers ---

  private async fetchSeattle(): Promise<SeattleRecord[]> {
    const res = await fetchWithTimeout(SEATTLE_URL, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(
        `Seattle 911 API returned ${res.status}: ${res.statusText}`,
      );
    }
    return (await res.json()) as SeattleRecord[];
  }

  private async fetchSF(): Promise<SFRecord[]> {
    const res = await fetchWithTimeout(SF_URL, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      throw new Error(
        `SF Fire API returned ${res.status}: ${res.statusText}`,
      );
    }
    return (await res.json()) as SFRecord[];
  }

  private normalizeSeattle(records: SeattleRecord[]): LayerFeature[] {
    const features: LayerFeature[] = [];

    for (const rec of records) {
      const lat = parseFloat(rec.latitude);
      const lon = parseFloat(rec.longitude);

      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      if (lat === 0 && lon === 0) continue;

      const incidentType = rec.type || 'Unknown';
      const category = classifyCategory(incidentType);

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `sea-${rec.incident_number}`,
          layer: 'dispatch',
          label: incidentType,
          timestamp: toUnixSeconds(rec.datetime),
          category,
          severity: mapSeverity(category),
          city: 'Seattle',
          address: rec.address || null,
          unit: null,
          status: null,
        },
      });
    }

    return features;
  }

  private normalizeSF(records: SFRecord[]): LayerFeature[] {
    const features: LayerFeature[] = [];

    for (const rec of records) {
      let lon: number | undefined;
      let lat: number | undefined;

      // SF uses case_location as GeoJSON Point with [lon, lat]
      if (rec.case_location?.coordinates) {
        [lon, lat] = rec.case_location.coordinates;
      }

      if (lat === undefined || lon === undefined) continue;
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      if (lat === 0 && lon === 0) continue;

      const incidentType = rec.call_type || rec.call_type_group || 'Unknown';
      const category = classifyCategory(incidentType);

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `sf-${rec.call_number}`,
          layer: 'dispatch',
          label: incidentType,
          timestamp: toUnixSeconds(rec.received_dttm),
          category,
          severity: mapSeverity(category),
          city: rec.city || 'San Francisco',
          address: rec.address || null,
          unit: rec.unit_id || null,
          status: rec.call_final_disposition || null,
        },
      });
    }

    return features;
  }
}
