import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

/**
 * NASA FIRMS (Fire Information for Resource Management System) Fetcher.
 * Downloads the global 24-hour MODIS active fire CSV (no API key needed).
 * Filters to high-confidence hotspots to reduce noise.
 */

const FIRMS_URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv';

interface FIRMSRecord {
  latitude: number;
  longitude: number;
  brightness: number;
  scan: number;
  track: number;
  acq_date: string;
  acq_time: string;
  satellite: string;
  confidence: number;
  bright_t31: number;
  frp: number;
  daynight: string;
}

export class FIRMSFetcher extends BaseFetcher {
  readonly sourceId = 'active_fires';
  readonly displayName = 'NASA FIRMS Active Fires';
  readonly defaultInterval = '0 */30 * * * *'; // every 30 minutes
  readonly cacheTTL = 1800; // 30 minutes

  async fetchRaw(): Promise<string> {
    const response = await fetch(FIRMS_URL, {
      headers: { Accept: 'text/csv' },
    });

    if (!response.ok) {
      throw new Error(
        `FIRMS API returned ${response.status}: ${response.statusText}`,
      );
    }

    return await response.text();
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const csvText = raw as string;
    const now = Date.now();
    const lines = csvText.split('\n');
    const headers = lines[0]?.split(',') ?? [];

    const latIdx = headers.indexOf('latitude');
    const lonIdx = headers.indexOf('longitude');
    const brightIdx = headers.indexOf('brightness');
    const dateIdx = headers.indexOf('acq_date');
    const timeIdx = headers.indexOf('acq_time');
    const confIdx = headers.indexOf('confidence');
    const frpIdx = headers.indexOf('frp');
    const dnIdx = headers.indexOf('daynight');
    const satIdx = headers.indexOf('satellite');

    const features: LayerFeature[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 5) continue;

      const confidence = parseFloat(cols[confIdx]) || 0;
      // Only include medium-high confidence fires (>=50%)
      if (confidence < 50) continue;

      const lat = parseFloat(cols[latIdx]);
      const lon = parseFloat(cols[lonIdx]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const brightness = parseFloat(cols[brightIdx]) || 0;
      const frp = parseFloat(cols[frpIdx]) || 0;
      const acqDate = cols[dateIdx] || '';
      const acqTime = cols[timeIdx] || '';
      const daynight = cols[dnIdx] || '';
      const satellite = cols[satIdx] || '';

      // Severity based on fire radiative power
      let severity = 0;
      if (frp > 100) severity = 1.0;
      else if (frp > 50) severity = 0.75;
      else if (frp > 20) severity = 0.5;
      else severity = 0.25;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: `fire_${lat.toFixed(4)}_${lon.toFixed(4)}_${acqTime}`,
          layer: 'active_fires',
          label: `Fire ${brightness.toFixed(0)}K`,
          timestamp: Math.floor(now / 1000),
          category: daynight === 'D' ? 'daytime' : 'nighttime',
          severity,
          brightness,
          frp,
          confidence,
          acqDate,
          acqTime,
          satellite,
          daynight,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'firms',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 1_800_000,
      },
    };
  }
}
