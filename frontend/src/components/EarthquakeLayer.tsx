import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { magnitudeToColor, magnitudeToSize } from '../utils/cesiumHelpers';
import { registerFeature, clearLayerFeatures } from '../store/featureRegistry';
import type { LayerFeature } from '../types/geojson';

const LAYER_ID = 'earthquakes';

function EarthquakeLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const collectionRef = useRef<Cesium.PointPrimitiveCollection | null>(null);
  const featureMapRef = useRef<Map<string, LayerFeature>>(new Map());
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Create PointPrimitiveCollection + click handler when viewer is available
  useEffect(() => {
    if (!viewer) return;

    const collection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(collection);
    collectionRef.current = collection;

    // Click handler for feature selection
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (Cesium.defined(picked) && picked.primitive instanceof Cesium.PointPrimitive) {
        const id = picked.primitive.id as string;
        const feature = featureMapRef.current.get(id);
        if (feature) {
          selectFeature(feature);
          return;
        }
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
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store status with hook state
  useEffect(() => {
    if (loading) {
      setLayerStatus(LAYER_ID, 'loading', 0);
    } else if (error) {
      setLayerStatus(LAYER_ID, 'error', 0, error);
    } else if (data) {
      const count = data.features?.length ?? 0;
      setLayerStatus(LAYER_ID, 'active', count);
      setLayerUpdated(LAYER_ID);
    }
  }, [data, loading, error, setLayerStatus, setLayerUpdated]);

  // Update points when data changes
  useEffect(() => {
    const collection = collectionRef.current;
    if (!collection || !viewer) return;

    collection.removeAll();
    featureMapRef.current.clear();
    clearLayerFeatures('eq_');

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
        registerFeature(id, feature);
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
