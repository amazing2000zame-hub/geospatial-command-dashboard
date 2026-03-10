import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { LayerFeature, LayerFeatureCollection } from '../types/geojson';

interface FlightLayerProps {
  viewer: Cesium.Viewer | null;
  data: LayerFeatureCollection | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

/**
 * Color an aircraft billboard by altitude band.
 *   ground       → gray
 *   low  <10kft  → green
 *   mid  10-30k  → cyan
 *   cruise >30k  → white
 */
function altitudeToColor(altitudeFt: number, onGround: boolean): Cesium.Color {
  if (onGround) return Cesium.Color.GRAY;
  if (altitudeFt < 10_000) return Cesium.Color.LIME;
  if (altitudeFt < 30_000) return Cesium.Color.CYAN;
  return Cesium.Color.WHITE;
}

function FlightLayer({ viewer, data, visible, onSelectFeature }: FlightLayerProps) {
  const collectionRef = useRef<Cesium.BillboardCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create the BillboardCollection when viewer becomes available
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.BillboardCollection({
      scene: viewer.scene,
    });
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    // Set up click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.Billboard) {
        const id = picked.primitive.id as string;
        const feature = featureMapRef.current.get(id);
        if (feature) {
          onSelectFeature(feature);
          return;
        }
      }
      // Don't clear selection on miss -- let other layers handle that
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
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update billboards when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    featureMapRef.current.clear();

    if (data && data.features) {
      for (const feature of data.features) {
        if (
          !feature.geometry ||
          feature.geometry.type !== 'Point' ||
          !Array.isArray(feature.geometry.coordinates)
        ) {
          continue;
        }

        const coords = feature.geometry.coordinates as number[];
        const lon = coords[0];
        const lat = coords[1];
        const id = feature.properties.id;

        const altitudeFt = (feature.properties.altitudeFt as number) || 0;
        const onGround = (feature.properties.onGround as boolean) || false;
        const trueTrack = (feature.properties.trueTrack as number | null) ?? 0;

        // Convert heading degrees to radians; CesiumJS rotation is counter-clockwise
        // and the SVG points north (up), so we negate the track angle
        const rotationRad = -Cesium.Math.toRadians(trueTrack);

        const color = altitudeToColor(altitudeFt, onGround);

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          image: '/icons/aircraft.svg',
          width: 24,
          height: 24,
          rotation: rotationRad,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          color,
          id,
        });

        featureMapRef.current.set(id, feature);
      }
    }

    if (!viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [viewer, data]);

  // Toggle visibility
  useEffect(() => {
    const collection = collectionRef.current;
    if (collection) {
      collection.show = visible;
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }
  }, [viewer, visible]);

  return null;
}

export default FlightLayer;
