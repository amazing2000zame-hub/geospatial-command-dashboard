import { useRef, useEffect, useCallback, useMemo } from 'react';
import * as Cesium from 'cesium';
import type { BBox } from 'geojson';
import { useLayerData } from '../hooks/useLayerData';
import { useCluster, isCluster, type PointOrCluster } from '../hooks/useCluster';
import type { LayerFeature } from '../types/geojson';

interface ALPRLayerProps {
  viewer: Cesium.Viewer | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

// Red color for ALPR cameras
const CLUSTER_COLOR = Cesium.Color.fromCssColorString('#ef4444');
const POINT_COLOR = Cesium.Color.fromCssColorString('#dc2626');

function clusterSize(count: number): number {
  // Aggressive sizing for potentially large clusters
  if (count >= 5000) return 32;
  if (count >= 1000) return 26;
  if (count >= 100) return 20;
  if (count >= 10) return 14;
  return 10;
}

function ALPRLayer({ viewer, visible, onSelectFeature }: ALPRLayerProps) {
  const { data } = useLayerData('alpr');
  const pointCollectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const billboardCollectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const labelCollectionRef = useRef<Cesium.LabelCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const moveListenerRef = useRef<Cesium.Event.RemoveCallback | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract Point features for Supercluster
  const pointFeatures = useMemo(() => {
    if (!data?.features) return [];
    return data.features
      .filter((f) => f.geometry?.type === 'Point')
      .map((f) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: f.geometry.coordinates as [number, number],
        },
        properties: f.properties,
      }));
  }, [data]);

  // Aggressive clustering for potentially large datasets
  const { clusters, updateClusters } = useCluster(
    pointFeatures as GeoJSON.Feature<GeoJSON.Point>[],
    { radius: 80, maxZoom: 16 },
  );

  // Create collections and click handler
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

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(
      (event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(event.position);
        if (Cesium.defined(picked)) {
          // Check both point primitives and billboards (clusters)
          if (picked.primitive instanceof Cesium.PointPrimitive) {
            const id = picked.primitive.id as string;
            const feature = featureMapRef.current.get(id);
            if (feature) {
              onSelectFeature(feature);
              return;
            }
          }
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (pointCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(pointCollectionRef.current);
      }
      if (billboardCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(billboardCollectionRef.current);
      }
      if (labelCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(labelCollectionRef.current);
      }
      pointCollectionRef.current = null;
      billboardCollectionRef.current = null;
      labelCollectionRef.current = null;
      featureMapRef.current.clear();
    };
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Camera move listener to update clusters
  const handleCameraMove = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const camera = viewer.camera;
      const rect = camera.computeViewRectangle();
      if (!rect) return;

      const bbox: BBox = [
        Cesium.Math.toDegrees(rect.west),
        Cesium.Math.toDegrees(rect.south),
        Cesium.Math.toDegrees(rect.east),
        Cesium.Math.toDegrees(rect.north),
      ];

      const height = camera.positionCartographic.height;
      updateClusters(bbox, height);
    }, 200);
  }, [viewer, updateClusters]);

  useEffect(() => {
    if (!viewer) return;

    const removeListener = viewer.camera.changed.addEventListener(handleCameraMove);
    moveListenerRef.current = removeListener;

    // Trigger an initial update
    handleCameraMove();

    return () => {
      if (moveListenerRef.current) {
        moveListenerRef.current();
        moveListenerRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [viewer, handleCameraMove]);

  // Render clusters/points
  useEffect(() => {
    const pointCollection = pointCollectionRef.current;
    const bbCollection = billboardCollectionRef.current;
    const labelCollection = labelCollectionRef.current;
    if (!pointCollection || !bbCollection || !labelCollection || !viewer) return;

    pointCollection.removeAll();
    bbCollection.removeAll();
    labelCollection.removeAll();
    featureMapRef.current.clear();

    for (const feature of clusters) {
      const coords = feature.geometry.coordinates;
      const lon = coords[0];
      const lat = coords[1];
      const position = Cesium.Cartesian3.fromDegrees(lon, lat);

      if (isCluster(feature)) {
        const count = feature.properties.point_count;
        const size = clusterSize(count);

        // Draw cluster as a red circle billboard
        bbCollection.add({
          position,
          image: createCircleImage(size * 2, CLUSTER_COLOR),
          width: size * 2,
          height: size * 2,
          id: `alpr_cluster_${feature.properties.cluster_id}`,
        });

        // Add count label
        labelCollection.add({
          position,
          text: count >= 1000 ? `${Math.round(count / 1000)}k` : String(count),
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      } else {
        // Individual ALPR camera -- lightweight point primitive
        const props = feature.properties as LayerFeature['properties'];
        const id = (props?.id as string) ?? `alpr_${lon}_${lat}`;

        pointCollection.add({
          position,
          pixelSize: 6,
          color: POINT_COLOR,
          outlineColor: Cesium.Color.fromCssColorString('#991b1b'),
          outlineWidth: 1,
          id,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });

        featureMapRef.current.set(id, {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: props as LayerFeature['properties'],
        });
      }
    }

    if (!viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [viewer, clusters]);

  // Toggle visibility
  useEffect(() => {
    if (pointCollectionRef.current) {
      pointCollectionRef.current.show = visible;
    }
    if (billboardCollectionRef.current) {
      billboardCollectionRef.current.show = visible;
    }
    if (labelCollectionRef.current) {
      labelCollectionRef.current.show = visible;
    }
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [viewer, visible]);

  return null;
}

// Canvas-based circle image generator (cached)
const circleCache = new Map<string, HTMLCanvasElement>();

function createCircleImage(diameter: number, color: Cesium.Color): HTMLCanvasElement {
  const key = `${diameter}_${color.toCssColorString()}`;
  if (circleCache.has(key)) return circleCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = diameter;
  canvas.height = diameter;
  const ctx = canvas.getContext('2d')!;

  const radius = diameter / 2;
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
  ctx.fillStyle = color.withAlpha(0.85).toCssColorString();
  ctx.fill();
  ctx.strokeStyle = color.withAlpha(1.0).toCssColorString();
  ctx.lineWidth = 2;
  ctx.stroke();

  circleCache.set(key, canvas);
  return canvas;
}

export default ALPRLayer;
