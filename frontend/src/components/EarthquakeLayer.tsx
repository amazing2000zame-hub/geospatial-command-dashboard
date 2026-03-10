import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { LayerFeature, LayerFeatureCollection } from '../types/geojson';
import { magnitudeToColor, magnitudeToSize } from '../utils/cesiumHelpers';

interface EarthquakeLayerProps {
  viewer: Cesium.Viewer | null;
  data: LayerFeatureCollection | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

function EarthquakeLayer({ viewer, data, visible, onSelectFeature }: EarthquakeLayerProps) {
  const collectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create the PointPrimitiveCollection when viewer becomes available
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    // Set up click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.PointPrimitive) {
        const id = picked.primitive.id as string;
        const feature = featureMapRef.current.get(id);
        if (feature) {
          onSelectFeature(feature);
          return;
        }
      }
      onSelectFeature(null);
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

  // Update points when data changes
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
        const mag = (feature.properties.mag as number) || 1;
        const id = feature.properties.id;

        collection.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          pixelSize: magnitudeToSize(mag),
          color: magnitudeToColor(mag),
          id: id,
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

export default EarthquakeLayer;
