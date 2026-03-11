import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// --- DShield API response types ---

interface DShieldTopIP {
  ipaddress: string;
  count: string;       // report count (string from API)
  attacks: string;     // attack count
  maxdate: string;
  mindate: string;
  updated: string;
  comment: string | null;
  countryflag?: string;
  countrycode?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

interface DShieldInfocon {
  status: 'green' | 'yellow' | 'orange' | 'red';
}

interface IpApiResult {
  query: string;        // the IP we asked about
  status: 'success' | 'fail';
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
}

interface RawCyberData {
  attacks: Array<DShieldTopIP & { geo?: IpApiResult }>;
  infocon: string;
}

// Major Internet Exchange Points used as arc endpoints
const EXCHANGE_POINTS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Ashburn, VA',  lat: 38.7,  lon: -77.5 },
  { name: 'Frankfurt',    lat: 50.1,  lon: 8.7   },
  { name: 'Amsterdam',    lat: 52.4,  lon: 4.9   },
  { name: 'London',       lat: 51.5,  lon: -0.1  },
  { name: 'Tokyo',        lat: 35.7,  lon: 139.7 },
  { name: 'Singapore',    lat: 1.3,   lon: 103.8 },
];

/**
 * Find the nearest exchange point to a given lat/lon using
 * simple Euclidean distance (good enough for nearest-neighbor on a globe).
 */
function nearestExchange(lat: number, lon: number): { name: string; lat: number; lon: number } {
  let best = EXCHANGE_POINTS[0];
  let bestDist = Number.MAX_VALUE;
  for (const ep of EXCHANGE_POINTS) {
    const dLat = ep.lat - lat;
    const dLon = ep.lon - lon;
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist) {
      bestDist = dist;
      best = ep;
    }
  }
  return best;
}

/**
 * Classify attack type based on target count.
 */
function classifyAttack(targets: number): 'ddos' | 'scanning' | 'malware' | 'probe' {
  if (targets > 100) return 'ddos';
  if (targets > 10)  return 'scanning';
  return 'probe';
}

export class CyberThreatFetcher extends BaseFetcher {
  readonly sourceId = 'cyber_threats';
  readonly displayName = 'Cyber Threat Map';
  readonly defaultInterval = '0 */10 * * * *'; // every 10 minutes
  readonly cacheTTL = 600;

  async fetchRaw(): Promise<RawCyberData> {
    // 1. Fetch top 50 attacking IPs from DShield
    const topIpsRes = await fetch('https://isc.sans.edu/api/topips/records/50?json', {
      headers: { Accept: 'application/json', 'User-Agent': 'GSD-CyberThreatFetcher/1.0' },
    });

    if (!topIpsRes.ok) {
      throw new Error(`DShield topips API returned ${topIpsRes.status}: ${topIpsRes.statusText}`);
    }

    const topIpsRaw = await topIpsRes.json() as DShieldTopIP[];

    // 2. Extract unique IPs
    const uniqueIps = [...new Set(topIpsRaw.map((entry) => entry.ipaddress))];

    // 3. Geolocate via ip-api.com batch (max 100 per request, 15 req/min)
    let geoResults: IpApiResult[] = [];
    if (uniqueIps.length > 0) {
      const batchRes = await fetch('http://ip-api.com/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uniqueIps),
      });

      if (batchRes.ok) {
        geoResults = await batchRes.json() as IpApiResult[];
      } else {
        console.warn(`[cyber_threats] ip-api batch returned ${batchRes.status}, skipping geo`);
      }
    }

    // Build geo lookup map
    const geoMap = new Map<string, IpApiResult>();
    for (const geo of geoResults) {
      if (geo.status === 'success' && geo.query) {
        geoMap.set(geo.query, geo);
      }
    }

    // Merge geo into attack records
    const attacks = topIpsRaw.map((entry) => ({
      ...entry,
      geo: geoMap.get(entry.ipaddress),
    }));

    // 4. Fetch InfoCon threat level
    let infocon = 'green';
    try {
      const infoconRes = await fetch('https://isc.sans.edu/api/infocon?json', {
        headers: { Accept: 'application/json', 'User-Agent': 'GSD-CyberThreatFetcher/1.0' },
      });
      if (infoconRes.ok) {
        const infoconData = await infoconRes.json() as DShieldInfocon;
        infocon = infoconData.status || 'green';
      }
    } catch {
      console.warn('[cyber_threats] Failed to fetch infocon, defaulting to green');
    }

    return { attacks, infocon };
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as RawCyberData;
    const now = Date.now();
    const features: LayerFeature[] = [];

    // Find max report count for severity normalization
    const maxReports = Math.max(
      ...data.attacks.map((a) => parseInt(a.count, 10) || 1),
      1,
    );

    // --- Attacker source points ---
    for (const attack of data.attacks) {
      const geo = attack.geo;
      if (!geo || geo.status !== 'success') continue;

      const lat = geo.lat;
      const lon = geo.lon;
      if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) continue;

      const ip = attack.ipaddress;
      const reports = parseInt(attack.count, 10) || 0;
      const targets = parseInt(attack.attacks, 10) || 0;
      const severity = reports / maxReports;
      const attackType = classifyAttack(targets);
      const category = attackType;
      const nearest = nearestExchange(lat, lon);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `cyber-${ip}`,
          layer: 'cyber_threats',
          label: geo.city && geo.country ? `${geo.city}, ${geo.country}` : ip,
          timestamp: Math.floor(now / 1000),
          category,
          severity,
          ip,
          country: geo.country || null,
          city: geo.city || null,
          isp: geo.isp || null,
          org: geo.org || null,
          reports,
          targets,
          infocon: data.infocon,
          attackType,
          featureType: 'attacker',
          arcTarget: [nearest.lon, nearest.lat],
          arcTargetName: nearest.name,
        },
      });
    }

    // --- Target points (Internet Exchange Points) ---
    for (const ep of EXCHANGE_POINTS) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [ep.lon, ep.lat],
        },
        properties: {
          id: `cyber-ixp-${ep.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
          layer: 'cyber_threats',
          label: `IXP: ${ep.name}`,
          timestamp: Math.floor(now / 1000),
          category: 'exchange_point',
          severity: 0,
          featureType: 'exchange_point',
          infocon: data.infocon,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'dshield+ip-api',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }
}
