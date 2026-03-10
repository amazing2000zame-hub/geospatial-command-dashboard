import { useRef, useMemo, useCallback, useEffect } from 'react';
import { Viewer as ResiumViewer } from 'resium';
import { Terrain, Viewer } from 'cesium';
import SearchBar from './SearchBar';
import CoordinateDisplay from './CoordinateDisplay';

function Globe() {
  const viewerRef = useRef<{ cesiumElement: Viewer | null }>(null);

  const terrain = useMemo(
    () => Terrain.fromWorldTerrain({ requestVertexNormals: true }),
    [],
  );

  // Configure viewer scene after mount
  useEffect(() => {
    let attempts = 0;
    const configure = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) {
        attempts++;
        if (attempts < 20) setTimeout(configure, 250);
        return;
      }
      viewer.scene.globe.enableLighting = true;
      viewer.scene.requestRenderMode = true;
      viewer.scene.maximumRenderTimeChange = Infinity;
      viewer.scene.fog.enabled = true;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }
    };
    configure();
  }, []);

  const getViewer = useCallback((): Viewer | null => {
    return viewerRef.current?.cesiumElement ?? null;
  }, []);

  return (
    <ResiumViewer
      ref={viewerRef as any}
      full
      terrain={terrain}
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
      <CoordinateDisplay getViewer={getViewer} />
    </ResiumViewer>
  );
}

export default Globe;
