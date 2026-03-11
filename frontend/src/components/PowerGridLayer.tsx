import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'power_grid';

const iconCache = new Map<string, HTMLCanvasElement>();

function createPlantIcon(plantType: string, typeColor: string): HTMLCanvasElement {
  const key = `power_${plantType}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const s = 24;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;

  // Diamond shape for power plant
  ctx.beginPath();
  ctx.moveTo(cx, cy - 9);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx, cy + 9);
  ctx.lineTo(cx - 9, cy);
  ctx.closePath();
  ctx.fillStyle = typeColor + '33';
  ctx.fill();
  ctx.strokeStyle = typeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Type icon
  ctx.fillStyle = typeColor;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const symbols: Record<string, string> = {
    nuclear: '\u2622', // ☢
    hydro: '\u{1F4A7}', // 💧
    wind: '\u{1F32C}', // 🌬
    solar: '\u2600', // ☀
    coal: '\u{1F525}', // 🔥
    gas: '\u{1F525}',
  };
  ctx.fillText(symbols[plantType] || '\u26A1', cx, cy);

  iconCache.set(key, canvas);
  return canvas;
}

function createOutageIcon(severity: number): HTMLCanvasElement {
  const sev = Math.round(severity * 10);
  const key = `outage_${sev}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const cx = s / 2;
  const cy = s / 2;

  // Red pulsing circle - size by severity
  const radius = 6 + severity * 8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const r = Math.round(200 + severity * 55);
  ctx.fillStyle = `rgba(${r}, 50, 50, ${0.3 + severity * 0.4})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${r}, 80, 80, 0.8)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lightning bolt
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u26A1', cx, cy);

  iconCache.set(key, canvas);
  return canvas;
}

function PowerGridLayer() {
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
    clearLayerFeatures('grid-');
    clearLayerFeatures('outage-');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point') continue;
        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;
        const featureKind = feature.properties.featureKind as string;

        let image: HTMLCanvasElement;
        let size: number;

        if (featureKind === 'outage') {
          const severity = Number(feature.properties.severity) || 0;
          image = createOutageIcon(severity);
          size = 32;
        } else {
          const plantType = (feature.properties.plantType as string) || 'other';
          const typeColor = (feature.properties.typeColor as string) || '#6b7280';
          image = createPlantIcon(plantType, typeColor);
          size = 24;
        }

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image,
          width: size,
          height: size,
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

export default PowerGridLayer;
