import type { Namespace } from 'socket.io';
import type { CacheService } from '../services/cache.js';

/**
 * Scanner Fetcher — Intel Panel
 *
 * Fetches recent police/fire scanner audio from OpenMHz API.
 * Queries multiple radio systems concurrently and merges results
 * sorted by time (most recent first).
 *
 * Stores results in Redis key `intel:scanner` with 5-minute TTL.
 * Emits updates to Socket.IO clients subscribed to intel data.
 */

const SCANNER_SYSTEMS = [
  { id: 'chi', label: 'Chicago' },
  { id: 'dcfd', label: 'DC Fire & EMS' },
  { id: 'sdrtrunk-default', label: 'General SDR' },
] as const;

const REDIS_KEY = 'intel:scanner';
const TTL_SECONDS = 300; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;
const API_BASE = 'https://api.openmhz.com';
const CALLS_PER_SYSTEM = 20;

export interface ScannerCall {
  id: string;
  system: string;
  systemLabel: string;
  talkgroup: string;
  freq: number;
  audioUrl: string;
  time: string;
  duration: number;
  starred: boolean;
}

export interface ScannerData {
  calls: ScannerCall[];
  fetchedAt: number;
  systemCount: number;
}

/**
 * Shape of a single call object returned by the OpenMHz API.
 */
interface OpenMhzCall {
  _id: string;
  freq: number;
  talkgroupNum: number;
  talkgroup: string;
  srcList: unknown[];
  url: string;
  time: string;
  len: number;
  star: boolean;
}

/**
 * Fetch recent calls for a single scanner system. Returns empty array on failure.
 */
async function fetchSystem(
  system: { id: string; label: string },
): Promise<ScannerCall[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url = `${API_BASE}/${system.id}/calls?num=${CALLS_PER_SYSTEM}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeospatialDashboard/1.0 ScannerMonitor',
        Accept: 'application/json',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[intel:scanner] ${system.label} returned ${response.status}`,
      );
      return [];
    }

    const json = await response.json() as { calls?: OpenMhzCall[] } | OpenMhzCall[];

    // API may return { calls: [...] } or a raw array
    const rawCalls: OpenMhzCall[] = Array.isArray(json)
      ? json
      : (json.calls ?? []);

    const calls: ScannerCall[] = rawCalls.map((call) => ({
      id: call._id,
      system: system.id,
      systemLabel: system.label,
      talkgroup: call.talkgroup || `TG ${call.talkgroupNum}`,
      freq: call.freq,
      audioUrl: call.url,
      time: call.time,
      duration: call.len,
      starred: call.star ?? false,
    }));

    console.log(
      `[intel:scanner] ${system.label}: fetched ${calls.length} calls`,
    );
    return calls;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel:scanner] ${system.label} fetch failed: ${msg}`);
    return [];
  }
}

export class ScannerFetcher {
  private cache: CacheService;
  private io: Namespace;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  /**
   * Fetch all scanner systems, merge calls, sort by time, and store in Redis.
   */
  async execute(): Promise<void> {
    try {
      console.log('[intel:scanner] Fetching scanner audio...');

      // Fetch all systems concurrently — tolerate individual failures
      const settled = await Promise.allSettled(
        SCANNER_SYSTEMS.map(fetchSystem),
      );

      const allCalls: ScannerCall[] = [];
      let fulfilledCount = 0;

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allCalls.push(...result.value);
          fulfilledCount++;
        }
        // Rejected results already logged warnings inside fetchSystem
      }

      // Sort by time descending (most recent first)
      allCalls.sort((a, b) => {
        const timeA = new Date(a.time).getTime();
        const timeB = new Date(b.time).getTime();
        if (isNaN(timeA) && isNaN(timeB)) return 0;
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        return timeB - timeA;
      });

      const result: ScannerData = {
        calls: allCalls,
        fetchedAt: Date.now(),
        systemCount: fulfilledCount,
      };

      console.log(
        `[intel:scanner] Stored ${allCalls.length} calls from ${fulfilledCount}/${SCANNER_SYSTEMS.length} systems`,
      );

      // Store in Redis
      await this.cache.setRaw(REDIS_KEY, result, TTL_SECONDS);

      // Broadcast to subscribed clients
      this.io.to('intel').emit('intel-data', {
        channel: 'scanner',
        data: result,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[intel:scanner] Execute failed:', msg);
    }
  }

  /**
   * Start periodic fetching at the specified interval.
   */
  start(intervalMs: number): void {
    // Initial fetch with small jitter
    const jitter = Math.floor(Math.random() * 3000);
    setTimeout(() => void this.execute(), jitter);

    this.intervalHandle = setInterval(() => {
      void this.execute();
    }, intervalMs);

    console.log(
      `[intel:scanner] Scheduled every ${intervalMs / 1000}s (initial in ${jitter}ms)`,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
