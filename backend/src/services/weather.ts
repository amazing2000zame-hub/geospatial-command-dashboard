import { redis } from '../index.js';

const NWS_ENDPOINT = 'https://api.weather.gov/alerts/active';
const POLL_INTERVAL = 300000; // 5 minutes
const CACHE_KEY = 'weather:alerts';
const CACHE_TTL = 360; // 6 minutes

interface WeatherAlert {
  id: string;
  type: string;
  geometry: {
    type: string;
    coordinates: number[][][]; // Polygon coordinates
  } | null;
  properties: {
    '@id': string;
    '@type': string;
    id: string;
    areaDesc: string;
    geocode: {
      SAME: string[];
      UGC: string[];
    };
    affectedZones: string[];
    references: any[];
    sent: string;
    effective: string;
    onset: string;
    expires: string;
    ends: string | null;
    status: string;
    messageType: string;
    category: string;
    severity: string;
    certainty: string;
    urgency: string;
    event: string;
    sender: string;
    senderName: string;
    headline: string;
    description: string;
    instruction: string | null;
    response: string;
    parameters: any;
  };
}

interface WeatherData {
  type: string;
  features: WeatherAlert[];
  title: string;
  updated: string;
}

class WeatherService {
  private pollTimer: NodeJS.Timeout | null = null;
  private lastFetch: number = 0;

  async fetchFromNWS(): Promise<WeatherData> {
    const response = await fetch(NWS_ENDPOINT, {
      headers: {
        'User-Agent': '(Geospatial Dashboard, admin@localhost)',
        'Accept': 'application/geo+json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status}`);
    }
    
    return await response.json() as WeatherData;
  }

  async getAlerts(): Promise<WeatherData> {
    // Try cache first
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        console.log('Returning cached weather data');
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Redis cache read error:', error);
    }

    // Fetch fresh data
    console.log('Fetching fresh weather alerts from NWS...');
    const data = await this.fetchFromNWS();
    
    // Cache it
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data));
    } catch (error) {
      console.error('Redis cache write error:', error);
    }

    this.lastFetch = Date.now();
    return data;
  }

  startPolling(callback: (data: WeatherData) => void) {
    console.log('Starting weather polling (every 5 min)...');
    
    // Initial fetch
    this.getAlerts()
      .then(callback)
      .catch(error => console.error('Initial weather fetch failed:', error));

    // Poll every 5 minutes
    this.pollTimer = setInterval(async () => {
      try {
        const data = await this.getAlerts();
        callback(data);
        console.log(`Weather update: ${data.features.length} active alerts`);
      } catch (error) {
        console.error('Weather polling error:', error);
      }
    }, POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('Weather polling stopped');
    }
  }
}

export const weatherService = new WeatherService();
