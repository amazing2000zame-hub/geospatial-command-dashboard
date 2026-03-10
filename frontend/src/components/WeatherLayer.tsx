import { useRef, useEffect } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useLayerData } from '../hooks/useLayerData';
import { useLayerStore } from '../store/layerStore';
import { useUiStore } from '../store/uiStore';
import { severityToColor } from '../utils/cesiumHelpers';
import type { LayerFeature, LayerFeatureCollection } from '../types/geojson';

const LAYER_ID = 'weather';

function WeatherLayer() {
  const { viewer } = useCesium();
  const { data, loading, error } = useLayerData(LAYER_ID);
  const visible = useLayerStore((s) => s.layers[LAYER_ID]?.visible ?? true);
  const setLayerStatus = useLayerStore((s) => s.setLayerStatus);
  const setLayerUpdated = useLayerStore((s) => s.setLayerUpdated);
  const selectFeature = useUiStore((s) => s.selectFeature);

  const dataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const featuresRef = useRef<LayerFeature[]>([]);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);

  // Set up click handler when viewer is available
  useEffect(() => {
    if (!viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position);
      if (
        Cesium.defined(picked) &&
        picked.id instanceof Cesium.Entity &&
        dataSourceRef.current &&
        dataSourceRef.current.entities.contains(picked.id)
      ) {
        const entityName = picked.id.name;
        const feature = featuresRef.current.find(
          (f) => f.properties.id === entityName,
        );
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
      if (dataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(dataSourceRef.current, true);
      }
      dataSourceRef.current = null;
      featuresRef.current = [];
    };
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store status with hook state
  useEffect(() => {
    if (loading) {
      setLayerStatus(LAYER_ID, 'loading', 0);
    } else if (error) {
      setLayerStatus(LAYER_ID, 'error', 0, error);
    } else if (data) {
      const validCount = data.features?.filter(
        (f) => f.geometry !== null && f.geometry !== undefined &&
               f.geometry.coordinates !== null && f.geometry.coordinates !== undefined
      ).length ?? 0;
      setLayerStatus(LAYER_ID, 'active', validCount);
      setLayerUpdated(LAYER_ID);
    }
  }, [data, loading, error, setLayerStatus, setLayerUpdated]);

  // Load GeoJSON data when it changes
  useEffect(() => {
    if (!viewer) return;

    // Remove previous data source
    if (dataSourceRef.current && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dataSourceRef.current, true);
      dataSourceRef.current = null;
    }

    featuresRef.current = [];

    if (!data || !data.features || data.features.length === 0) return;

    // Filter to features with valid geometry within US bounds
    // NWS data is US-only; polygons outside these bounds are malformed
    // and cause rendering artifacts (red cross-hatch over Africa/Europe)
    const validFeatures = data.features.filter((f) => {
      if (!f.geometry || !f.geometry.coordinates) return false;
      // For polygons, check that coordinates fall within reasonable US bounds
      if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        try {
          const coordStr = JSON.stringify(f.geometry.coordinates);
          // Extract all numbers - quick bounds check on first ring
          const nums = coordStr.match(/-?\d+\.?\d*/g)?.map(Number) || [];
          for (let i = 0; i < nums.length; i += 2) {
            const lon = nums[i];
            const lat = nums[i + 1];
            // Reject if any coordinate is outside extended US/territories bounds
            if (lon < -180 || lon > 0 || lat < 10 || lat > 75) return false;
          }
        } catch { return false; }
      }
      return true;
    });

    if (validFeatures.length === 0) return;

    featuresRef.current = validFeatures;

    const filteredGeoJSON: LayerFeatureCollection = {
      type: 'FeatureCollection',
      features: validFeatures,
      metadata: data.metadata,
    };

    const ds = new Cesium.GeoJsonDataSource('weather-alerts');

    ds.load(filteredGeoJSON as unknown as Cesium.Resource, {
      stroke: Cesium.Color.WHITE,
      strokeWidth: 2,
      fill: Cesium.Color.YELLOW.withAlpha(0.3),
      clampToGround: true,
    })
      .then((loadedDs) => {
        // Style entities based on severity
        const entities = loadedDs.entities.values;
        for (const entity of entities) {
          const matchingFeature = validFeatures.find(
            (f) => f.properties.id === entity.name,
          );

          const severity = matchingFeature
            ? (matchingFeature.properties.severity as string)
            : 'unknown';

          if (matchingFeature) {
            entity.name = matchingFeature.properties.id;
          }

          if (entity.polygon) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(
              severityToColor(severity),
            );
          }
        }

        if (!viewer.isDestroyed()) {
          viewer.dataSources.add(loadedDs);
          loadedDs.show = visible;
          dataSourceRef.current = loadedDs;
          viewer.scene.requestRender();
        }
      })
      .catch((err: unknown) => {
        console.error('WeatherLayer: failed to load GeoJSON data', err);
      });
  }, [viewer, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle visibility
  useEffect(() => {
    if (dataSourceRef.current) {
      dataSourceRef.current.show = visible;
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }
  }, [viewer, visible]);

  return null;
}

export default WeatherLayer;
