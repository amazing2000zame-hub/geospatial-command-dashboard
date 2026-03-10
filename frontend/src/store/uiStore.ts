import { create } from 'zustand';
import type { LayerFeature } from '../types/geojson';

interface UiStore {
  coords: { lat: number; lng: number } | null;
  setCoords: (coords: { lat: number; lng: number } | null) => void;
  selectedFeature: LayerFeature | null;
  selectFeature: (feature: LayerFeature | null) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  coords: null,
  setCoords: (coords) => set({ coords }),
  selectedFeature: null,
  selectFeature: (feature) => set({ selectedFeature: feature }),
}));
