import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'traffic_cameras';
const ICON_SIZE = 32;

const iconCache = new Map<string, HTMLCanvasElement>();

function createCameraIcon(): HTMLCanvasElement {
  const key = 'traffic_camera_icon';
  if (iconCache.has(key)) return iconCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const r = ICON_SIZE / 2 - 2;

  // Green circle background
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(22, 163, 74, 1.0)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Camera lens shape (inner circle with smaller dot)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();

  iconCache.set(key, canvas);
  return canvas;
}

function TrafficCameraLayer() {
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
    clearLayerFeatures('traffic_cam_');

    if (data?.features) {
      const icon = createCameraIcon();

      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;

        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: icon,
          width: ICON_SIZE,
          height: ICON_SIZE,
          id,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });

        featureMapRef.current.set(id, feature);
        registerFeature(id, feature);
      }

      setLayerStatus(LAYER_ID, 'active', data.features.length);
      setLayerUpdated(LAYER_ID);
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, data, setLayerStatus, setLayerUpdated]);

  // Sync loading/error status
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

export default TrafficCameraLayer;
