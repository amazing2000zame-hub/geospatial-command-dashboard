export interface EnvConfig {
  PORT: number;
  REDIS_URL: string;
  NODE_ENV: string;
  USGS_EARTHQUAKE_URL: string;
  NWS_ALERTS_URL: string;
  NWS_USER_AGENT: string;
  OPENSKY_CLIENT_ID: string;
  OPENSKY_CLIENT_SECRET: string;
}

export function loadEnv(): EnvConfig {
  return {
    PORT: parseInt(process.env.PORT || '4010', 10),
    REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
    NODE_ENV: process.env.NODE_ENV || 'development',
    USGS_EARTHQUAKE_URL:
      process.env.USGS_EARTHQUAKE_URL ||
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    NWS_ALERTS_URL:
      process.env.NWS_ALERTS_URL || 'https://api.weather.gov/alerts/active',
    NWS_USER_AGENT:
      process.env.NWS_USER_AGENT ||
      'GeospatialDashboard/1.0 (homelab@localhost)',
    OPENSKY_CLIENT_ID: process.env.OPENSKY_CLIENT_ID || '',
    OPENSKY_CLIENT_SECRET: process.env.OPENSKY_CLIENT_SECRET || '',
  };
}
