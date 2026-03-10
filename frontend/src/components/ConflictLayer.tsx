import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'conflict_events';

const iconCache = new Map<string, HTMLCanvasElement>();

function createConflictIcon(isMilitary: boolean, severity: number): HTMLCanvasElement {
  const key = `conflict_${isMilitary}_${severity.toFixed(1)}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const s = 36;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;

  if (isMilitary) {
    // Military: red diamond with crosshair — larger, bolder
    const color = severity >= 0.75 ? '#ff2a2a' : severity >= 0.5 ? '#ff6b35' : '#ef4444';

    // Outer glow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-11, -11, 22, 22);
    ctx.fillStyle = `${color}15`;
    ctx.fill();
    ctx.restore();

    // Diamond
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-8, -8, 16, 16);
    ctx.fillStyle = `${color}33`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Inner crosshair
    ctx.strokeStyle = `${color}aa`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    // Civilian conflict: orange/red triangle — larger
    const color = severity >= 0.75 ? '#ff6b35' : '#ffaa00';

    // Outer glow
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 12, cy + 9);
    ctx.lineTo(cx - 12, cy + 9);
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

    // Triangle
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 10, cy + 7);
    ctx.lineTo(cx - 10, cy + 7);
    ctx.closePath();
    ctx.fillStyle = `${color}33`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Exclamation mark
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + 1);
  }

  iconCache.set(key, canvas);
  return canvas;
}

function ConflictLayer() {
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
    clearLayerFeatures('conflict_');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point') continue;
        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;
        const isMilitary = (feature.properties.isMilitary as boolean) || false;
        const severity = Number(feature.properties.severity) || 0;

        const icon = createConflictIcon(isMilitary, severity);

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: icon,
          width: 36,
          height: 36,
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

export default ConflictLayer;
