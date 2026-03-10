import { useRef, useEffect, useState, useCallback } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { getFeature } from '../store/featureRegistry';

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

function getTooltipText(id: string): string | null {
  const feature = getFeature(id);
  if (!feature) return null;

  const props = feature.properties;
  const layer = props.layer;

  switch (layer) {
    case 'flights': {
      const callsign = (props.callsign as string)?.trim();
      const alt = props.altitudeFt as number | undefined;
      const mil = props.isMilitary ? '[MIL] ' : '';
      if (callsign && alt) return `${mil}${callsign} - ${Math.round(alt).toLocaleString()} ft`;
      return `${mil}${callsign || String(props.label || id)}`;
    }
    case 'satellites':
      return String(props.label || props.OBJECT_NAME || id);
    case 'earthquakes': {
      const mag = props.mag as number | undefined;
      const place = props.place as string | undefined;
      if (mag && place) return `M${mag} - ${place}`;
      return String(props.label || id);
    }
    case 'alpr':
      return `ALPR Camera${props.operator ? ` (${props.operator})` : ''}`;
    case 'speed_cameras': {
      const maxspeed = props.maxspeed as string | undefined;
      return maxspeed ? `Speed Camera (${maxspeed})` : 'Speed Camera';
    }
    case 'traffic_cameras':
      return String(props.label || 'Traffic Camera');
    case 'weather':
      return String(props.label || props.event || 'Weather Alert');
    case 'active_fires': {
      const frp = props.frp as number | undefined;
      return frp ? `Fire (${frp.toFixed(0)} MW)` : 'Active Fire';
    }
    case 'conflict_events':
      return String(props.label || 'Conflict Event');
    default:
      return String(props.label || id);
  }
}

function HoverTooltip() {
  const { viewer } = useCesium();
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const lastPickedRef = useRef<string | null>(null);

  const handleMove = useCallback(
    (event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      if (!viewer || viewer.isDestroyed()) return;

      const picked = viewer.scene.pick(event.endPosition);

      if (!Cesium.defined(picked) || !picked.primitive) {
        if (lastPickedRef.current !== null) {
          lastPickedRef.current = null;
          setTooltip(null);
        }
        return;
      }

      const id = picked.primitive.id as string | undefined;
      if (!id || typeof id !== 'string') {
        if (lastPickedRef.current !== null) {
          lastPickedRef.current = null;
          setTooltip(null);
        }
        return;
      }

      // Skip cluster ids
      if (id.includes('cluster_')) {
        if (lastPickedRef.current !== null) {
          lastPickedRef.current = null;
          setTooltip(null);
        }
        return;
      }

      if (id === lastPickedRef.current) {
        setTooltip((prev) =>
          prev
            ? { ...prev, x: event.endPosition.x, y: event.endPosition.y }
            : null,
        );
        return;
      }

      lastPickedRef.current = id;

      const text = getTooltipText(id);
      if (text) {
        setTooltip({ text, x: event.endPosition.x, y: event.endPosition.y });
      } else {
        setTooltip(null);
      }
    },
    [viewer],
  );

  useEffect(() => {
    if (!viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(handleMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handlerRef.current = handler;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [viewer, handleMove]);

  if (!tooltip) return null;

  return (
    <div
      className="hover-tooltip"
      style={{ left: tooltip.x + 14, top: tooltip.y - 30 }}
    >
      {tooltip.text}
    </div>
  );
}

export default HoverTooltip;
