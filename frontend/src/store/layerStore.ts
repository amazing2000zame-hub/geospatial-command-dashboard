import { create } from 'zustand';

export interface LayerState {
  visible: boolean;
  status: string;
  count: number;
  error?: string;
}

interface LayerStore {
  layers: Record<string, LayerState>;
  toggleLayer: (id: string) => void;
  setLayerStatus: (id: string, status: string, count: number, error?: string) => void;
}

export const useLayerStore = create<LayerStore>((set) => ({
  layers: {
    earthquakes: { visible: true, status: 'loading', count: 0 },
    weather: { visible: true, status: 'loading', count: 0 },
  },

  toggleLayer: (id: string) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: {
          ...state.layers[id],
          visible: !state.layers[id]?.visible,
        },
      },
    })),

  setLayerStatus: (id: string, status: string, count: number, error?: string) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [id]: {
          ...state.layers[id],
          status,
          count,
          error,
        },
      },
    })),
}));
