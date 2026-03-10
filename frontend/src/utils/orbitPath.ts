import {
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from 'satellite.js';
import type { SatRec } from 'satellite.js';
import { Cartesian3 } from 'cesium';

export interface OrbitPoint {
  position: Cartesian3;
  time: Date;
  lat: number;
  lon: number;
  altitudeKm: number;
}

/**
 * Compute orbital ground track for a satellite.
 *
 * Propagates the satellite position at 1-minute intervals for +/- 45 minutes
 * from the given reference time (default: now).
 *
 * @param satrec - satellite.js SatRec object
 * @param referenceTime - center time for the orbit path (default: now)
 * @returns Array of OrbitPoint with Cartesian3 positions suitable for PolylineCollection
 */
export function computeOrbitPath(
  satrec: SatRec,
  referenceTime?: Date,
): OrbitPoint[] {
  const center = referenceTime || new Date();
  const points: OrbitPoint[] = [];
  const MINUTES_RANGE = 45;
  const STEP_MINUTES = 1;

  for (let m = -MINUTES_RANGE; m <= MINUTES_RANGE; m += STEP_MINUTES) {
    const t = new Date(center.getTime() + m * 60_000);

    try {
      const posVel = propagate(satrec, t);
      if (!posVel || !posVel.position) {
        continue;
      }

      const gmst = gstime(t);
      const geo = eciToGeodetic(posVel.position, gmst);
      const lat = degreesLat(geo.latitude);
      const lon = degreesLong(geo.longitude);
      const altitudeKm = geo.height;

      // Convert to Cesium Cartesian3 (lon, lat, altitude in meters)
      const position = Cartesian3.fromDegrees(lon, lat, altitudeKm * 1000);

      points.push({ position, time: t, lat, lon, altitudeKm });
    } catch {
      // Skip points where propagation fails
      continue;
    }
  }

  return points;
}

/**
 * Extract just the Cartesian3 positions from orbit points.
 * Useful for passing directly to Cesium PolylineCollection.
 */
export function orbitPointsToPositions(points: OrbitPoint[]): Cartesian3[] {
  return points.map((p) => p.position);
}
