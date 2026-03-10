import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from 'satellite.js';
import { BaseFetcher } from './BaseFetcher.js';
import { ommToTLE } from '../utils/tle.js';
import type { OMMRecord } from '../utils/tle.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

const CELESTRAK_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=VISUAL&FORMAT=JSON';

export class CelesTrakFetcher extends BaseFetcher {
  readonly sourceId = 'satellites';
  readonly displayName = 'CelesTrak Satellites';
  readonly defaultInterval = '0 0 */4 * * *'; // every 4 hours
  readonly cacheTTL = 14400; // 4 hours in seconds

  async fetchRaw(): Promise<OMMRecord[]> {
    const response = await fetch(CELESTRAK_URL);
    if (!response.ok) {
      throw new Error(
        `CelesTrak API returned ${response.status}: ${response.statusText}`,
      );
    }
    return (await response.json()) as OMMRecord[];
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const records = raw as OMMRecord[];
    const now = new Date();
    const nowMs = now.getTime();
    const features: LayerFeature[] = [];

    for (const omm of records) {
      try {
        // Convert OMM to TLE
        const { line1, line2 } = ommToTLE(omm);

        // Parse TLE into satrec
        const satrec = twoline2satrec(line1, line2);

        // Propagate to current time
        const posVel = propagate(satrec, now);
        if (!posVel || !posVel.position) {
          // Propagation failed — stale TLE, skip
          continue;
        }

        const gmst = gstime(now);
        const geo = eciToGeodetic(posVel.position, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const altitudeKm = geo.height;

        // Compute velocity magnitude (km/s) from ECI velocity vector
        let velocityKms = 0;
        if (posVel.velocity) {
          const vx = posVel.velocity.x;
          const vy = posVel.velocity.y;
          const vz = posVel.velocity.z;
          velocityKms = Math.sqrt(vx * vx + vy * vy + vz * vz);
        }

        const feature: LayerFeature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lon, lat],
          },
          properties: {
            id: omm.NORAD_CAT_ID.toString(),
            layer: 'satellites',
            label: omm.OBJECT_NAME,
            timestamp: Math.floor(nowMs / 1000),
            category: 'satellite',
            severity: null,
            // Satellite-specific properties
            name: omm.OBJECT_NAME,
            noradCatId: omm.NORAD_CAT_ID,
            altitudeKm: Math.round(altitudeKm * 100) / 100,
            velocityKms: Math.round(velocityKms * 1000) / 1000,
            // Orbital elements for frontend propagation
            inclination: omm.INCLINATION,
            eccentricity: omm.ECCENTRICITY,
            raOfAscNode: omm.RA_OF_ASC_NODE,
            argOfPericenter: omm.ARG_OF_PERICENTER,
            meanAnomaly: omm.MEAN_ANOMALY,
            meanMotion: omm.MEAN_MOTION,
            bstar: omm.BSTAR,
            meanMotionDot: omm.MEAN_MOTION_DOT,
            meanMotionDdot: omm.MEAN_MOTION_DDOT,
            epoch: omm.EPOCH,
            // Raw TLE lines for frontend satellite.js
            tleLine1: line1,
            tleLine2: line2,
          },
        };

        features.push(feature);
      } catch {
        // Skip satellites that fail to process (bad OMM data, etc.)
        continue;
      }
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'celestrak',
        fetchedAt: nowMs,
        count: features.length,
        nextUpdate: nowMs + 14400_000,
      },
    };
  }
}
