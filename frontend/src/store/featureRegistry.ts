import type { LayerFeature } from '../types/geojson';

// Global registry of features by their primitive id
// Layers register features here so the hover tooltip can look up names
const registry = new Map<string, LayerFeature>();

export function registerFeature(id: string, feature: LayerFeature): void {
  registry.set(id, feature);
}

export function unregisterFeature(id: string): void {
  registry.delete(id);
}

export function getFeature(id: string): LayerFeature | undefined {
  return registry.get(id);
}

export function clearLayerFeatures(layerPrefix: string): void {
  for (const key of registry.keys()) {
    if (key.startsWith(layerPrefix)) {
      registry.delete(key);
    }
  }
}

export function registerFeatures(features: Map<string, LayerFeature>): void {
  for (const [id, feature] of features) {
    registry.set(id, feature);
  }
}
