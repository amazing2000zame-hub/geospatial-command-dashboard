import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

/**
 * Power Grid & Outages Layer
 *
 * Sources:
 * 1. US DOE EIA API for grid generation/demand data (needs key - gracefully skip if missing)
 * 2. PowerOutage.us state-level data (scrape summary page)
 * 3. Static major grid infrastructure points (substations, power plants)
 */

// Major US power grid infrastructure points (static dataset)
const GRID_INFRASTRUCTURE = [
  { name: 'Palo Verde Nuclear', lat: 33.39, lng: -112.86, type: 'nuclear', capacity_mw: 3937, state: 'AZ' },
  { name: 'Grand Coulee Dam', lat: 47.95, lng: -118.98, type: 'hydro', capacity_mw: 6809, state: 'WA' },
  { name: 'West Point Wind Farm', lat: 31.05, lng: -100.45, type: 'wind', capacity_mw: 2600, state: 'TX' },
  { name: 'Hoover Dam', lat: 36.016, lng: -114.738, type: 'hydro', capacity_mw: 2080, state: 'NV' },
  { name: 'Robert Moses Niagara', lat: 43.137, lng: -79.047, type: 'hydro', capacity_mw: 2525, state: 'NY' },
  { name: 'Scherer Plant', lat: 33.05, lng: -83.83, type: 'coal', capacity_mw: 3520, state: 'GA' },
  { name: 'Solar Star', lat: 34.83, lng: -118.39, type: 'solar', capacity_mw: 579, state: 'CA' },
  { name: 'Ivanpah Solar', lat: 35.56, lng: -115.47, type: 'solar', capacity_mw: 392, state: 'CA' },
  { name: 'Alta Wind Energy', lat: 35.07, lng: -118.36, type: 'wind', capacity_mw: 1548, state: 'CA' },
  { name: 'Vogtle Nuclear', lat: 33.14, lng: -81.76, type: 'nuclear', capacity_mw: 4540, state: 'GA' },
  { name: 'South Texas Nuclear', lat: 28.79, lng: -96.05, type: 'nuclear', capacity_mw: 2708, state: 'TX' },
  { name: 'Braidwood Nuclear', lat: 41.24, lng: -88.21, type: 'nuclear', capacity_mw: 2386, state: 'IL' },
  { name: 'Browns Ferry Nuclear', lat: 34.70, lng: -87.12, type: 'nuclear', capacity_mw: 3440, state: 'AL' },
  { name: 'Diablo Canyon Nuclear', lat: 35.21, lng: -120.85, type: 'nuclear', capacity_mw: 2256, state: 'CA' },
  { name: 'North Anna Nuclear', lat: 38.06, lng: -77.79, type: 'nuclear', capacity_mw: 1892, state: 'VA' },
  { name: 'Comanche Peak Nuclear', lat: 32.30, lng: -97.78, type: 'nuclear', capacity_mw: 2430, state: 'TX' },
];

// US State centroids for outage data visualization
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.0, -153.0], AZ: [34.3, -111.7], AR: [34.8, -92.2],
  CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [28.6, -82.4], GA: [32.7, -83.4], HI: [20.5, -157.4], ID: [44.4, -114.6],
  IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5], KS: [38.5, -98.3],
  KY: [37.8, -85.7], LA: [31.1, -91.9], ME: [45.4, -69.2], MD: [39.0, -76.8],
  MA: [42.2, -71.5], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7],
  MO: [38.5, -92.4], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6],
  NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5],
  NC: [35.6, -79.4], ND: [47.4, -100.5], OH: [40.4, -82.8], OK: [35.6, -97.5],
  OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9],
  SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.4], UT: [39.3, -111.7],
  VT: [44.1, -72.6], VA: [37.5, -78.9], WA: [47.4, -120.7], WV: [38.6, -80.6],
  WI: [44.6, -89.7], WY: [43.0, -107.6], DC: [38.9, -77.0],
};

interface PowerOutageData {
  state: string;
  customersOut: number;
  customersTotal: number;
  percentOut: number;
}

interface RawPowerData {
  infrastructure: typeof GRID_INFRASTRUCTURE;
  outages: PowerOutageData[];
}

export class PowerOutageFetcher extends BaseFetcher {
  readonly sourceId = 'power_grid';
  readonly displayName = 'Power Grid & Outages';
  readonly defaultInterval = '0 */15 * * * *';
  readonly cacheTTL = 900;

  async fetchRaw(): Promise<RawPowerData> {
    // Try to scrape PowerOutage.us summary (JSON API endpoint)
    let outages: PowerOutageData[] = [];

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(
        'https://poweroutage.us/api/web/counties?key=',
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'GeospatialDashboard/1.0',
            Accept: 'application/json',
          },
        },
      );

      if (res.ok) {
        // PowerOutage.us may return data; parse it
        const data = (await res.json()) as Record<string, unknown>[];
        // If it returns state-level data, aggregate
        if (Array.isArray(data)) {
          const stateMap = new Map<string, { out: number; total: number }>();
          for (const entry of data) {
            const state = entry.StateName as string || '';
            const out = Number(entry.CustomersOut) || 0;
            const total = Number(entry.CustomersTracked) || 0;
            if (state) {
              const existing = stateMap.get(state) || { out: 0, total: 0 };
              stateMap.set(state, { out: existing.out + out, total: existing.total + total });
            }
          }
          for (const [state, { out, total }] of stateMap) {
            if (total > 0) {
              outages.push({
                state,
                customersOut: out,
                customersTotal: total,
                percentOut: (out / total) * 100,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[${this.sourceId}] PowerOutage.us fetch failed:`, err instanceof Error ? err.message : err);
    }

    // If no outage data, generate mock data based on typical patterns
    // This provides visual data while real API access is being set up
    if (outages.length === 0) {
      // Use DOE EIA if key available, otherwise return empty
      console.log(`[${this.sourceId}] No outage data available, using infrastructure only`);
    }

    return {
      infrastructure: GRID_INFRASTRUCTURE,
      outages,
    };
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as RawPowerData;
    const now = Date.now();
    const features: LayerFeature[] = [];

    // Infrastructure points
    for (const plant of data.infrastructure) {
      const typeColor: Record<string, string> = {
        nuclear: '#fbbf24',
        hydro: '#3b82f6',
        coal: '#6b7280',
        wind: '#34d399',
        solar: '#f59e0b',
        gas: '#f97316',
      };

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [plant.lng, plant.lat],
        },
        properties: {
          id: `grid-${plant.name.toLowerCase().replace(/\s+/g, '-')}`,
          layer: 'power_grid',
          label: plant.name,
          timestamp: Math.floor(now / 1000),
          category: plant.type,
          severity: 0.2,
          capacity_mw: plant.capacity_mw,
          state: plant.state,
          plantType: plant.type,
          typeColor: typeColor[plant.type] || '#6b7280',
          featureKind: 'infrastructure',
        },
      });
    }

    // Outage data (state-level points)
    for (const outage of data.outages) {
      // Find state abbreviation from name
      const stateEntry = Object.entries(STATE_CENTROIDS).find(([abbr]) => {
        return outage.state.toUpperCase().startsWith(abbr);
      });
      if (!stateEntry) continue;

      const [abbr, [lat, lng]] = stateEntry;
      const severity = Math.min(outage.percentOut / 10, 1.0); // 10% = max severity

      if (outage.customersOut < 100) continue; // skip trivial outages

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: {
          id: `outage-${abbr}`,
          layer: 'power_grid',
          label: `${outage.state}: ${outage.customersOut.toLocaleString()} out`,
          timestamp: Math.floor(now / 1000),
          category: 'outage',
          severity,
          state: abbr,
          customersOut: outage.customersOut,
          customersTotal: outage.customersTotal,
          percentOut: outage.percentOut,
          featureKind: 'outage',
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'power_grid',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }
}
