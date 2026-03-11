import { create } from 'zustand';
import type { LayerFeature } from '../types/geojson';

export type ImageryMode = 'satellite' | 'map' | 'hybrid';

export interface TimeFilter {
  start: number; // unix seconds
  end: number;   // unix seconds
}

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
  timeFilter: TimeFilter | null;
  setTimeFilter: (filter: TimeFilter | null) => void;
  playbackActive: boolean;
  setPlaybackActive: (active: boolean) => void;
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
  timeFilter: null,
  setTimeFilter: (filter) => set({ timeFilter: filter }),
  playbackActive: false,
  setPlaybackActive: (active) => set({ playbackActive: active }),
}));
