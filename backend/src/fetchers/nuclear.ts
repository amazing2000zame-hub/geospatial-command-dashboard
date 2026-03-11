import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// --- Static nuclear facility data ---

interface NuclearFacility {
  name: string;
  country: string;
  lat: number;
  lon: number;
  status: 'operating' | 'shutdown' | 'under_construction' | 'decommissioning';
  reactorCount: number;
  reactorType: string;
  capacityMw: number;
}

const FACILITIES: NuclearFacility[] = [
  // === United States ===
  { name: 'Palo Verde', country: 'US', lat: 33.388, lon: -112.862, status: 'operating', reactorCount: 3, reactorType: 'PWR', capacityMw: 3937 },
  { name: 'Vogtle', country: 'US', lat: 33.142, lon: -81.763, status: 'operating', reactorCount: 4, reactorType: 'PWR', capacityMw: 4600 },
  { name: 'South Texas Project', country: 'US', lat: 28.795, lon: -96.048, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2708 },
  { name: 'Diablo Canyon', country: 'US', lat: 35.211, lon: -120.854, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2256 },
  { name: 'Braidwood', country: 'US', lat: 41.243, lon: -88.223, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2386 },
  { name: 'Byron', country: 'US', lat: 42.075, lon: -89.282, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2347 },
  { name: 'Comanche Peak', country: 'US', lat: 32.298, lon: -97.785, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2430 },
  { name: 'Limerick', country: 'US', lat: 40.224, lon: -75.588, status: 'operating', reactorCount: 2, reactorType: 'BWR', capacityMw: 2317 },
  { name: 'Peach Bottom', country: 'US', lat: 39.759, lon: -76.269, status: 'operating', reactorCount: 2, reactorType: 'BWR', capacityMw: 2770 },
  { name: 'Calvert Cliffs', country: 'US', lat: 38.432, lon: -76.442, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 1756 },
  { name: 'Three Mile Island', country: 'US', lat: 40.153, lon: -76.725, status: 'decommissioning', reactorCount: 1, reactorType: 'PWR', capacityMw: 819 },
  { name: 'Indian Point', country: 'US', lat: 41.270, lon: -73.953, status: 'shutdown', reactorCount: 2, reactorType: 'PWR', capacityMw: 2069 },

  // === France ===
  { name: 'Flamanville', country: 'FR', lat: 49.537, lon: -1.881, status: 'operating', reactorCount: 3, reactorType: 'PWR/EPR', capacityMw: 3330 },
  { name: 'Gravelines', country: 'FR', lat: 51.015, lon: 2.103, status: 'operating', reactorCount: 6, reactorType: 'PWR', capacityMw: 5460 },
  { name: 'Cattenom', country: 'FR', lat: 49.406, lon: 6.219, status: 'operating', reactorCount: 4, reactorType: 'PWR', capacityMw: 5200 },
  { name: 'Paluel', country: 'FR', lat: 49.859, lon: 0.633, status: 'operating', reactorCount: 4, reactorType: 'PWR', capacityMw: 5320 },
  { name: 'Saint-Alban', country: 'FR', lat: 45.407, lon: 4.754, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 2670 },

  // === United Kingdom ===
  { name: 'Hinkley Point C', country: 'UK', lat: 51.208, lon: -3.131, status: 'under_construction', reactorCount: 2, reactorType: 'EPR', capacityMw: 3260 },
  { name: 'Sizewell B', country: 'UK', lat: 52.215, lon: 1.619, status: 'operating', reactorCount: 1, reactorType: 'PWR', capacityMw: 1198 },
  { name: 'Heysham', country: 'UK', lat: 54.029, lon: -2.912, status: 'operating', reactorCount: 4, reactorType: 'AGR', capacityMw: 2400 },

  // === Ukraine ===
  { name: 'Zaporizhzhia', country: 'UA', lat: 47.507, lon: 34.585, status: 'shutdown', reactorCount: 6, reactorType: 'VVER', capacityMw: 5700 },
  { name: 'Rivne', country: 'UA', lat: 51.326, lon: 25.895, status: 'operating', reactorCount: 4, reactorType: 'VVER', capacityMw: 2835 },
  { name: 'Khmelnytskyi', country: 'UA', lat: 50.301, lon: 26.649, status: 'operating', reactorCount: 2, reactorType: 'VVER', capacityMw: 2000 },

  // === Russia ===
  { name: 'Kursk', country: 'RU', lat: 51.671, lon: 35.605, status: 'operating', reactorCount: 4, reactorType: 'RBMK', capacityMw: 4000 },
  { name: 'Leningrad', country: 'RU', lat: 59.833, lon: 29.030, status: 'operating', reactorCount: 4, reactorType: 'VVER', capacityMw: 4400 },
  { name: 'Novovoronezh', country: 'RU', lat: 51.273, lon: 39.215, status: 'operating', reactorCount: 3, reactorType: 'VVER', capacityMw: 2535 },

  // === Japan ===
  { name: 'Fukushima Daiichi', country: 'JP', lat: 37.421, lon: 141.033, status: 'decommissioning', reactorCount: 6, reactorType: 'BWR', capacityMw: 0 },
  { name: 'Kashiwazaki-Kariwa', country: 'JP', lat: 37.427, lon: 138.598, status: 'shutdown', reactorCount: 7, reactorType: 'BWR/ABWR', capacityMw: 8212 },
  { name: 'Ohi', country: 'JP', lat: 35.544, lon: 135.652, status: 'operating', reactorCount: 4, reactorType: 'PWR', capacityMw: 4710 },
  { name: 'Takahama', country: 'JP', lat: 35.522, lon: 135.453, status: 'operating', reactorCount: 4, reactorType: 'PWR', capacityMw: 3392 },

  // === China ===
  { name: 'Taishan', country: 'CN', lat: 21.917, lon: 112.983, status: 'operating', reactorCount: 2, reactorType: 'EPR', capacityMw: 3300 },
  { name: 'Yangjiang', country: 'CN', lat: 21.713, lon: 112.256, status: 'operating', reactorCount: 6, reactorType: 'PWR/ACPR', capacityMw: 6516 },
  { name: 'Daya Bay', country: 'CN', lat: 22.596, lon: 114.544, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 1888 },
  { name: 'Hongyanhe', country: 'CN', lat: 39.794, lon: 121.479, status: 'operating', reactorCount: 6, reactorType: 'PWR', capacityMw: 6714 },
  { name: 'Fuqing', country: 'CN', lat: 25.442, lon: 119.442, status: 'operating', reactorCount: 6, reactorType: 'PWR/HPR1000', capacityMw: 6090 },
  { name: 'Tianwan', country: 'CN', lat: 34.688, lon: 119.461, status: 'operating', reactorCount: 6, reactorType: 'VVER/CNP', capacityMw: 6250 },

  // === South Korea ===
  { name: 'Kori (Shin-Kori)', country: 'KR', lat: 35.320, lon: 129.293, status: 'operating', reactorCount: 6, reactorType: 'PWR/APR1400', capacityMw: 7411 },
  { name: 'Hanbit (Yeonggwang)', country: 'KR', lat: 35.413, lon: 126.420, status: 'operating', reactorCount: 6, reactorType: 'PWR', capacityMw: 5875 },
  { name: 'Hanul (Ulchin)', country: 'KR', lat: 37.092, lon: 129.383, status: 'operating', reactorCount: 6, reactorType: 'PWR/APR1400', capacityMw: 7050 },

  // === India ===
  { name: 'Kudankulam', country: 'IN', lat: 8.167, lon: 77.714, status: 'operating', reactorCount: 2, reactorType: 'VVER', capacityMw: 2000 },
  { name: 'Tarapur', country: 'IN', lat: 19.830, lon: 72.650, status: 'operating', reactorCount: 4, reactorType: 'BWR/PHWR', capacityMw: 1400 },

  // === Canada ===
  { name: 'Bruce', country: 'CA', lat: 44.326, lon: -81.601, status: 'operating', reactorCount: 8, reactorType: 'PHWR', capacityMw: 6384 },
  { name: 'Darlington', country: 'CA', lat: 43.870, lon: -78.715, status: 'operating', reactorCount: 4, reactorType: 'PHWR', capacityMw: 3512 },

  // === Other ===
  { name: 'Barakah', country: 'AE', lat: 23.958, lon: 52.256, status: 'operating', reactorCount: 4, reactorType: 'APR1400', capacityMw: 5380 },
  { name: 'Akkuyu', country: 'TR', lat: 36.145, lon: 33.533, status: 'under_construction', reactorCount: 4, reactorType: 'VVER', capacityMw: 4800 },
  { name: 'Olkiluoto', country: 'FI', lat: 61.235, lon: 21.447, status: 'operating', reactorCount: 3, reactorType: 'BWR/EPR', capacityMw: 4340 },
  { name: 'Ringhals', country: 'SE', lat: 57.264, lon: 12.113, status: 'operating', reactorCount: 3, reactorType: 'PWR/BWR', capacityMw: 3203 },
  { name: 'Koeberg', country: 'ZA', lat: -33.677, lon: 18.431, status: 'operating', reactorCount: 2, reactorType: 'PWR', capacityMw: 1860 },
  { name: 'Cernavoda', country: 'RO', lat: 44.320, lon: 28.058, status: 'operating', reactorCount: 2, reactorType: 'PHWR', capacityMw: 1300 },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function statusToSeverity(status: string): number {
  switch (status) {
    case 'operating':
      return 0.5;
    case 'under_construction':
      return 0.3;
    case 'decommissioning':
      return 0.2;
    case 'shutdown':
      return 0.1;
    default:
      return 0.3;
  }
}

export class NuclearFacilityFetcher extends BaseFetcher {
  readonly sourceId = 'nuclear_facilities';
  readonly displayName = 'Nuclear Facilities';
  readonly defaultInterval = '0 0 */6 * * *'; // every 6 hours
  readonly cacheTTL = 21600; // 6 hours

  async fetchRaw(): Promise<NuclearFacility[]> {
    // Static dataset - no external API fetch needed
    // Return the hardcoded facility list directly
    return FACILITIES;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const facilities = raw as NuclearFacility[];
    const now = Date.now();
    const features: LayerFeature[] = [];

    for (const facility of facilities) {
      if (!isFinite(facility.lat) || !isFinite(facility.lon)) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [facility.lon, facility.lat],
        },
        properties: {
          id: `nuke-${slugify(facility.name)}`,
          layer: 'nuclear_facilities',
          label: facility.name,
          timestamp: Math.floor(now / 1000),
          category: facility.status,
          severity: statusToSeverity(facility.status),
          name: facility.name,
          country: facility.country,
          status: facility.status,
          reactorCount: facility.reactorCount,
          reactorType: facility.reactorType,
          capacity_mw: facility.capacityMw,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'iaea-static',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }
}
