import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'home_cameras';

const iconCache = new Map<string, HTMLCanvasElement>();

function createCameraIcon(category: string): HTMLCanvasElement {
  const key = `homecam_${category}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const s = 28;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;

  if (category === 'alpr_detection') {
    // License plate icon - yellow
    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - 10, cy - 5, 20, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLATE', cx, cy);
  } else {
    // Camera icon - cyan/green
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#00ffc8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Camera lens
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00ffc8';
    ctx.fill();

    // Recording dot
    ctx.beginPath();
    ctx.arc(cx + 7, cy - 7, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
  }

  iconCache.set(key, canvas);
  return canvas;
}

function HomeCameraLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

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
      if (handlerRef.current) { handlerRef.current.destroy(); handlerRef.current = null; }
      if (collectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(collectionRef.current);
      collectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer, selectFeature]);

  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('cam-');
    clearLayerFeatures('alpr-');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point') continue;
        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;
        const category = (feature.properties.category as string) || 'camera';

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: createCameraIcon(category),
          width: 28,
          height: 28,
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

  useEffect(() => {
    if (loading) setLayerStatus(LAYER_ID, 'loading', 0);
    if (error) setLayerStatus(LAYER_ID, 'error', 0, error);
  }, [loading, error, setLayerStatus]);

  useEffect(() => {
    if (collectionRef.current) collectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default HomeCameraLayer;
