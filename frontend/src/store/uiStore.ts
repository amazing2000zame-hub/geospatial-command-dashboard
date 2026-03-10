import { create } from 'zustand';
import type { LayerFeature } from '../types/geojson';

export type ImageryMode = 'satellite' | 'map' | 'hybrid';

interface UiStore {
  coords: { lat: number; lng: number } | null;
  setCoords: (coords: { lat: number; lng: number } | null) => void;
  selectedFeature: LayerFeature | null;
  selectFeature: (feature: LayerFeature | null) => void;
  imageryMode: ImageryMode;
  setImageryMode: (mode: ImageryMode) => void;
  streetViewCoords: { lat: number; lng: number } | null;
  openStreetView: (lat: number, lng: number) => void;
  closeStreetView: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  coords: null,
  setCoords: (coords) => set({ coords }),
  selectedFeature: null,
  selectFeature: (feature) => set({ selectedFeature: feature }),
  imageryMode: 'satellite',
  setImageryMode: (mode) => set({ imageryMode: mode }),
  streetViewCoords: null,
  openStreetView: (lat, lng) => set({ streetViewCoords: { lat, lng } }),
  closeStreetView: () => set({ streetViewCoords: null }),
}));
