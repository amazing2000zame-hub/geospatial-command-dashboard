import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'flights';

function altitudeToColor(altitudeFt: number, onGround: boolean): Cesium.Color {
  if (onGround) return Cesium.Color.fromCssColorString('#6a7580');
  if (altitudeFt < 10_000) return Cesium.Color.fromCssColorString('#34d399');
  if (altitudeFt < 30_000) return Cesium.Color.fromCssColorString('#a78bfa');
  return Cesium.Color.fromCssColorString('#c8d0d8');
}

const MILITARY_COLOR = Cesium.Color.fromCssColorString('#ff2a2a');

function FlightLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create BillboardCollection + click handler
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        const feature = featureMapRef.current.get(id);
        if (feature) selectFeature(feature);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (collectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(collectionRef.current);
      }
      collectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer, selectFeature]);

  // Update billboards when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('flight_');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;

        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id;
        const altitudeFt = (feature.properties.altitudeFt as number) || 0;
        const onGround = (feature.properties.onGround as boolean) || false;
        const trueTrack = (feature.properties.trueTrack as number | null) ?? 0;
        const rotationRad = -Cesium.Math.toRadians(trueTrack);
        const isMilitary = (feature.properties.isMilitary as boolean) || false;
        const color = isMilitary ? MILITARY_COLOR : altitudeToColor(altitudeFt, onGround);
        const size = isMilitary ? 24 : 20;

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: '/icons/aircraft.svg',
          width: size,
          height: size,
          rotation: rotationRad,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          color,
          id,
        });

        featureMapRef.current.set(id, feature);
        registerFeature(id, feature);
      }

      setLayerStatus(LAYER_ID, 'active', data.features.length);
      setLayerUpdated(LAYER_ID);
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, data, setLayerStatus, setLayerUpdated]);

  // Sync status from loading/error
  useEffect(() => {
    if (loading) setLayerStatus(LAYER_ID, 'loading', 0);
    if (error) setLayerStatus(LAYER_ID, 'error', 0, error);
  }, [loading, error, setLayerStatus]);

  // Toggle visibility
  useEffect(() => {
    const collection = collectionRef.current;
    if (collection) {
      collection.show = visible;
      if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }
  }, [viewer, visible]);

  return null;
}

export default FlightLayer;
