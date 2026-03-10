import type { Namespace } from 'socket.io';
import type { CacheService } from '../services/cache.js';

/**
 * Economy Fetcher — Intel Panel
 *
 * Aggregates economic indicators from free public APIs:
 * - Cryptocurrency prices (CoinGecko)
 * - Fear & Greed Index (Alternative.me)
 * - Gold spot price (metals.dev demo)
 *
 * Partial data is fine — if one API fails, the rest still get stored.
 * Stores results in Redis key `intel:economy` with 15-minute TTL.
 */

const REDIS_KEY = 'intel:economy';
const TTL_SECONDS = 900; // 15 minutes
const FETCH_TIMEOUT_MS = 15_000;

// --- Types ---

export interface CryptoEntry {
  name: string;
  price: number;
  change24h: number | null;
}

export interface FearGreedData {
  value: number;
  classification: string;
}

export interface GoldData {
  price: number | null;
  change: number | null;
}

export interface EconomyData {
  crypto: CryptoEntry[];
  fearGreed: FearGreedData | null;
  gold: GoldData | null;
  fetchedAt: number;
}

// --- Individual API fetchers ---

async function fetchCrypto(): Promise<CryptoEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true';

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[intel:economy] CoinGecko returned ${response.status}`);
      return [];
    }

    const data = (await response.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;

    const entries: CryptoEntry[] = [];
    const coins: Array<{ id: string; name: string }> = [
      { id: 'bitcoin', name: 'Bitcoin' },
      { id: 'ethereum', name: 'Ethereum' },
      { id: 'solana', name: 'Solana' },
    ];

    for (const coin of coins) {
      const info = data[coin.id];
      if (info && typeof info.usd === 'number') {
        entries.push({
          name: coin.name,
          price: info.usd,
          change24h:
            typeof info.usd_24h_change === 'number'
              ? Math.round(info.usd_24h_change * 100) / 100
              : null,
        });
      }
    }

    console.log(`[intel:economy] CoinGecko: ${entries.length} coins`);
    return entries;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel:economy] CoinGecko failed: ${msg}`);
    return [];
  }
}

async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[intel:economy] Fear & Greed returned ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{
        value?: string;
        value_classification?: string;
      }>;
    };

    const entry = data?.data?.[0];
    if (!entry || !entry.value) return null;

    const result: FearGreedData = {
      value: parseInt(entry.value, 10),
      classification: entry.value_classification || 'Unknown',
    };

    console.log(
      `[intel:economy] Fear & Greed: ${result.value} (${result.classification})`,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel:economy] Fear & Greed failed: ${msg}`);
    return null;
  }
}

async function fetchGold(): Promise<GoldData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url =
      'https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz';

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[intel:economy] Metals.dev returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      metals?: Record<string, number>;
    };

    const goldPrice = data?.metals?.gold;
    if (typeof goldPrice !== 'number') {
      console.warn('[intel:economy] Metals.dev: no gold price in response');
      return null;
    }

    console.log(`[intel:economy] Gold: $${goldPrice.toFixed(2)}/toz`);
    return {
      price: Math.round(goldPrice * 100) / 100,
      change: null, // Demo API doesn't provide change data
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel:economy] Gold price failed: ${msg}`);
    return null;
  }
}

// --- Main fetcher class ---

export class EconomyFetcher {
  private cache: CacheService;
  private io: Namespace;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  /**
   * Fetch all economic indicators concurrently.
   * Partial results are stored even if some APIs fail.
   */
  async execute(): Promise<void> {
    try {
      console.log('[intel:economy] Fetching economic indicators...');

      const [crypto, fearGreed, gold] = await Promise.all([
        fetchCrypto(),
        fetchFearGreed(),
        fetchGold(),
      ]);

      const economyData: EconomyData = {
        crypto,
        fearGreed,
        gold,
        fetchedAt: Date.now(),
      };

      // Check if we got any data at all
      const hasData =
        crypto.length > 0 || fearGreed !== null || gold !== null;

      if (!hasData) {
        console.warn('[intel:economy] All API calls failed, no data to store');
        return;
      }

      // Store in Redis
      await this.cache.setRaw(REDIS_KEY, economyData, TTL_SECONDS);
      console.log('[intel:economy] Stored economy data in Redis');

      // Broadcast to subscribed clients
      this.io.to('intel').emit('intel-data', {
        channel: 'economy',
        data: economyData,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[intel:economy] Execute failed:', msg);
    }
  }

  /**
   * Start periodic fetching at the specified interval.
   */
  start(intervalMs: number): void {
    // Initial fetch with small jitter
    const jitter = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(() => void this.execute(), jitter);

    this.intervalHandle = setInterval(() => {
      void this.execute();
    }, intervalMs);

    console.log(
      `[intel:economy] Scheduled every ${intervalMs / 1000}s (initial in ${jitter}ms)`,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
