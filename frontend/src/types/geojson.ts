export interface LayerFeatureProperties {
  id: string;
  layer: string;
  label: string;
  timestamp: number;
  category: string;
  severity: string;
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
