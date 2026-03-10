import { useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import type { LayerFeatureCollection } from '../types/geojson';

interface LayerDataEvent {
  layerId: string;
  data: LayerFeatureCollection;
}

export function useLayerData(layerId: string) {
  const { socket, subscribeLayer, unsubscribeLayer } = useWebSocket();
  const [data, setData] = useState<LayerFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fetch initial data via REST
    async function fetchInitial() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/layers/${layerId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const json: LayerFeatureCollection = await response.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch layer data');
          setLoading(false);
        }
      }
    }

    fetchInitial();

    // Subscribe to real-time updates
    subscribeLayer(layerId);

    function onData(event: LayerDataEvent) {
      if (event.layerId === layerId && !cancelled) {
        setData(event.data);
        setLoading(false);
        setError(null);
      }
    }

    socket.on('data', onData);

    return () => {
      cancelled = true;
      socket.off('data', onData);
      unsubscribeLayer(layerId);
    };
  }, [layerId, socket, subscribeLayer, unsubscribeLayer]);

  return { data, loading, error };
}
