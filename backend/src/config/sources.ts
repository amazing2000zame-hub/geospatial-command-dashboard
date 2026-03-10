export interface SourceConfig {
  sourceId: string;
  displayName: string;
  interval: string;
  cacheTTL: number;
  enabled: boolean;
}

export const sourceConfigs: SourceConfig[] = [
  {
    sourceId: 'earthquakes',
    displayName: 'USGS Earthquakes',
    interval: '*/60 * * * * *',
    cacheTTL: 55,
    enabled: true,
  },
  {
    sourceId: 'weather',
    displayName: 'NWS Weather Alerts',
    interval: '*/120 * * * * *',
    cacheTTL: 110,
    enabled: true,
  },
  {
    sourceId: 'flights',
    displayName: 'Live Flights',
    interval: '*/30 * * * * *',
    cacheTTL: 25,
    enabled: true,
  },
  {
    sourceId: 'speed_cameras',
    displayName: 'Speed Cameras (Overpass)',
    interval: '0 0 */6 * * *',
    cacheTTL: 21600,
    enabled: true,
  },
  {
    sourceId: 'alpr',
    displayName: 'ALPR Cameras (DeFlock/OSM)',
    interval: '0 0 0 * * *',
    cacheTTL: 86400,
    enabled: true,
  },
  {
    sourceId: 'satellites',
    displayName: 'CelesTrak Satellites',
    interval: '0 0 */4 * * *',
    cacheTTL: 14400,
    enabled: true,
  },
  {
    sourceId: 'traffic_cameras',
    displayName: 'Traffic Cameras (DOT)',
    interval: '0 */5 * * * *',
    cacheTTL: 300,
    enabled: true,
  },
];
