import { useRef, useEffect, useCallback } from 'react';
import { useCesium } from 'resium';
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
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';
import { computeOrbitPath, orbitPointsToPositions } from '../utils/orbitPath';

const LAYER_ID = 'satellites';
const SATELLITE_ICON = 'icons/satellite.svg';

interface SatelliteRecord {
  satrec: SatRec;
  feature: LayerFeature;
  billboard: Cesium.Billboard | null;
}

function altitudeToScale(altitudeKm: number): number {
  if (altitudeKm > 35000) return 1.0;
  if (altitudeKm > 10000) return 0.8;
  if (altitudeKm > 1000) return 0.6;
  return 0.45;
}

function SatelliteLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const polylineCollectionRef = useRef<Cesium.PolylineCollection | null>(null);
  const satellitesRef = useRef<Map<string, SatelliteRecord>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const preRenderRef = useRef<Cesium.Event.RemoveCallback | null>(null);
  const orbitPolylineRef = useRef<Cesium.Polyline | null>(null);

  // Propagation: runs every frame, updates billboard positions in-place
  const propagatePositions = useCallback(() => {
    const satellites = satellitesRef.current;
    if (satellites.size === 0) return;

    const now = new Date();
    const gmst = gstime(now);

    for (const [, record] of satellites) {
      if (!record.billboard) continue;
      try {
        const posVel = propagate(record.satrec, now);
        if (!posVel || !posVel.position) continue;
        const geo = eciToGeodetic(posVel.position, gmst);
        const lat = degreesLat(geo.latitude);
        const lon = degreesLong(geo.longitude);
        const altitudeKm = geo.height;
        record.billboard.position = Cesium.Cartesian3.fromDegrees(lon, lat, altitudeKm * 1000);
        record.billboard.scale = altitudeToScale(altitudeKm);
      } catch { /* skip failed propagation */ }
    }
  }, []);

  // Create collections + click handler + preRender
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    const polylineCollection = new Cesium.PolylineCollection();
    viewer.scene.primitives.add(polylineCollection);
    polylineCollectionRef.current = polylineCollection;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        const record = satellitesRef.current.get(id);
        if (record) {
          selectFeature(record.feature);
          // Draw orbital path
          clearOrbitPath();
          const orbitPoints = computeOrbitPath(record.satrec);
          if (orbitPoints.length >= 2 && polylineCollectionRef.current) {
            orbitPolylineRef.current = polylineCollectionRef.current.add({
              positions: orbitPointsToPositions(orbitPoints),
              width: 1.5,
              material: Cesium.Material.fromType('Color', { color: Cesium.Color.CYAN.withAlpha(0.5) }),
            });
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    const removeCallback = viewer.scene.preRender.addEventListener(propagatePositions);
    preRenderRef.current = removeCallback;

    return () => {
      if (preRenderRef.current) { preRenderRef.current(); preRenderRef.current = null; }
      if (handlerRef.current) { handlerRef.current.destroy(); handlerRef.current = null; }
      if (polylineCollectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(polylineCollectionRef.current);
      if (collectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(collectionRef.current);
      polylineCollectionRef.current = null;
      collectionRef.current = null;
      orbitPolylineRef.current = null;
      satellitesRef.current.clear();
    };
  }, [viewer, selectFeature, propagatePositions]);

  function clearOrbitPath() {
    if (orbitPolylineRef.current && polylineCollectionRef.current) {
      polylineCollectionRef.current.remove(orbitPolylineRef.current);
      orbitPolylineRef.current = null;
    }
  }

  // Rebuild satellites when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    satellitesRef.current.clear();
    clearOrbitPath();
    clearLayerFeatures('sat_');

    if (!data?.features) return;

    const now = new Date();
    const gmst = gstime(now);
    let count = 0;

    for (const feature of data.features) {
      const tleLine1 = feature.properties.tleLine1 as string | undefined;
      const tleLine2 = feature.properties.tleLine2 as string | undefined;
      if (!tleLine1 || !tleLine2) continue;

      try {
        const satrec = twoline2satrec(tleLine1, tleLine2);
        const posVel = propagate(satrec, now);
        if (!posVel || !posVel.position) continue;

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
          id,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });

        satellitesRef.current.set(id, { satrec, feature, billboard });
        registerFeature(id, feature);
        count++;
      } catch { continue; }
    }

    setLayerStatus(LAYER_ID, 'active', count);
    setLayerUpdated(LAYER_ID);
    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, data, setLayerStatus, setLayerUpdated]);

  // Sync loading/error status
  useEffect(() => {
    if (loading) setLayerStatus(LAYER_ID, 'loading', 0);
    if (error) setLayerStatus(LAYER_ID, 'error', 0, error);
  }, [loading, error, setLayerStatus]);

  // Toggle visibility
  useEffect(() => {
    if (collectionRef.current) collectionRef.current.show = visible;
    if (polylineCollectionRef.current) polylineCollectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default SatelliteLayer;
