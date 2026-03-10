import { useRef, useEffect, useCallback, useMemo } from 'react';
import * as Cesium from 'cesium';
import type { BBox } from 'geojson';
import { useLayerData } from '../hooks/useLayerData';
import { useCluster, isCluster, type PointOrCluster } from '../hooks/useCluster';
import type { LayerFeature } from '../types/geojson';

interface SpeedCameraLayerProps {
  viewer: Cesium.Viewer | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

// Yellow color for speed cameras
const CLUSTER_COLOR = Cesium.Color.fromCssColorString('#fbbf24');
const CAMERA_COLOR = Cesium.Color.fromCssColorString('#f59e0b');

function clusterSize(count: number): number {
  // Scale cluster circle size by point count
  if (count >= 1000) return 28;
  if (count >= 100) return 22;
  if (count >= 10) return 16;
  return 12;
}

function SpeedCameraLayer({ viewer, visible, onSelectFeature }: SpeedCameraLayerProps) {
  const { data } = useLayerData('speed_cameras');
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

  const { clusters, updateClusters } = useCluster(
    pointFeatures as GeoJSON.Feature<GeoJSON.Point>[],
    { radius: 60, maxZoom: 18 },
  );

  // Create collections and click handler
  useEffect(() => {
    if (!viewer) return;

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
        if (
          Cesium.defined(picked) &&
          picked.primitive instanceof Cesium.Billboard
        ) {
          const id = picked.primitive.id as string;
          const feature = featureMapRef.current.get(id);
          if (feature) {
            onSelectFeature(feature);
            return;
          }
        }
        // Don't deselect here -- let other layers handle that
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (billboardCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(billboardCollectionRef.current);
      }
      if (labelCollectionRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(labelCollectionRef.current);
      }
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

  // Render clusters/points into the billboard collection
  useEffect(() => {
    const bbCollection = billboardCollectionRef.current;
    const labelCollection = labelCollectionRef.current;
    if (!bbCollection || !labelCollection || !viewer) return;

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

        // Draw cluster as a colored circle billboard
        bbCollection.add({
          position,
          image: createCircleImage(size * 2, CLUSTER_COLOR),
          width: size * 2,
          height: size * 2,
          id: `speed_cluster_${feature.properties.cluster_id}`,
        });

        // Add count label
        labelCollection.add({
          position,
          text: count >= 1000 ? `${Math.round(count / 1000)}k` : String(count),
          font: '11px sans-serif',
          fillColor: Cesium.Color.BLACK,
          style: Cesium.LabelStyle.FILL,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      } else {
        // Individual speed camera
        const props = feature.properties as LayerFeature['properties'];
        const id = (props?.id as string) ?? `speed_${lon}_${lat}`;

        bbCollection.add({
          position,
          image: createSpeedCameraIcon(),
          width: 20,
          height: 20,
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

// Speed camera icon generator (cached)
let speedCameraCanvas: HTMLCanvasElement | null = null;

function createSpeedCameraIcon(): HTMLCanvasElement {
  if (speedCameraCanvas) return speedCameraCanvas;

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Draw a simple speed camera icon: yellow circle with "S" text
  ctx.beginPath();
  ctx.arc(12, 12, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Camera lens (inner circle)
  ctx.beginPath();
  ctx.arc(12, 12, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#78350f';
  ctx.fill();

  // Flash indicator
  ctx.beginPath();
  ctx.arc(12, 12, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();

  speedCameraCanvas = canvas;
  return canvas;
}

export default SpeedCameraLayer;
