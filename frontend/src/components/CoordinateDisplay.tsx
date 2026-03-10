import { useState, useEffect } from 'react';
import {
  Viewer,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  Cartesian2,
} from 'cesium';

interface CoordinateDisplayProps {
  getViewer: () => Viewer | null;
}

function CoordinateDisplay({ getViewer }: CoordinateDisplayProps) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let handler: ScreenSpaceEventHandler | null = null;
    let attempts = 0;

    // Retry until viewer is available (it may initialize after mount)
    const trySetup = () => {
      const viewer = getViewer();
      if (!viewer) {
        attempts++;
        if (attempts < 20) {
          setTimeout(trySetup, 250);
        }
        return;
      }

      handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
        const cartesian = viewer.camera.pickEllipsoid(
          movement.endPosition,
          viewer.scene.globe.ellipsoid,
        );
        if (cartesian) {
          const cartographic = Cartographic.fromCartesian(cartesian);
          setCoords({
            lat: CesiumMath.toDegrees(cartographic.latitude),
            lng: CesiumMath.toDegrees(cartographic.longitude),
          });
        } else {
          setCoords(null);
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);
    };

    trySetup();

    return () => {
      if (handler) {
        handler.destroy();
      }
    };
  }, [getViewer]);

  return (
    <div className="coordinate-display">
      {coords
        ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        : '---'}
    </div>
  );
}

export default CoordinateDisplay;
