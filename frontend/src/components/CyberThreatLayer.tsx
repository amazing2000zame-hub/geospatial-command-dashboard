import { useRef, useEffect, useCallback } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'cyber_threats';

// Attack type color mapping
const COLORS = {
  ddos:     '#ef4444', // red
  scanning: '#f97316', // orange
  malware:  '#a855f7', // purple
  probe:    '#a855f7', // purple
  exchange: '#22d3ee', // cyan for IXP targets
};

function attackColor(attackType: string): string {
  return COLORS[attackType as keyof typeof COLORS] || COLORS.probe;
}

function attackCesiumColor(attackType: string): Cesium.Color {
  return Cesium.Color.fromCssColorString(attackColor(attackType));
}

// --- Canvas icon creation with glow effect ---
const iconCache = new Map<string, HTMLCanvasElement>();

function createGlowIcon(size: number, color: string): HTMLCanvasElement {
  const key = `glow_${size}_${color}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const canvas = document.createElement('canvas');
  const totalSize = size * 3; // extra space for glow
  canvas.width = totalSize;
  canvas.height = totalSize;
  const ctx = canvas.getContext('2d')!;
  const cx = totalSize / 2;
  const cy = totalSize / 2;
  const innerRadius = size / 2;

  // Outer glow ring
  const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, innerRadius * 2.5);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.4, color.replace(')', ', 0.4)').replace('rgb(', 'rgba('));
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Inner solid circle
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Bright center highlight
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();

  iconCache.set(key, canvas);
  return canvas;
}

function createExchangeIcon(size: number): HTMLCanvasElement {
  const key = `ixp_${size}`;
  if (iconCache.has(key)) return iconCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Diamond shape for exchange points
  ctx.beginPath();
  ctx.moveTo(cx, 2);
  ctx.lineTo(size - 2, cy);
  ctx.lineTo(cx, size - 2);
  ctx.lineTo(2, cy);
  ctx.closePath();
  ctx.fillStyle = COLORS.exchange;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  iconCache.set(key, canvas);
  return canvas;
}

/**
 * Compute an arc from point A to point B with a midpoint raised in altitude.
 * Returns [lon1, lat1, alt1, lonMid, latMid, altMid, lon2, lat2, alt2]
 */
function computeArcPositions(
  lonA: number, latA: number,
  lonB: number, latB: number,
): number[] {
  // Midpoint in degrees
  const midLon = (lonA + lonB) / 2;
  const midLat = (latA + latB) / 2;

  // Rough distance in meters for altitude calculation
  const dLon = (lonB - lonA) * Math.cos(((latA + latB) / 2) * Math.PI / 180) * 111320;
  const dLat = (latB - latA) * 111320;
  const dist = Math.sqrt(dLon * dLon + dLat * dLat);

  // Arc height: distance / 4, clamped between 50km and 2000km
  const altitude = Math.min(Math.max(dist / 4, 50000), 2000000);

  return [
    lonA, latA, 0,
    midLon, midLat, altitude,
    lonB, latB, 0,
  ];
}

function CyberThreatLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const billboardCollectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const polylineCollectionRef = useRef<Cesium.PolylineCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Initialize primitive collections and click handler
  useEffect(() => {
    if (!viewer) return;

    const bc = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(bc);
    billboardCollectionRef.current = bc;

    const plc = new Cesium.PolylineCollection();
    viewer.scene.primitives.add(plc);
    polylineCollectionRef.current = plc;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked)) return;
      if (picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        if (typeof id === 'string') {
          const feature = featureMapRef.current.get(id);
          if (feature) selectFeature(feature);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (billboardCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(billboardCollectionRef.current);
      }
      if (polylineCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(polylineCollectionRef.current);
      }
      billboardCollectionRef.current = null;
      polylineCollectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer, selectFeature]);

  // Render features when data changes
  useEffect(() => {
    const bc = billboardCollectionRef.current;
    const plc = polylineCollectionRef.current;
    if (!bc || !plc || !viewer || !data?.features) return;

    bc.removeAll();
    plc.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('cyber-');

    for (const feature of data.features) {
      if (feature.geometry?.type !== 'Point') continue;
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties;
      const id = props.id as string;
      const featureType = props.featureType as string;
      const position = Cesium.Cartesian3.fromDegrees(lon, lat);

      if (featureType === 'exchange_point') {
        // IXP target points
        bc.add({
          position,
          image: createExchangeIcon(24),
          width: 24,
          height: 24,
          id,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      } else {
        // Attacker source points
        const attackType = (props.attackType as string) || 'probe';
        const reports = (props.reports as number) || 1;
        const severity = Number(props.severity) || 0;

        // Size proportional to report count (min 10, max 32)
        const baseSize = 10 + Math.min(severity * 22, 22);
        const color = attackColor(attackType);

        bc.add({
          position,
          image: createGlowIcon(Math.round(baseSize), color),
          width: Math.round(baseSize * 3),
          height: Math.round(baseSize * 3),
          id,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });

        // Attack arc from source to nearest exchange point
        const arcTarget = props.arcTarget as [number, number] | undefined;
        if (arcTarget && arcTarget.length === 2) {
          const [targetLon, targetLat] = arcTarget;
          const arcPositions = computeArcPositions(lon, lat, targetLon, targetLat);

          const cesiumColor = attackCesiumColor(attackType);

          plc.add({
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(arcPositions),
            width: 2,
            material: Cesium.Material.fromType('PolylineGlow', {
              glowPower: 0.2,
              color: cesiumColor,
            }),
          });
        }
      }

      // Register feature for hover tooltip and click detail
      const feat: LayerFeature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: props as LayerFeature['properties'],
      };
      featureMapRef.current.set(id, feat);
      registerFeature(id, feat);
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, data]);

  // Update layer status
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
    if (billboardCollectionRef.current) billboardCollectionRef.current.show = visible;
    if (polylineCollectionRef.current) polylineCollectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

export default CyberThreatLayer;
