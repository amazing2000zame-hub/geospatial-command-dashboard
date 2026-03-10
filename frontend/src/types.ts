export interface EarthquakeFeature {
  type: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    url: string;
    alert: string | null;
    status: string;
    tsunami: number;
    title: string;
  };
  geometry: {
    type: string;
    coordinates: [number, number, number];
  };
  id: string;
}

export interface EarthquakeData {
  type: string;
  features: EarthquakeFeature[];
  metadata: {
    generated: number;
    url: string;
    title: string;
    count: number;
  };
}

export interface WeatherAlert {
  id: string;
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  } | null;
  properties: {
    id: string;
    areaDesc: string;
    sent: string;
    effective: string;
    onset: string;
    expires: string;
    ends: string | null;
    severity: string;
    certainty: string;
    urgency: string;
    event: string;
    headline: string;
    description: string;
    instruction: string | null;
  };
}

export interface WeatherData {
  type: string;
  features: WeatherAlert[];
  title: string;
  updated: string;
}
