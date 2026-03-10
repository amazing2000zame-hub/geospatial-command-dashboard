import { redis } from '../index.js';

const USGS_ENDPOINT = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const POLL_INTERVAL = 60000; // 60 seconds
const CACHE_KEY = 'earthquakes:data';
const CACHE_TTL = 120; // 2 minutes

interface EarthquakeFeature {
  type: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    url: string;
    detail: string;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    alert: string | null;
    status: string;
    tsunami: number;
    sig: number;
    net: string;
    code: string;
    ids: string;
    sources: string;
    types: string;
    nst: number | null;
    dmin: number | null;
    rms: number;
    gap: number | null;
    magType: string;
    type: string;
    title: string;
  };
  geometry: {
    type: string;
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
  id: string;
}

interface EarthquakeData {
  type: string;
  features: EarthquakeFeature[];
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
}

class EarthquakeService {
  private pollTimer: NodeJS.Timeout | null = null;
  private lastFetch: number = 0;

  async fetchFromUSGS(): Promise<EarthquakeData> {
    const response = await fetch(USGS_ENDPOINT);
    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status}`);
    }
    return response.json();
  }

  async getEarthquakes(): Promise<EarthquakeData> {
    // Try cache first
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        console.log('Returning cached earthquake data');
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Redis cache read error:', error);
    }

    // Fetch fresh data
    console.log('Fetching fresh earthquake data from USGS...');
    const data = await this.fetchFromUSGS();
    
    // Cache it
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    } catch (error) {
      console.error('Redis cache write error:', error);
    }

    this.lastFetch = Date.now();
    return data;
  }

  startPolling(callback: (data: EarthquakeData) => void) {
    console.log('Starting earthquake polling (every 60s)...');
    
    // Initial fetch
    this.getEarthquakes()
      .then(callback)
      .catch(error => console.error('Initial earthquake fetch failed:', error));

    // Poll every 60 seconds
    this.pollTimer = setInterval(async () => {
      try {
        const data = await this.getEarthquakes();
        callback(data);
        console.log(`Earthquake update: ${data.features.length} events`);
      } catch (error) {
        console.error('Earthquake polling error:', error);
      }
    }, POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('Earthquake polling stopped');
    }
  }
}

export const earthquakeService = new EarthquakeService();
