import type { Namespace } from 'socket.io';
import type { CacheService } from '../services/cache.js';
import type { LayerFeatureCollection } from '../types/geojson.js';

/**
 * Situations Fetcher — Intel Panel
 *
 * Aggregates conflict data from the existing GDELT conflict_events layer
 * already stored in Redis at `geo:layer:conflict_events`.
 *
 * Groups events by country/region, counts them, and produces a ranked
 * list of active conflict situations with summaries.
 *
 * Stores results in Redis key `intel:situations` with 15-minute TTL.
 */

const REDIS_KEY = 'intel:situations';
const SOURCE_KEY = 'geo:layer:conflict_events';
const TTL_SECONDS = 900; // 15 minutes

export interface SituationEntry {
  region: string;
  country: string;
  eventCount: number;
  actors: string[];
  latestEvent: string;
  severity: number;
  summary: string;
}

export interface SituationsData {
  situations: SituationEntry[];
  totalEvents: number;
  fetchedAt: number;
}

/**
 * Extract country name from a GDELT geoName string.
 * GDELT geoNames are typically formatted as:
 *   "City, State, Country" or "Region, Country" or just "Country"
 */
function extractCountry(geoName: string): string {
  if (!geoName || geoName === 'Unknown Location') return 'Unknown';

  const parts = geoName.split(',').map((p) => p.trim());
  // Last part is usually the country
  return parts[parts.length - 1] || 'Unknown';
}

/**
 * Extract region (first part) from geoName for grouping.
 */
function extractRegion(geoName: string): string {
  if (!geoName || geoName === 'Unknown Location') return 'Unknown';

  const parts = geoName.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    // Use the second-to-last part as region (state/province level)
    return parts[parts.length - 2] || parts[0];
  }
  return parts[0];
}

/**
 * Map severity score (0-1) to a human-readable label.
 */
function severityLabel(severity: number): string {
  if (severity >= 0.9) return 'Critical';
  if (severity >= 0.7) return 'High';
  if (severity >= 0.4) return 'Moderate';
  return 'Low';
}

export class SituationsFetcher {
  private cache: CacheService;
  private io: Namespace;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  /**
   * Read GDELT conflict events from Redis, group by country,
   * and produce situation summaries.
   */
  async execute(): Promise<void> {
    try {
      console.log('[intel:situations] Aggregating conflict data...');

      // Read raw conflict data from Redis (using the geo:layer: key directly)
      const rawData = await this.cache.getRaw<LayerFeatureCollection>(SOURCE_KEY);

      if (!rawData || !rawData.features || rawData.features.length === 0) {
        console.warn(
          '[intel:situations] No conflict data available in Redis',
        );

        // Store empty result so the frontend knows we tried
        const empty: SituationsData = {
          situations: [],
          totalEvents: 0,
          fetchedAt: Date.now(),
        };
        await this.cache.setRaw(REDIS_KEY, empty, TTL_SECONDS);
        return;
      }

      const features = rawData.features;
      console.log(
        `[intel:situations] Processing ${features.length} conflict events`,
      );

      // Group events by country
      const countryGroups = new Map<
        string,
        {
          events: typeof features;
          actors: Set<string>;
          maxSeverity: number;
          latestDate: string;
          eventTypes: Set<string>;
          geoNames: Set<string>;
        }
      >();

      for (const feature of features) {
        const props = feature.properties;
        const geoName = (props.geoName as string) || 'Unknown Location';
        const country = extractCountry(geoName);

        if (!countryGroups.has(country)) {
          countryGroups.set(country, {
            events: [],
            actors: new Set(),
            maxSeverity: 0,
            latestDate: '',
            eventTypes: new Set(),
            geoNames: new Set(),
          });
        }

        const group = countryGroups.get(country)!;
        group.events.push(feature);

        // Track actors
        const actor1 = props.actor1 as string;
        const actor2 = props.actor2 as string;
        if (actor1 && actor1 !== 'Unknown') group.actors.add(actor1);
        if (actor2) group.actors.add(actor2);

        // Track severity
        const severity =
          typeof props.severity === 'number' ? props.severity : 0;
        if (severity > group.maxSeverity) group.maxSeverity = severity;

        // Track event types
        const eventType = props.eventType as string;
        if (eventType) group.eventTypes.add(eventType);

        // Track event date
        const eventDate = (props.eventDate as string) || '';
        if (eventDate > group.latestDate) group.latestDate = eventDate;

        // Track sub-regions
        group.geoNames.add(geoName);
      }

      // Build situation entries sorted by event count descending
      const situations: SituationEntry[] = [];

      for (const [country, group] of countryGroups) {
        const region = extractRegion(
          [...group.geoNames][0] || country,
        );

        // Build summary
        const typeList = [...group.eventTypes].slice(0, 3).join(', ');
        const locationCount = group.geoNames.size;
        const severityText = severityLabel(group.maxSeverity);

        const summary =
          `${group.events.length} ${typeList ? typeList.toLowerCase() : 'conflict'} event${group.events.length !== 1 ? 's' : ''} across ${locationCount} location${locationCount !== 1 ? 's' : ''}. ` +
          `Severity: ${severityText}. ` +
          `Key actors: ${[...group.actors].slice(0, 4).join(', ') || 'N/A'}.`;

        situations.push({
          region,
          country,
          eventCount: group.events.length,
          actors: [...group.actors].slice(0, 6),
          latestEvent: group.latestDate,
          severity: group.maxSeverity,
          summary,
        });
      }

      // Sort by event count descending, then by severity
      situations.sort((a, b) => {
        if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
        return b.severity - a.severity;
      });

      // Keep top 25 situations
      const topSituations = situations.slice(0, 25);

      const result: SituationsData = {
        situations: topSituations,
        totalEvents: features.length,
        fetchedAt: Date.now(),
      };

      console.log(
        `[intel:situations] ${topSituations.length} situations from ${features.length} events across ${countryGroups.size} countries`,
      );

      // Store in Redis
      await this.cache.setRaw(REDIS_KEY, result, TTL_SECONDS);

      // Broadcast to subscribed clients
      this.io.to('intel').emit('intel-data', {
        channel: 'situations',
        data: result,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[intel:situations] Execute failed:', msg);
    }
  }

  /**
   * Start periodic fetching at the specified interval.
   */
  start(intervalMs: number): void {
    // Initial fetch with jitter (wait a bit for GDELT data to load first)
    const jitter = Math.floor(Math.random() * 3000) + 5000;
    setTimeout(() => void this.execute(), jitter);

    this.intervalHandle = setInterval(() => {
      void this.execute();
    }, intervalMs);

    console.log(
      `[intel:situations] Scheduled every ${intervalMs / 1000}s (initial in ${jitter}ms)`,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
