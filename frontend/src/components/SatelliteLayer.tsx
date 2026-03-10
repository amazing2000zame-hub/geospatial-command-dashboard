import { useRef, useEffect, useCallback } from 'react';
import * as Cesium from 'cesium';
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from 'satellite.js';
import type { SatRec } from 'satellite.js';
import { LayerFeature, LayerFeatureCollection } from '../types/geojson';
import { computeOrbitPath, orbitPointsToPositions } from '../utils/orbitPath';

interface SatelliteLayerProps {
  viewer: Cesium.Viewer | null;
  data: LayerFeatureCollection | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

interface SatelliteRecord {
  satrec: SatRec;
  feature: LayerFeature;
  billboard: Cesium.Billboard | null;
}

// Icon base path
const SATELLITE_ICON = 'icons/satellite.svg';

// Billboard scale by altitude band
function altitudeToScale(altitudeKm: number): number {
  if (altitudeKm > 35000) return 1.0;     // GEO
  if (altitudeKm > 10000) return 0.8;     // MEO
  if (altitudeKm > 1000) return 0.6;      // High LEO
  return 0.45;                             // Low LEO
}

function SatelliteLayer({ viewer, data, visible, onSelectFeature }: SatelliteLayerProps) {
  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const polylineCollectionRef = useRef<Cesium.PolylineCollection | null>(null);
  const satellitesRef = useRef<Map<string, SatelliteRecord>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const preRenderRef = useRef<Cesium.Event.RemoveCallback | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const orbitPolylineRef = useRef<Cesium.Polyline | null>(null);

  // Propagation callback: runs every frame, updates billboard positions in-place
  const propagatePositions = useCallback(() => {
    const satellites = satellitesRef.current;
    if (satellites.size === 0) return;

    const now = new Date();
    const gmst = gstime(now);

    for (const [, record] of satellites) {
      if (!record.billboard) continue;

      try {
        const posVel = propagate(record.satrec, now);
        if (!posVel || !posVel.position) {
          continue;
        }

        const geo = eciToGeodetic(posVel.position, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const altitudeKm = geo.height;

        // Update billboard position in-place (no remove/re-add)
        record.billboard.position = Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          altitudeKm * 1000,
        );
        record.billboard.scale = altitudeToScale(altitudeKm);
      } catch {
        // Skip satellites where propagation fails at this time
      }
    }
  }, []);

  // Create BillboardCollection + PolylineCollection + click handler + preRender hook
  useEffect(() => {
    if (!viewer) return;

    // Create billboard collection for satellite icons
    const collection = new Cesium.BillboardCollection({
      scene: viewer.scene,
    });
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    // Create polyline collection for orbital paths
    const polylineCollection = new Cesium.PolylineCollection();
    viewer.scene.primitives.add(polylineCollection);
    polylineCollectionRef.current = polylineCollection;

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        const record = satellitesRef.current.get(id);
        if (record) {
          onSelectFeature(record.feature);
          selectedIdRef.current = id;

          // Draw orbital path for selected satellite
          drawOrbitPath(record.satrec);
          return;
        }
      }
      // Clicked empty space — deselect
      onSelectFeature(null);
      selectedIdRef.current = null;
      clearOrbitPath();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    // Hook into scene.preRender for real-time propagation
    const removeCallback = viewer.scene.preRender.addEventListener(propagatePositions);
    preRenderRef.current = removeCallback;

    return () => {
      // Cleanup
      if (preRenderRef.current) {
        preRenderRef.current();
        preRenderRef.current = null;
      }
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (polylineCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(polylineCollectionRef.current);
      }
      polylineCollectionRef.current = null;
      orbitPolylineRef.current = null;
      if (collectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(collectionRef.current);
      }
      collectionRef.current = null;
      satellitesRef.current.clear();
      selectedIdRef.current = null;
    };
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: draw orbit path polyline for a selected satellite
  function drawOrbitPath(satrec: SatRec) {
    const polylines = polylineCollectionRef.current;
    if (!polylines) return;

    clearOrbitPath();

    const orbitPoints = computeOrbitPath(satrec);
    if (orbitPoints.length < 2) return;

    const positions = orbitPointsToPositions(orbitPoints);
    const polyline = polylines.add({
      positions,
      width: 1.5,
      material: Cesium.Material.fromType('Color', {
        color: Cesium.Color.CYAN.withAlpha(0.5),
      }),
    });
    orbitPolylineRef.current = polyline;
  }

  // Helper: clear orbit path
  function clearOrbitPath() {
    const polylines = polylineCollectionRef.current;
    if (!polylines) return;

    if (orbitPolylineRef.current) {
      polylines.remove(orbitPolylineRef.current);
      orbitPolylineRef.current = null;
    }
  }

  // Rebuild satellites when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    // Clear existing
    collection.removeAll();
    satellitesRef.current.clear();
    clearOrbitPath();
    selectedIdRef.current = null;

    if (!data || !data.features) return;

    const now = new Date();
    const gmst = gstime(now);

    for (const feature of data.features) {
      const tleLine1 = feature.properties.tleLine1 as string | undefined;
      const tleLine2 = feature.properties.tleLine2 as string | undefined;

      if (!tleLine1 || !tleLine2) continue;

      try {
        const satrec = twoline2satrec(tleLine1, tleLine2);

        // Compute initial position
        const posVel = propagate(satrec, now);
        if (!posVel || !posVel.position) {
          continue;
        }

        const geo = eciToGeodetic(posVel.position, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const altitudeKm = geo.height;

        const id = feature.properties.id;

        const billboard = collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, altitudeKm * 1000),
          image: SATELLITE_ICON,
          scale: altitudeToScale(altitudeKm),
          color: Cesium.Color.CYAN,
          id: id,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });

        satellitesRef.current.set(id, { satrec, feature, billboard });
      } catch {
        // Skip invalid TLE entries
        continue;
      }
    }

    if (!viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [viewer, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle visibility
  useEffect(() => {
    const collection = collectionRef.current;
    if (collection) {
      collection.show = visible;
    }
    const polylines = polylineCollectionRef.current;
    if (polylines) {
      polylines.show = visible;
    }
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [viewer, visible]);

  return null;
}

export default SatelliteLayer;
