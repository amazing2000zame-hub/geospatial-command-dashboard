import { useRef, useMemo, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { Viewer as ResiumViewer } from 'resium';
import {
  Ion, OpenStreetMapImageryProvider, Viewer,
  Cartesian3, Cartographic, Math as CesiumMath,
  ScreenSpaceEventHandler, ScreenSpaceEventType
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

function Globe({ children }: GlobeProps) {
  const viewerRef = useRef<{ cesiumElement: Viewer | null }>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const setCoords = useUiStore((s) => s.setCoords);

  const osmProvider = useMemo(() => new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }), []);

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

      // OSM fallback when no Ion token
      if (!Ion.defaultAccessToken) {
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(osmProvider);
      }

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
