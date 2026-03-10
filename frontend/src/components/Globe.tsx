import { useEffect, useRef } from 'react';
import {
  Viewer,
  Entity,
  PolygonGraphics,
  PointGraphics,
} from 'resium';
import {
  Cartesian3,
  Color,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  Ion,
  createWorldTerrainAsync,
  ScreenSpaceEventHandler,
} from 'cesium';
import type { EarthquakeData, WeatherData } from '../types';

// Use empty token for community terrain access
Ion.defaultAccessToken = '';

interface GlobeProps {
  earthquakes: EarthquakeData | null;
  weather: WeatherData | null;
  onMouseMove: (coords: { lat: number; lng: number }) => void;
  searchTarget: string | null;
  onSearchComplete: () => void;
}

function Globe({ earthquakes, weather, onMouseMove, searchTarget, onSearchComplete }: GlobeProps) {
  const viewerRef = useRef<any>(null);
  const handlerRef = useRef<any>(null);

  // Setup mouse move handler for coordinate display
  useEffect(() => {
    if (!viewerRef.current?.cesiumElement) return;

    const viewer = viewerRef.current.cesiumElement;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: any) => {
      const cartesian = viewer.camera.pickEllipsoid(
        movement.endPosition,
        viewer.scene.globe.ellipsoid
      );
      if (cartesian) {
        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onMouseMove({ lat, lng });
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    handlerRef.current = handler;

    return () => {
      handler.destroy();
    };
  }, [onMouseMove]);

  // Handle search target
  useEffect(() => {
    if (!searchTarget || !viewerRef.current?.cesiumElement) return;

    const viewer = viewerRef.current.cesiumElement;

    // Simple geocoding: try to parse as coordinates first
    const coordMatch = searchTarget.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, 1000000),
        duration: 2,
      });
      onSearchComplete();
      return;
    }

    // Otherwise, use basic city lookup (simplified for Phase 1)
    const cities: Record<string, [number, number]> = {
      'new york': [-74.006, 40.7128],
      'los angeles': [-118.2437, 34.0522],
      'chicago': [-87.6298, 41.8781],
      'houston': [-95.3698, 29.7604],
      'phoenix': [-112.074, 33.4484],
      'san francisco': [-122.4194, 37.7749],
      'seattle': [-122.3321, 47.6062],
      'denver': [-104.9903, 39.7392],
      'miami': [-80.1918, 25.7617],
      'boston': [-71.0589, 42.3601],
      'washington': [-77.0369, 38.9072],
      'dc': [-77.0369, 38.9072],
    };

    const searchLower = searchTarget.toLowerCase();
    const coords = cities[searchLower];

    if (coords) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(coords[0], coords[1], 1000000),
        duration: 2,
      });
    } else {
      console.warn('City not found:', searchTarget);
    }

    onSearchComplete();
  }, [searchTarget, onSearchComplete]);

  // Get color based on earthquake magnitude
  const getEarthquakeColor = (mag: number): Color => {
    if (mag >= 6.0) return Color.RED;
    if (mag >= 5.0) return Color.ORANGE;
    if (mag >= 4.0) return Color.YELLOW;
    if (mag >= 3.0) return Color.YELLOWGREEN;
    return Color.LIGHTGREEN;
  };

  // Get color based on weather severity
  const getWeatherColor = (severity: string): Color => {
    switch (severity?.toLowerCase()) {
      case 'extreme':
        return Color.RED.withAlpha(0.5);
      case 'severe':
        return Color.ORANGE.withAlpha(0.5);
      case 'moderate':
        return Color.YELLOW.withAlpha(0.5);
      case 'minor':
        return Color.LIGHTBLUE.withAlpha(0.4);
      default:
        return Color.GRAY.withAlpha(0.3);
    }
  };

  return (
    <Viewer
      ref={viewerRef}
      full
      timeline={false}
      animation={false}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      infoBox={true}
      sceneModePicker={false}
      selectionIndicator={true}
      navigationHelpButton={false}
      terrainProvider={createWorldTerrainAsync()}
    >
      {/* Earthquake markers */}
      {earthquakes?.features.map((quake) => {
        const [lng, lat, depth] = quake.geometry.coordinates;
        const mag = quake.properties.mag;
        const size = Math.max(5, mag * 3);

        return (
          <Entity
            key={quake.id}
            name={quake.properties.title}
            description={`
              <div>
                <h3>${quake.properties.title}</h3>
                <p><strong>Magnitude:</strong> ${mag}</p>
                <p><strong>Location:</strong> ${quake.properties.place}</p>
                <p><strong>Depth:</strong> ${depth.toFixed(1)} km</p>
                <p><strong>Time:</strong> ${new Date(quake.properties.time).toLocaleString()}</p>
                <p><a href="${quake.properties.url}" target="_blank">More info</a></p>
              </div>
            `}
            position={Cartesian3.fromDegrees(lng, lat)}
          >
            <PointGraphics pixelSize={size} color={getEarthquakeColor(mag)} />
          </Entity>
        );
      })}

      {/* Weather alert polygons */}
      {weather?.features.map((alert) => {
        if (!alert.geometry?.coordinates) return null;

        // Convert GeoJSON polygon to Cesium format
        const positions = alert.geometry.coordinates[0].map(([lng, lat]) =>
          Cartesian3.fromDegrees(lng, lat)
        );

        return (
          <Entity
            key={alert.id}
            name={alert.properties.event}
            description={`
              <div>
                <h3>${alert.properties.headline}</h3>
                <p><strong>Event:</strong> ${alert.properties.event}</p>
                <p><strong>Severity:</strong> ${alert.properties.severity}</p>
                <p><strong>Area:</strong> ${alert.properties.areaDesc}</p>
                <p><strong>Effective:</strong> ${new Date(alert.properties.effective).toLocaleString()}</p>
                <p><strong>Expires:</strong> ${new Date(alert.properties.expires).toLocaleString()}</p>
                <p>${alert.properties.description}</p>
                ${alert.properties.instruction ? `<p><strong>Instructions:</strong> ${alert.properties.instruction}</p>` : ''}
              </div>
            `}
          >
            <PolygonGraphics
              hierarchy={positions}
              material={getWeatherColor(alert.properties.severity)}
              outline={true}
              outlineColor={Color.WHITE}
              outlineWidth={2}
            />
          </Entity>
        );
      })}
    </Viewer>
  );
}

export default Globe;
