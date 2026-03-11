import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'submarine_cables';
const MAX_CABLES = 300;
const MAX_LINE_SEGMENTS = 5000;
const DEFAULT_COLOR = '#00ffff';

function SubmarineCableLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const polylineCollectionRef = useRef<Cesium.PolylineCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  // Map from polyline index in the collection to feature ID
  const polylineToFeatureRef = useRef<Map<number, string>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create polyline collection + click handler
  useEffect(() => {
    if (!viewer) return;

    const pc = new Cesium.PolylineCollection();
    viewer.scene.primitives.add(pc);
    polylineCollectionRef.current = pc;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked)) return;

      if (picked.primitive instanceof Cesium.Polyline) {
        // Find which polyline was picked by checking the id
        const id = picked.id as string | undefined;
        if (id && typeof id === 'string') {
          const feature = featureMapRef.current.get(id);
          if (feature) selectFeature(feature);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) { handlerRef.current.destroy(); handlerRef.current = null; }
      if (polylineCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(polylineCollectionRef.current);
      }
      polylineCollectionRef.current = null;
      featureMapRef.current.clear();
      polylineToFeatureRef.current.clear();
    };
  }, [viewer, selectFeature]);

  // Render polylines when data changes
  useEffect(() => {
    const pc = polylineCollectionRef.current;
    if (!pc || !viewer) return;

    pc.removeAll();
    featureMapRef.current.clear();
    polylineToFeatureRef.current.clear();
    clearLayerFeatures('cable-');

    if (!data?.features) return;

    let cableCount = 0;
    let segmentCount = 0;
    let polylineIndex = 0;

    for (const feature of data.features) {
      if (cableCount >= MAX_CABLES) break;
      if (segmentCount >= MAX_LINE_SEGMENTS) break;

      const geom = feature.geometry;
      if (geom.type !== 'MultiLineString') continue;

      const coords = geom.coordinates as number[][][];
      if (!coords || !Array.isArray(coords)) continue;

      const featureId = feature.properties.id;
      const cableColor = (feature.properties.cableColor as string) || DEFAULT_COLOR;

      let cesiumColor: Cesium.Color;
      try {
        cesiumColor = Cesium.Color.fromCssColorString(cableColor);
      } catch {
        cesiumColor = Cesium.Color.fromCssColorString(DEFAULT_COLOR);
      }

      const material = Cesium.Material.fromType('PolylineGlow', {
        glowPower: 0.15,
        color: cesiumColor,
      });

      // Register this feature for click detection
      featureMapRef.current.set(featureId, feature);
      registerFeature(featureId, feature);

      for (const lineCoords of coords) {
        if (segmentCount >= MAX_LINE_SEGMENTS) break;
        if (!Array.isArray(lineCoords) || lineCoords.length < 2) continue;

        // Flatten coordinates for Cesium: [lon, lat, lon, lat, ...]
        const flatCoords: number[] = [];
        for (const coord of lineCoords) {
          if (Array.isArray(coord) && coord.length >= 2) {
            flatCoords.push(coord[0], coord[1]);
          }
        }

        if (flatCoords.length < 4) continue; // need at least 2 points

        const positions = Cesium.Cartesian3.fromDegreesArray(flatCoords);

        pc.add({
          positions,
          width: 2,
          material,
          id: featureId,
        });

        polylineToFeatureRef.current.set(polylineIndex, featureId);
        polylineIndex++;
        segmentCount++;
      }

      cableCount++;
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, data]);

  // Sync loading/error status
  useEffect(() => {
    if (loading) setLayerStatus(LAYER_ID, 'loading', 0);
    else if (error) setLayerStatus(LAYER_ID, 'error', 0, error);
    else if (data?.features) {
      setLayerStatus(LAYER_ID, 'active', data.features.length);
      setLayerUpdated(LAYER_ID);
    }
  }, [data, loading, error, setLayerStatus, setLayerUpdated]);

  // Visibility toggle
  useEffect(() => {
    if (polylineCollectionRef.current) polylineCollectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default SubmarineCableLayer;
