import { useEffect, useState, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';
import { useUiStore } from '../store/uiStore';
import type { LayerFeatureCollection } from '../types/geojson';

interface LayerDataEvent {
  layerId: string;
  data: LayerFeatureCollection;
}

export function useLayerData(layerId: string) {
  const { socket, subscribeLayer, unsubscribeLayer } = useWebSocket();
  const [rawData, setRawData] = useState<LayerFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timeFilter = useUiStore((s) => s.timeFilter);

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
          setRawData(json);
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
        setRawData(event.data);
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

  // Apply time filter to features
  const data = useMemo<LayerFeatureCollection | null>(() => {
    if (!rawData) return null;
    if (!timeFilter) return rawData;

    const filtered = rawData.features.filter((f) => {
      const ts = f.properties?.timestamp;
      if (typeof ts !== 'number') return true; // keep features without timestamps
      return ts >= timeFilter.start && ts <= timeFilter.end;
    });

    return {
      type: 'FeatureCollection' as const,
      features: filtered,
      metadata: rawData.metadata ? { ...rawData.metadata, count: filtered.length } : undefined,
    };
  }, [rawData, timeFilter]);

  return { data, loading, error };
}
