export interface LayerFeatureProperties {
  id: string;
  layer: string;
  label: string | null;
  timestamp: number;
  category: string | null;
  severity: number | null;
  [key: string]: unknown;
}

export interface LayerFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
  properties: LayerFeatureProperties;
}

export interface LayerFeatureCollection {
  type: 'FeatureCollection';
  features: LayerFeature[];
  metadata?: {
    source: string;
    fetchedAt: number;
    count: number;
    nextUpdate?: number;
  };
}
