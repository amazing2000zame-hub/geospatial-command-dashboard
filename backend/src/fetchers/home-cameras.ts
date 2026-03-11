import { BaseFetcher } from './BaseFetcher.js';
import type {
  LayerFeatureCollection,
  LayerFeature,
} from '../types/geojson.js';

/**
 * Home Cameras Layer — Frigate/Home Assistant cameras + Plate Recognizer ALPR
 *
 * Shows live camera pins at home location.
 * Click to view MJPEG stream via HA proxy.
 * Also fetches recent ALPR detections from Plate Recognizer.
 */

// Camera definitions — placeholder coords, update when real location known
const HOME_LAT = 40.2;
const HOME_LNG = -74.8;

const CAMERAS = [
  {
    id: 'cam-front',
    name: 'Front Door Camera',
    entityId: 'camera.192_168_1_61',
    lat: HOME_LAT + 0.0001,
    lng: HOME_LNG - 0.0001,
  },
  {
    id: 'cam-back',
    name: 'Back Camera',
    entityId: 'camera.192_168_1_61_2',
    lat: HOME_LAT - 0.0001,
    lng: HOME_LNG + 0.0001,
  },
];

const HA_BASE = 'http://192.168.1.54:8123';
const HA_TOKEN = process.env.HA_BEARER_TOKEN || '';
const PLATE_RECOGNIZER_TOKEN =
  process.env.PLATE_RECOGNIZER_TOKEN || 'e721887952c39fdf93b013905a10dc2a934141bd';

interface ALPRResult {
  plate: string;
  confidence: number;
  timestamp: string;
  camera: string;
  region?: string;
  vehicle?: { type: string; make?: string; color?: string };
}

interface RawCameraData {
  cameras: typeof CAMERAS;
  alprResults: ALPRResult[];
  haAvailable: boolean;
}

export class HomeCameraFetcher extends BaseFetcher {
  readonly sourceId = 'home_cameras';
  readonly displayName = 'Home Cameras';
  readonly defaultInterval = '0 */2 * * * *';
  readonly cacheTTL = 120;

  async fetchRaw(): Promise<RawCameraData> {
    let haAvailable = false;

    // Check if HA is reachable
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${HA_BASE}/api/`, {
        signal: controller.signal,
        headers: HA_TOKEN
          ? { Authorization: `Bearer ${HA_TOKEN}` }
          : {},
      });
      haAvailable = res.ok;
    } catch {
      haAvailable = false;
    }

    // Fetch recent ALPR detections (Plate Recognizer stats endpoint)
    const alprResults: ALPRResult[] = [];
    // Note: Plate Recognizer Cloud API is for sending images, not retrieving results.
    // In production, this would query a local ALPR result store.
    // For now, we provide the camera features with ALPR capability metadata.

    return {
      cameras: CAMERAS,
      alprResults,
      haAvailable,
    };
  }

  normalize(raw: unknown): LayerFeatureCollection {
    const data = raw as RawCameraData;
    const now = Date.now();
    const features: LayerFeature[] = [];

    for (const cam of data.cameras) {
      const streamUrl = data.haAvailable && HA_TOKEN
        ? `${HA_BASE}/api/camera_proxy_stream/${cam.entityId}?token=${HA_TOKEN}`
        : null;
      const snapshotUrl = data.haAvailable && HA_TOKEN
        ? `${HA_BASE}/api/camera_proxy/${cam.entityId}?token=${HA_TOKEN}`
        : null;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [cam.lng, cam.lat],
        },
        properties: {
          id: cam.id,
          layer: 'home_cameras',
          label: cam.name,
          timestamp: Math.floor(now / 1000),
          category: 'camera',
          severity: 0.1,
          entityId: cam.entityId,
          streamUrl,
          snapshotUrl,
          haAvailable: data.haAvailable,
          alprEnabled: true,
          plateRecognizerToken: PLATE_RECOGNIZER_TOKEN,
        },
      });
    }

    // Add ALPR detection features (if any)
    for (const alpr of data.alprResults) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [HOME_LNG, HOME_LAT],
        },
        properties: {
          id: `alpr-${alpr.plate}-${alpr.timestamp}`,
          layer: 'home_cameras',
          label: `Plate: ${alpr.plate}`,
          timestamp: Math.floor(new Date(alpr.timestamp).getTime() / 1000),
          category: 'alpr_detection',
          severity: 0.3,
          plate: alpr.plate,
          confidence: alpr.confidence,
          camera: alpr.camera,
          region: alpr.region || null,
          vehicleType: alpr.vehicle?.type || null,
          vehicleMake: alpr.vehicle?.make || null,
          vehicleColor: alpr.vehicle?.color || null,
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        source: 'home_cameras',
        fetchedAt: now,
        count: features.length,
        nextUpdate: now + this.cacheTTL * 1000,
      },
    };
  }
}
