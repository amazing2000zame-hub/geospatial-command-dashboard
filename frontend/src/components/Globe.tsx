import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Viewer as ResiumViewer, Entity, PointGraphics, PolygonGraphics } from 'resium';
import {
  Ion, OpenStreetMapImageryProvider, Terrain, Viewer,
  Cartesian3, Color, Cartographic, Math as CesiumMath,
  ScreenSpaceEventHandler, ScreenSpaceEventType
} from 'cesium';
import SearchBar from './SearchBar';
import CoordinateDisplay from './CoordinateDisplay';

interface EarthquakeFeature {
  id: string;
  properties: { mag: number; place: string; time: number; title: string; url: string };
  geometry: { coordinates: [number, number, number] };
}

interface WeatherFeature {
  id: string;
  properties: { event: string; headline: string; severity: string; areaDesc: string; effective: string; expires: string; description: string; instruction?: string };
  geometry?: { coordinates: number[][][] };
}

function Globe() {
  const viewerRef = useRef<{ cesiumElement: Viewer | null }>(null);
  const [earthquakes, setEarthquakes] = useState<EarthquakeFeature[]>([]);
  const [weather, setWeather] = useState<WeatherFeature[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [connected, setConnected] = useState(false);

  const osmProvider = useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }), []);

  // Fetch data from backend
  const fetchData = useCallback(async () => {
    try {
      const [eqRes, wxRes] = await Promise.all([
        fetch('/api/layers/earthquakes'),
        fetch('/api/layers/weather')
      ]);
      if (eqRes.ok) {
        const eqData = await eqRes.json();
        setEarthquakes(eqData.features || []);
      }
      if (wxRes.ok) {
        const wxData = await wxRes.json();
        setWeather((wxData.features || []).filter((f: WeatherFeature) => f.geometry?.coordinates));
      }
      setConnected(true);
    } catch (e) {
      console.error('Fetch error:', e);
      setConnected(false);
    }
  }, []);

  // Poll every 60s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Configure viewer + set default camera to US
  useEffect(() => {
    let attempts = 0;
    const configure = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) { attempts++; if (attempts < 20) setTimeout(configure, 250); return; }

      viewer.scene.globe.enableLighting = true;
      viewer.scene.fog.enabled = true;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

      if (!Ion.defaultAccessToken) {
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(osmProvider);
      }

      // Fly to US on load
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(-98.5, 39.8, 15000000),
      });

      // Mouse move for coordinates
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const carto = Cartographic.fromCartesian(cartesian);
          setCoords({ lat: CesiumMath.toDegrees(carto.latitude), lng: CesiumMath.toDegrees(carto.longitude) });
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);
    };
    configure();
  }, [osmProvider]);

  const getEqColor = (mag: number) => {
    if (mag >= 6) return Color.RED;
    if (mag >= 5) return Color.ORANGE;
    if (mag >= 4) return Color.YELLOW;
    if (mag >= 3) return Color.YELLOWGREEN;
    return Color.LIGHTGREEN;
  };

  const getWxColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'extreme': return Color.RED.withAlpha(0.5);
      case 'severe': return Color.ORANGE.withAlpha(0.5);
      case 'moderate': return Color.YELLOW.withAlpha(0.5);
      case 'minor': return Color.LIGHTBLUE.withAlpha(0.4);
      default: return Color.GRAY.withAlpha(0.3);
    }
  };

  const getViewer = useCallback((): Viewer | null => viewerRef.current?.cesiumElement ?? null, []);

  return (
    <ResiumViewer
      ref={viewerRef as any}
      full
      timeline={false}
      animation={false}
      baseLayerPicker={false}
      geocoder={false}
      homeButton={false}
      sceneModePicker={false}
      navigationHelpButton={false}
      infoBox={true}
      selectionIndicator={true}
    >
      <SearchBar getViewer={getViewer} />
      <CoordinateDisplay getViewer={getViewer} coords={coords} connected={connected} eqCount={earthquakes.length} wxCount={weather.length} />

      {earthquakes.map((eq) => {
        const [lng, lat, depth] = eq.geometry.coordinates;
        const mag = eq.properties.mag || 0;
        return (
          <Entity
            key={eq.id}
            name={eq.properties.title}
            description={`<h3>${eq.properties.title}</h3><p><b>Magnitude:</b> ${mag}</p><p><b>Depth:</b> ${depth?.toFixed(1)} km</p><p><b>Time:</b> ${new Date(eq.properties.time).toLocaleString()}</p><p><a href="${eq.properties.url}" target="_blank">USGS Details</a></p>`}
            position={Cartesian3.fromDegrees(lng, lat)}
          >
            <PointGraphics pixelSize={Math.max(4, mag * 3)} color={getEqColor(mag)} outlineColor={Color.BLACK} outlineWidth={1} />
          </Entity>
        );
      })}

      {weather.map((wx) => {
        if (!wx.geometry?.coordinates?.[0]) return null;
        try {
          const positions = wx.geometry.coordinates[0].map(([lng, lat]: number[]) => Cartesian3.fromDegrees(lng, lat));
          return (
            <Entity
              key={wx.id}
              name={wx.properties.event}
              description={`<h3>${wx.properties.headline}</h3><p><b>Severity:</b> ${wx.properties.severity}</p><p><b>Area:</b> ${wx.properties.areaDesc}</p><p>${wx.properties.description?.substring(0, 500)}...</p>`}
            >
              <PolygonGraphics hierarchy={positions} material={getWxColor(wx.properties.severity)} outline={true} outlineColor={Color.WHITE} outlineWidth={1} />
            </Entity>
          );
        } catch { return null; }
      })}
    </ResiumViewer>
  );
}

export default Globe;
