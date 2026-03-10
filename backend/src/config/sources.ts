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
];
