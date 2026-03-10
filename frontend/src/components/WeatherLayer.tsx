import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import { LayerFeature, LayerFeatureCollection } from '../types/geojson';
import { severityToColor } from '../utils/cesiumHelpers';

interface WeatherLayerProps {
  viewer: Cesium.Viewer | null;
  data: LayerFeatureCollection | null;
  visible: boolean;
  onSelectFeature: (feature: LayerFeature | null) => void;
}

function WeatherLayer({ viewer, data, visible, onSelectFeature }: WeatherLayerProps) {
  const dataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const featuresRef = useRef<LayerFeature[]>([]);

  // Set up click handler when viewer becomes available
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
        // Match entity back to feature by name (which we set to the feature id)
        const entityName = picked.id.name;
        const feature = featuresRef.current.find(
          (f) => f.properties.id === entityName,
        );
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
      if (dataSourceRef.current && viewer && !viewer.isDestroyed()) {
        viewer.dataSources.remove(dataSourceRef.current, true);
      }
      dataSourceRef.current = null;
      featuresRef.current = [];
    };
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data when it changes
  useEffect(() => {
    if (!viewer) return;

    // Remove previous data source
    if (dataSourceRef.current && !viewer.isDestroyed()) {
      viewer.dataSources.remove(dataSourceRef.current, true);
      dataSourceRef.current = null;
    }

    featuresRef.current = [];

    if (!data || !data.features || data.features.length === 0) return;

    // Filter to features with valid, non-null geometry
    const validFeatures = data.features.filter(
      (f) =>
        f.geometry !== null &&
        f.geometry !== undefined &&
        f.geometry.coordinates !== null &&
        f.geometry.coordinates !== undefined,
    );

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
          // Try to find the matching feature for this entity
          const matchingFeature = validFeatures.find(
            (f) => f.properties.id === entity.name,
          );

          const severity = matchingFeature
            ? (matchingFeature.properties.severity as string)
            : 'unknown';

          // Set entity name to feature id for click lookup
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
