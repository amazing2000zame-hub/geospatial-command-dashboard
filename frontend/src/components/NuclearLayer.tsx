import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'nuclear_facilities';

function statusToColors(status: string): { fill: string; stroke: string } {
  switch (status) {
    case 'operating':
      return { fill: '#22c55e', stroke: '#15803d' }; // green
    case 'shutdown':
      return { fill: '#9ca3af', stroke: '#6b7280' }; // gray
    case 'under_construction':
      return { fill: '#f97316', stroke: '#c2410c' }; // orange
    case 'decommissioning':
      return { fill: '#eab308', stroke: '#a16207' }; // yellow
    default:
      return { fill: '#22c55e', stroke: '#15803d' };
  }
}

// Canvas cache keyed by status
const iconCache = new Map<string, HTMLCanvasElement>();

function createNuclearIcon(status: string): HTMLCanvasElement {
  if (iconCache.has(status)) return iconCache.get(status)!;

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const { fill, stroke } = statusToColors(status);

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Radiation trefoil symbol
  ctx.fillStyle = status === 'shutdown' ? '#374151' : '#000000';

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Three blades of the trefoil
  const bladeRadius = 8;
  const innerRadius = 3.5;
  const bladeAngle = Math.PI / 3; // 60 degrees per blade

  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2; // Start from top
    ctx.beginPath();
    ctx.arc(cx, cy, bladeRadius, angle - bladeAngle / 2, angle + bladeAngle / 2);
    ctx.arc(cx, cy, innerRadius, angle + bladeAngle / 2, angle - bladeAngle / 2, true);
    ctx.closePath();
    ctx.fill();
  }

  iconCache.set(status, canvas);
  return canvas;
}

function NuclearLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create billboard collection + click handler
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked)) return;

      if (picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        if (typeof id === 'string' && id.startsWith('nuke-')) {
          const feature = featureMapRef.current.get(id);
          if (feature) selectFeature(feature);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) { handlerRef.current.destroy(); handlerRef.current = null; }
      if (collectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(collectionRef.current);
      }
      collectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer, selectFeature]);

  // Render billboards when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('nuke-');

    if (!data?.features) return;

    for (const feature of data.features) {
      if (feature.geometry.type !== 'Point') continue;

      const [lon, lat] = feature.geometry.coordinates as [number, number];
      if (!isFinite(lon) || !isFinite(lat)) continue;

      const id = feature.properties.id;
      const status = (feature.properties.category as string) || 'operating';
      const position = Cesium.Cartesian3.fromDegrees(lon, lat);

      collection.add({
        position,
        image: createNuclearIcon(status),
        width: 24,
        height: 24,
        id,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });

      featureMapRef.current.set(id, feature);
      registerFeature(id, feature);
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
    if (collectionRef.current) collectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default NuclearLayer;
