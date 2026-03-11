import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

// --- Raw Socrata response types ---

interface NYCComplaint {
  cmplnt_num: string;
  cmplnt_fr_dt?: string;
  cmplnt_fr_tm?: string;
  ofns_desc?: string;
  law_cat_cd?: string; // FELONY, MISDEMEANOR, VIOLATION
  boro_nm?: string;
  prem_typ_desc?: string;
  pd_desc?: string;
  crm_atpt_cptd_cd?: string; // COMPLETED, ATTEMPTED
  latitude?: string;
  longitude?: string;
  loc_of_occur_desc?: string;
  [key: string]: unknown;
}

interface LouisvilleCrime {
  incident_number?: string;
  date_reported?: string;
  date_of_occurrence?: string;
  crime_type?: string;
  uor_desc?: string;
  nibrs_code?: string;
  block_address?: string;
  city?: string;
  zip_code?: string;
  latitude?: string;
  longitude?: string;
  [key: string]: unknown;
}

// Violent crime keywords for severity mapping
const VIOLENT_KEYWORDS = [
  'murder',
  'homicide',
  'manslaughter',
  'rape',
  'robbery',
  'assault',
  'kidnapping',
  'shooting',
  'stabbing',
  'arson',
  'weapons',
  'firearm',
  'sexual',
  'carjacking',
];

function isViolent(description: string): boolean {
  const lower = description.toLowerCase();
  return VIOLENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Map offense description to a severity score between 0 and 1.
 * Violent crimes score higher; felonies score higher than misdemeanors.
 */
function mapSeverity(
  offense: string,
  lawCategory?: string,
): number {
  if (isViolent(offense)) {
    return 0.9;
  }

  switch (lawCategory?.toUpperCase()) {
    case 'FELONY':
      return 0.7;
    case 'MISDEMEANOR':
      return 0.4;
    case 'VIOLATION':
      return 0.2;
    default:
      // Fallback: check if offense hints at severity
      if (isViolent(offense)) return 0.9;
      return 0.5;
  }
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10) + 'T00:00:00';
}

interface RawCrimeData {
  nyc: NYCComplaint[];
  louisville: LouisvilleCrime[];
}

export class CrimeFetcher extends BaseFetcher {
  readonly sourceId = 'crime_incidents';
  readonly displayName = 'Crime Incidents';
  readonly defaultInterval = '0 */30 * * * *';
  readonly cacheTTL = 1800;

  async fetchRaw(): Promise<RawCrimeData> {
    // NYC data may lag months behind — fetch most recent 500 records
    const nycUrl =
      `https://data.cityofnewyork.us/resource/5uac-w243.json` +
      `?$limit=500&$order=cmplnt_fr_dt DESC`;

    const louisvilleUrl =
      `https://data.louisvilleky.gov/resource/y4zs-bfge.json` +
      `?$limit=500&$order=date_reported DESC`;

    const [nycResult, louisvilleResult] = await Promise.allSettled([
      this.fetchCity<NYCComplaint[]>(nycUrl, 'NYC'),
      this.fetchCity<LouisvilleCrime[]>(louisvilleUrl, 'Louisville'),
    ]);

    return {
      nyc:
        nycResult.status === 'fulfilled' ? nycResult.value : [],
      louisville:
        louisvilleResult.status === 'fulfilled'
          ? louisvilleResult.value
          : [],
    };
  }

  private async fetchCity<T>(url: string, city: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `${city} Socrata API returned ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as RawCrimeData;
    const now = Date.now();
    const features: LayerFeature[] = [];

    // --- NYC ---
    for (const r of data.nyc) {
      const lat = parseFloat(r.latitude ?? '');
      const lon = parseFloat(r.longitude ?? '');
      if (!isFinite(lat) || !isFinite(lon)) continue;

      const offense = r.ofns_desc || r.pd_desc || 'Unknown';
      const dateStr = r.cmplnt_fr_dt || '';
      const timeStr = r.cmplnt_fr_tm || '00:00:00';
      const timestamp = this.parseTimestamp(dateStr, timeStr);

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `nyc-${r.cmplnt_num}`,
          layer: 'crime_incidents',
          label: offense,
          timestamp,
          category: r.law_cat_cd || 'UNKNOWN',
          severity: mapSeverity(offense, r.law_cat_cd),
          city: 'New York City',
          offense,
          address: r.prem_typ_desc || null,
          status: r.crm_atpt_cptd_cd || null,
        },
      });
    }

    // --- Louisville ---
    for (const r of data.louisville) {
      const lat = parseFloat(r.latitude ?? '');
      const lon = parseFloat(r.longitude ?? '');
      if (!isFinite(lat) || !isFinite(lon)) continue;

      const offense = r.crime_type || r.uor_desc || 'Unknown';
      const dateStr = r.date_of_occurrence || r.date_reported || '';
      const timestamp = this.parseTimestamp(dateStr);

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `lou-${r.incident_number || Math.random().toString(36).slice(2, 10)}`,
          layer: 'crime_incidents',
          label: offense,
          timestamp,
          category: r.nibrs_code || 'UNKNOWN',
          severity: mapSeverity(offense),
          city: 'Louisville',
          offense,
          address: r.block_address || null,
          status: null,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'socrata',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }

  /**
   * Parse a date string (and optional time) into Unix seconds.
   * Handles Socrata ISO formats like "2026-03-05T00:00:00.000" and plain dates.
   */
  private parseTimestamp(dateStr: string, timeStr?: string): number {
    if (!dateStr) return Math.floor(Date.now() / 1000);

    try {
      // Socrata often returns ISO-ish strings; try direct parse first
      let combined = dateStr;
      if (timeStr && !dateStr.includes('T')) {
        combined = `${dateStr.slice(0, 10)}T${timeStr}`;
      }
      const ms = new Date(combined).getTime();
      if (isFinite(ms)) return Math.floor(ms / 1000);
    } catch {
      // fall through
    }

    return Math.floor(Date.now() / 1000);
  }
}
