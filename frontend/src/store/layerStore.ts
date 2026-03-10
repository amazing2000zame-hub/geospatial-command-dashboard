import { create } from 'zustand';

export interface LayerState {
  visible: boolean;
  enabled: boolean;
  status: 'loading' | 'active' | 'error' | 'disabled';
  count: number;
  lastUpdated: number | null;
  error: string | null;
}

export interface LayerConfig {
  id: string;
  displayName: string;
  group: 'live' | 'surveillance' | 'space';
  color: string;
  defaultVisible: boolean;
  defaultEnabled: boolean;
}

export const LAYER_CONFIGS: LayerConfig[] = [
  { id: 'earthquakes', displayName: 'Earthquakes', group: 'live', color: '#ff6b35', defaultVisible: true, defaultEnabled: true },
  { id: 'weather', displayName: 'Weather Alerts', group: 'live', color: '#4da6ff', defaultVisible: true, defaultEnabled: true },
  { id: 'flights', displayName: 'Live Flights', group: 'live', color: '#a78bfa', defaultVisible: true, defaultEnabled: true },
  { id: 'alpr', displayName: 'ALPR Cameras', group: 'surveillance', color: '#f472b6', defaultVisible: false, defaultEnabled: false },
  { id: 'speed_cameras', displayName: 'Speed Cameras', group: 'surveillance', color: '#fb923c', defaultVisible: false, defaultEnabled: false },
  { id: 'satellites', displayName: 'Satellites', group: 'space', color: '#34d399', defaultVisible: false, defaultEnabled: false },
];

function buildInitialLayers(): Record<string, LayerState> {
  const layers: Record<string, LayerState> = {};
  for (const config of LAYER_CONFIGS) {
    layers[config.id] = {
      visible: config.defaultVisible,
      enabled: config.defaultEnabled,
      status: config.defaultEnabled ? 'loading' : 'disabled',
      count: 0,
      lastUpdated: null,
      error: null,
    };
  }
  return layers;
}

interface LayerStore {
  layers: Record<string, LayerState>;
  toggleLayer: (id: string) => void;
  setLayerStatus: (id: string, status: LayerState['status'], count: number, error?: string | null) => void;
  setLayerUpdated: (id: string) => void;
}

export const useLayerStore = create<LayerStore>((set) => ({
  layers: buildInitialLayers(),

  toggleLayer: (id: string) =>
    set((state) => {
      const layer = state.layers[id];
      if (!layer || !layer.enabled) return state;
      return {
        layers: {
          ...state.layers,
          [id]: {
            ...layer,
            visible: !layer.visible,
          },
        },
      };
    }),

  setLayerStatus: (id: string, status: LayerState['status'], count: number, error?: string | null) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: {
          ...state.layers[id],
          status,
          count,
          error: error ?? null,
        },
      },
    })),

  setLayerUpdated: (id: string) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: {
          ...state.layers[id],
          lastUpdated: Date.now(),
        },
      },
    })),
}));
