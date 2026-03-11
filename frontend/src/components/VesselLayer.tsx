import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'vessels';

/** Category → color mapping */
const CATEGORY_COLORS: Record<string, string> = {
  cargo: '#22c55e',
  tanker: '#f59e0b',
  military: '#ef4444',
  passenger: '#3b82f6',
  fishing: '#06b6d4',
  utility: '#a78bfa',
  pleasure: '#f472b6',
  other: '#6b7280',
};

/** Create a small ship/triangle icon on a canvas, rotated by heading, colored by category */
const iconCache = new Map<string, HTMLCanvasElement>();

function createVesselIcon(category: string, headingDeg: number): HTMLCanvasElement {
  // Quantize heading to 5-degree increments for cache efficiency
  const quantizedHeading = Math.round(headingDeg / 5) * 5;
  const key = `vessel_${category}_${quantizedHeading}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;

  // Rotate canvas around center
  const rad = (quantizedHeading * Math.PI) / 180;
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.translate(-cx, -cy);

  // Draw a ship/triangle shape pointing up (north = 0 degrees)
  ctx.beginPath();
  ctx.moveTo(cx, 1);           // top point (bow)
  ctx.lineTo(cx + 5, size - 3); // bottom right
  ctx.lineTo(cx, size - 5);     // bottom center notch (stern)
  ctx.lineTo(cx - 5, size - 3); // bottom left
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  iconCache.set(key, canvas);
  return canvas;
}

function VesselLayer() {
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
    clearLayerFeatures('vessel-');

    if (data?.features) {
      for (const feature of data.features) {
        if (!feature.geometry || feature.geometry.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;

        const [lon, lat] = feature.geometry.coordinates as number[];
        const id = feature.properties.id as string;
        const category = (feature.properties.category as string) || 'other';
        const heading = (feature.properties.heading as number) ?? 0;
        // AIS heading 511 means not available
        const headingDeg = heading === 511 || heading == null ? 0 : heading;

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: createVesselIcon(category, headingDeg),
          width: 16,
          height: 16,
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

  // Sync status from loading/error
  useEffect(() => {
    if (loading) setLayerStatus(LAYER_ID, 'loading', 0);
    if (error) setLayerStatus(LAYER_ID, 'error', 0, error);
  }, [loading, error, setLayerStatus]);

  // Toggle visibility
  useEffect(() => {
    if (collectionRef.current) collectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default VesselLayer;
