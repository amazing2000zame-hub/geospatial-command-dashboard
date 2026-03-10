import { useRef, useMemo, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { Viewer as ResiumViewer } from 'resium';
import {
  Ion, OpenStreetMapImageryProvider, Viewer,
  Cartesian3, Cartographic, Math as CesiumMath,
  ScreenSpaceEventHandler, ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  ImageryLayer,
} from 'cesium';
import { useUiStore } from '../store/uiStore';

// Context so children inside the Viewer tree can access getViewer
interface GlobeContextValue {
  getViewer: () => Viewer | null;
}

const GlobeContext = createContext<GlobeContextValue>({
  getViewer: () => null,
});

export function useGlobe() {
  return useContext(GlobeContext);
}

interface GlobeProps {
  children?: ReactNode;
}

// ESRI World Imagery - free satellite imagery, no API key required
function createSatelliteProvider() {
  return new UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
    credit: 'Esri, Maxar, Earthstar Geographics',
  });
}

// ESRI Hybrid labels overlay on top of satellite
function createHybridLabelProvider() {
  return new UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 19,
  });
}

function createOsmProvider() {
  return new OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
  });
}

function Globe({ children }: GlobeProps) {
  const viewerRef = useRef<{ cesiumElement: Viewer | null }>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const setCoords = useUiStore((s) => s.setCoords);
  const imageryMode = useUiStore((s) => s.imageryMode);
  const openStreetView = useUiStore((s) => s.openStreetView);

  const osmProvider = useMemo(() => createOsmProvider(), []);

  // Configure viewer: scene settings, camera, mouse handler
  useEffect(() => {
    let attempts = 0;
    const configure = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) { attempts++; if (attempts < 20) setTimeout(configure, 250); return; }

      // Scene settings
      viewer.scene.globe.enableLighting = true;
      viewer.scene.fog.enabled = true;
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

      // Start with satellite imagery by default
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(createSatelliteProvider());

      // Default camera: US overview
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(-98.5, 39.8, 15000000),
      });

      // Mouse move handler for coordinate display
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const carto = Cartographic.fromCartesian(cartesian);
          setCoords({ lat: CesiumMath.toDegrees(carto.latitude), lng: CesiumMath.toDegrees(carto.longitude) });
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);

      // Right-click to open street view
      handler.setInputAction((event: any) => {
        const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
        if (cartesian) {
          const carto = Cartographic.fromCartesian(cartesian);
          openStreetView(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
        }
      }, ScreenSpaceEventType.RIGHT_CLICK);

      handlerRef.current = handler;
    };
    configure();

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [osmProvider, setCoords]);

  // Switch imagery mode
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    viewer.imageryLayers.removeAll();

    switch (imageryMode) {
      case 'satellite':
        viewer.imageryLayers.addImageryProvider(createSatelliteProvider());
        break;
      case 'hybrid': {
        viewer.imageryLayers.addImageryProvider(createSatelliteProvider());
        const labelLayer = new ImageryLayer(createHybridLabelProvider());
        labelLayer.alpha = 0.8;
        viewer.imageryLayers.add(labelLayer);
        break;
      }
      case 'map':
      default:
        viewer.imageryLayers.addImageryProvider(osmProvider);
        break;
    }

    viewer.scene.requestRender();
  }, [imageryMode, osmProvider]);

  const getViewer = useCallback((): Viewer | null => viewerRef.current?.cesiumElement ?? null, []);

  const ctxValue = useMemo(() => ({ getViewer }), [getViewer]);

  return (
    <GlobeContext.Provider value={ctxValue}>
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
        infoBox={false}
        selectionIndicator={false}
      >
        {children}
      </ResiumViewer>
    </GlobeContext.Provider>
  );
}

export default Globe;
