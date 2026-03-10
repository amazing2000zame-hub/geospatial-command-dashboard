import { useRef, useCallback, useState, useEffect } from 'react';
import Supercluster from 'supercluster';
import type { BBox } from 'geojson';

// Supercluster cluster feature shape
export interface ClusterProperties {
  cluster: true;
  cluster_id: number;
  point_count: number;
  point_count_abbreviated: string | number;
}

export type ClusterFeature = GeoJSON.Feature<GeoJSON.Point, ClusterProperties>;
export type PointOrCluster = GeoJSON.Feature<GeoJSON.Point> | ClusterFeature;

export function isCluster(
  feature: PointOrCluster,
): feature is ClusterFeature {
  return !!(feature.properties as Record<string, unknown>)?.cluster;
}

interface UseClusterOptions {
  radius?: number;
  maxZoom?: number;
  minZoom?: number;
}

/**
 * Convert CesiumJS camera height (meters) to an approximate Supercluster zoom level.
 * Uses a logarithmic mapping from height to zoom 0-20.
 */
export function cameraHeightToZoom(height: number): number {
  // Approximate mapping: at height ~20M meters we're zoom 0,
  // at ~1000m we're zoom 18. Log-based interpolation.
  if (height <= 0) return 20;
  if (height > 40_000_000) return 0;

  // Using the formula: zoom ~= 15.5 - log2(height / 1000)
  // This gives: 1000m -> ~15.5, 10000m -> ~12.2, 1000000m -> ~5.5, 20000000m -> ~1.2
  const zoom = 15.5 - Math.log2(height / 1000);
  return Math.max(0, Math.min(20, Math.round(zoom)));
}

/**
 * Convert zoom level back to approximate camera height (meters).
 */
export function zoomToCameraHeight(zoom: number): number {
  return 1000 * Math.pow(2, 15.5 - zoom);
}

/**
 * Reusable clustering hook for large point datasets.
 *
 * @param features - Array of GeoJSON Point features to cluster
 * @param options  - Supercluster configuration (radius, maxZoom)
 * @returns clusters for the current viewport, and an updateClusters function
 */
export function useCluster(
  features: GeoJSON.Feature<GeoJSON.Point>[],
  options?: UseClusterOptions,
) {
  const {
    radius = 60,
    maxZoom = 18,
    minZoom = 0,
  } = options ?? {};

  const indexRef = useRef<Supercluster | null>(null);
  const [clusters, setClusters] = useState<PointOrCluster[]>([]);
  const prevFeaturesLenRef = useRef<number>(0);

  // Rebuild the Supercluster index when features change
  useEffect(() => {
    if (!features || features.length === 0) {
      indexRef.current = null;
      setClusters([]);
      prevFeaturesLenRef.current = 0;
      return;
    }

    // Only rebuild if the count actually changed (avoid unnecessary re-indexes)
    if (features.length === prevFeaturesLenRef.current && indexRef.current) {
      return;
    }

    const index = new Supercluster({
      radius,
      maxZoom,
      minZoom,
    });

    index.load(features as Array<Supercluster.PointFeature<Record<string, unknown>>>);
    indexRef.current = index;
    prevFeaturesLenRef.current = features.length;

    // Provide an initial global view (zoom 0, full bbox)
    const initialClusters = index.getClusters([-180, -90, 180, 90], 0);
    setClusters(initialClusters as PointOrCluster[]);
  }, [features, radius, maxZoom, minZoom]);

  /**
   * Recalculate clusters for the given bounding box and camera height.
   * Call this on camera move (debounced).
   */
  const updateClusters = useCallback(
    (bbox: BBox, cameraHeight: number) => {
      const index = indexRef.current;
      if (!index) return;

      const zoom = cameraHeightToZoom(cameraHeight);
      const result = index.getClusters(bbox, zoom);
      setClusters(result as PointOrCluster[]);
    },
    [],
  );

  /**
   * Get the zoom level at which a cluster expands.
   */
  const getClusterExpansionZoom = useCallback(
    (clusterId: number): number => {
      const index = indexRef.current;
      if (!index) return 10;
      try {
        return index.getClusterExpansionZoom(clusterId);
      } catch {
        return 10;
      }
    },
    [],
  );

  return { clusters, updateClusters, getClusterExpansionZoom };
}
