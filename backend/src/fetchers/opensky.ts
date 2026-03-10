import { BaseFetcher } from './BaseFetcher.js';
import { OpenSkyAuth } from '../services/opensky-auth.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

/**
 * OpenSky state vector array indices.
 * Each aircraft state is returned as an array, not an object.
 */
const IDX = {
  ICAO24: 0,
  CALLSIGN: 1,
  ORIGIN_COUNTRY: 2,
  TIME_POSITION: 3,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
  SENSORS: 12,
  GEO_ALTITUDE: 13,
  SQUAWK: 14,
  SPI: 15,
  POSITION_SOURCE: 16,
  CATEGORY: 17,
} as const;

/** Conversion factors. */
const MS_TO_KNOTS = 1.94384;
const METERS_TO_FEET = 3.28084;

const OPENSKY_API_URL = 'https://opensky-network.org/api/states/all';

type StateVector = (string | number | boolean | number[] | null)[];

interface OpenSkyResponse {
  time: number;
  states: StateVector[] | null;
}

export class OpenSkyFetcher extends BaseFetcher {
  readonly sourceId = 'flights';
  readonly displayName = 'Live Flights';
  readonly defaultInterval = '*/30 * * * * *'; // every 30 seconds
  readonly cacheTTL = 25; // slightly less than interval

  private auth: OpenSkyAuth;

  /** Number of consecutive cycles to skip after a 429 (rate limit). */
  private backoffCycles = 0;

  constructor(
    cache: ConstructorParameters<typeof BaseFetcher>[0],
    io: ConstructorParameters<typeof BaseFetcher>[1],
    auth: OpenSkyAuth,
  ) {
    super(cache, io);
    this.auth = auth;
  }

  async fetchRaw(): Promise<OpenSkyResponse> {
    // Honour backoff from previous 429
    if (this.backoffCycles > 0) {
      this.backoffCycles--;
      console.log(
        `[flights] Backing off, ${this.backoffCycles} cycles remaining`,
      );
      throw new Error(`Rate-limit backoff (${this.backoffCycles + 1} cycles left)`);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Attach Bearer token when available
    const token = await this.auth.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(OPENSKY_API_URL, { headers });

    if (response.status === 429) {
      // Back off for the next 3 cycles (~90 seconds at 30s interval)
      this.backoffCycles = 3;
      throw new Error('OpenSky API rate limit hit (429). Backing off 3 cycles.');
    }

    if (!response.ok) {
      throw new Error(
        `OpenSky API returned ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as OpenSkyResponse;
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as OpenSkyResponse;
    const now = Date.now();

    if (!data.states || !Array.isArray(data.states)) {
      return {
        type: 'FeatureCollection',
        features: [],
        metadata: {
          source: 'opensky',
          fetchedAt: now,
          count: 0,
          nextUpdate: now + 30_000,
        },
      };
    }

    const features: LayerFeature[] = [];

    for (const sv of data.states) {
      const lon = sv[IDX.LONGITUDE] as number | null;
      const lat = sv[IDX.LATITUDE] as number | null;

      // Skip entries without valid position
      if (lon == null || lat == null) continue;

      const icao24 = (sv[IDX.ICAO24] as string) || '';
      const callsign = ((sv[IDX.CALLSIGN] as string) || '').trim();
      const originCountry = (sv[IDX.ORIGIN_COUNTRY] as string) || '';
      const onGround = sv[IDX.ON_GROUND] as boolean;

      // Altitude: prefer barometric, fall back to geometric
      const baroAltM = sv[IDX.BARO_ALTITUDE] as number | null;
      const geoAltM = sv[IDX.GEO_ALTITUDE] as number | null;
      const altitudeM = baroAltM ?? geoAltM ?? 0;
      const altitudeFt = Math.round(altitudeM * METERS_TO_FEET);

      // Velocity: m/s → knots
      const velocityMs = sv[IDX.VELOCITY] as number | null;
      const speedKnots = velocityMs != null
        ? Math.round(velocityMs * MS_TO_KNOTS)
        : null;

      const trueTrack = sv[IDX.TRUE_TRACK] as number | null;
      const verticalRate = sv[IDX.VERTICAL_RATE] as number | null;
      const squawk = (sv[IDX.SQUAWK] as string | null) || null;
      const lastContact = sv[IDX.LAST_CONTACT] as number | null;
      const category = sv[IDX.CATEGORY] as number | null;

      // Label: prefer callsign, fall back to icao24 uppercase
      const label = callsign || icao24.toUpperCase();

      // Severity: map altitude bands to a 0-1 value for UI theming
      //   ground=0, low(<10kft)=0.25, mid(10-30k)=0.5, cruise(>30k)=1.0
      let severity = 0;
      if (!onGround) {
        if (altitudeFt < 10_000) severity = 0.25;
        else if (altitudeFt < 30_000) severity = 0.5;
        else severity = 1.0;
      }

      features.push({
        type: 'Feature' as const,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          id: icao24,
          layer: 'flights',
          label,
          timestamp: lastContact ?? Math.floor(now / 1000),
          category: onGround ? 'ground' : 'airborne',
          severity,
          // Flight-specific properties
          icao24,
          callsign,
          originCountry,
          altitudeFt,
          speedKnots,
          trueTrack,
          verticalRate,
          onGround,
          squawk,
          aircraftCategory: category,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'opensky',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + 30_000,
      },
    };
  }
}
