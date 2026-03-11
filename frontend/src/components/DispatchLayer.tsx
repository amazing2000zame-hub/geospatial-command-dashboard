import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'dispatch';

const iconCache = new Map<string, HTMLCanvasElement>();

function createDispatchIcon(category: string): HTMLCanvasElement {
  const key = `dispatch_${category}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const s = 28;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;

  const isFire = category === 'fire';
  const color = isFire ? '#ff6b35' : '#38bdf8';

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = `${color}22`;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Icon
  ctx.fillStyle = color;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isFire ? '\u{1F525}' : '+', cx, cy);

  iconCache.set(key, canvas);
  return canvas;
}

function DispatchLayer() {
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
    clearLayerFeatures('dispatch_');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point') continue;
        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;
        const category = (feature.properties.category as string) || 'ems';

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: createDispatchIcon(category),
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

export default DispatchLayer;
