import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import type { BBox } from 'geojson';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { useCluster, isCluster, zoomToCameraHeight } from '../hooks/useCluster';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'active_fires';
const CLUSTER_COLOR = Cesium.Color.fromCssColorString('#ff6b35');

function frpToColor(frp: number): Cesium.Color {
  if (frp > 100) return Cesium.Color.fromCssColorString('#ff2a2a');
  if (frp > 50) return Cesium.Color.fromCssColorString('#ff6b35');
  if (frp > 20) return Cesium.Color.fromCssColorString('#ffaa00');
  return Cesium.Color.fromCssColorString('#ff8844');
}

function clusterSize(count: number): number {
  if (count >= 500) return 18;
  if (count >= 100) return 14;
  if (count >= 10) return 11;
  return 8;
}

function FireLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const pointCollectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const billboardCollectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const labelCollectionRef = useRef<Cesium.LabelCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const moveListenerRef = useRef<Cesium.Event.RemoveCallback | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pointFeatures = useMemo(() => {
    if (!data?.features) return [];
    return data.features
      .filter((f) => f.geometry?.type === 'Point')
      .map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: f.geometry.coordinates as [number, number] },
        properties: f.properties,
      }));
  }, [data]);

  const { clusters, updateClusters, getClusterExpansionZoom } = useCluster(
    pointFeatures as GeoJSON.Feature<GeoJSON.Point>[],
    { radius: 80, maxZoom: 12 },
  );

  // Create collections + click handler
  useEffect(() => {
    if (!viewer) return;

    const pointCollection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(pointCollection);
    pointCollectionRef.current = pointCollection;

    const bbCollection = new Cesium.BillboardCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(bbCollection);
    billboardCollectionRef.current = bbCollection;

    const labelCollection = new Cesium.LabelCollection({ scene: viewer.scene });
    viewer.scene.primitives.add(labelCollection);
    labelCollectionRef.current = labelCollection;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (!Cesium.defined(picked)) return;
      // Cluster click → zoom in
      if (picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        if (typeof id === 'string' && id.startsWith('fire_cluster_')) {
          const clusterId = parseInt(id.replace('fire_cluster_', ''), 10);
          const expansionZoom = getClusterExpansionZoom(clusterId);
          const height = zoomToCameraHeight(expansionZoom + 1);
          const pos = picked.primitive.position;
          if (pos) {
            const carto = Cesium.Cartographic.fromCartesian(pos);
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, height),
            });
          }
          return;
        }
      }
      // Individual point click
      if (picked.primitive instanceof Cesium.PointPrimitive) {
        const id = picked.primitive.id as string;
        const feature = featureMapRef.current.get(id);
        if (feature) selectFeature(feature);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) { handlerRef.current.destroy(); handlerRef.current = null; }
      if (pointCollectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(pointCollectionRef.current);
      if (billboardCollectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(billboardCollectionRef.current);
      if (labelCollectionRef.current && !viewer.isDestroyed()) viewer.scene.primitives.remove(labelCollectionRef.current);
      pointCollectionRef.current = null;
      billboardCollectionRef.current = null;
      labelCollectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer, selectFeature, getClusterExpansionZoom]);

  // Camera move → update clusters
  const handleCameraMove = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const rect = viewer.camera.computeViewRectangle();
      if (!rect) return;
      const bbox: BBox = [
        Cesium.Math.toDegrees(rect.west), Cesium.Math.toDegrees(rect.south),
        Cesium.Math.toDegrees(rect.east), Cesium.Math.toDegrees(rect.north),
      ];
      updateClusters(bbox, viewer.camera.positionCartographic.height);
    }, 200);
  }, [viewer, updateClusters]);

  useEffect(() => {
    if (!viewer) return;
    const removeListener = viewer.camera.changed.addEventListener(handleCameraMove);
    moveListenerRef.current = removeListener;
    handleCameraMove();
    return () => {
      if (moveListenerRef.current) { moveListenerRef.current(); moveListenerRef.current = null; }
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    };
  }, [viewer, handleCameraMove]);

  // Render clusters/points
  useEffect(() => {
    const pc = pointCollectionRef.current;
    const bc = billboardCollectionRef.current;
    const lc = labelCollectionRef.current;
    if (!pc || !bc || !lc || !viewer) return;

    pc.removeAll(); bc.removeAll(); lc.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('fire_');

    for (const feature of clusters) {
      const [lon, lat] = feature.geometry.coordinates;
      const position = Cesium.Cartesian3.fromDegrees(lon, lat);

      if (isCluster(feature)) {
        const count = feature.properties.point_count;
        const size = clusterSize(count);
        bc.add({ position, image: createCircleImage(size * 2, CLUSTER_COLOR), width: size * 2, height: size * 2, id: `fire_cluster_${feature.properties.cluster_id}` });
        lc.add({ position, text: count >= 1000 ? `${Math.round(count / 1000)}k` : String(count), font: '10px sans-serif', fillColor: Cesium.Color.WHITE, style: Cesium.LabelStyle.FILL, horizontalOrigin: Cesium.HorizontalOrigin.CENTER, verticalOrigin: Cesium.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY });
      } else {
        const props = feature.properties as LayerFeature['properties'];
        const id = (props?.id as string) ?? `fire_${lon}_${lat}`;
        const frp = (props?.frp as number) || 0;
        pc.add({ position, pixelSize: Math.max(3, Math.min(6, frp / 20 + 3)), color: frpToColor(frp), outlineColor: Cesium.Color.fromCssColorString('rgba(255, 100, 0, 0.3)'), outlineWidth: 1, id, disableDepthTestDistance: Number.POSITIVE_INFINITY });
        const feat: LayerFeature = { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props as LayerFeature['properties'] };
        featureMapRef.current.set(id, feat);
        registerFeature(id, feat);
      }
    }

    if (!viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, clusters]);

  // Sync status
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
    if (pointCollectionRef.current) pointCollectionRef.current.show = visible;
    if (billboardCollectionRef.current) billboardCollectionRef.current.show = visible;
    if (labelCollectionRef.current) labelCollectionRef.current.show = visible;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [viewer, visible]);

  return null;
}

const circleCache = new Map<string, HTMLCanvasElement>();
function createCircleImage(diameter: number, color: Cesium.Color): HTMLCanvasElement {
  const key = `${diameter}_${color.toCssColorString()}`;
  if (circleCache.has(key)) return circleCache.get(key)!;
  const canvas = document.createElement('canvas');
  canvas.width = diameter; canvas.height = diameter;
  const ctx = canvas.getContext('2d')!;
  const r = diameter / 2;
  ctx.beginPath(); ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fillStyle = color.withAlpha(0.85).toCssColorString(); ctx.fill();
  ctx.strokeStyle = color.withAlpha(1.0).toCssColorString(); ctx.lineWidth = 2; ctx.stroke();
  circleCache.set(key, canvas);
  return canvas;
}

export default FireLayer;
