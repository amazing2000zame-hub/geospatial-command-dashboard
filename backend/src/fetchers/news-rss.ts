import type { Namespace } from 'socket.io';
import type { CacheService } from '../services/cache.js';

/**
 * News RSS Fetcher — Intel Panel
 *
 * Fetches headlines from multiple world-news RSS feeds using native fetch()
 * and regex-based XML parsing. No external dependencies required.
 *
 * Stores results in Redis key `intel:news` with 10-minute TTL.
 * Emits updates to Socket.IO clients subscribed to intel data.
 */

const RSS_SOURCES = [
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss' },
] as const;

const REDIS_KEY = 'intel:news';
const TTL_SECONDS = 600; // 10 minutes
const MAX_ITEMS = 50;
const FETCH_TIMEOUT_MS = 15_000;

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string;
  summary: string;
}

/**
 * Strip HTML tags from a string, then collapse whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') // unwrap CDATA
    .replace(/<[^>]*>/g, '')                        // strip tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text content from an XML element using regex.
 * Handles both CDATA-wrapped and plain text content.
 */
function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  // Plain text content
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const plainMatch = xml.match(plainRe);
  if (plainMatch) return plainMatch[1].trim();

  return '';
}

/**
 * Parse RSS XML into NewsItem array for a given source.
 */
function parseRssFeed(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];

  // Match all <item> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = stripHtml(extractTag(block, 'title'));
    const link = stripHtml(extractTag(block, 'link'));
    const pubDate = stripHtml(extractTag(block, 'pubDate'));
    const description = stripHtml(extractTag(block, 'description'));

    if (!title) continue;

    items.push({
      title,
      source: sourceName,
      link,
      pubDate,
      summary: description.length > 300
        ? description.slice(0, 297) + '...'
        : description,
    });
  }

  return items;
}

/**
 * Fetch a single RSS feed with timeout. Returns empty array on failure.
 */
async function fetchFeed(
  source: { name: string; url: string },
): Promise<NewsItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GeospatialDashboard/1.0 NewsAggregator',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[intel:news] ${source.name} returned ${response.status}`,
      );
      return [];
    }

    const xml = await response.text();
    const items = parseRssFeed(xml, source.name);
    console.log(`[intel:news] ${source.name}: parsed ${items.length} items`);
    return items;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intel:news] ${source.name} fetch failed: ${msg}`);
    return [];
  }
}

export class NewsRssFetcher {
  private cache: CacheService;
  private io: Namespace;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(cache: CacheService, io: Namespace) {
    this.cache = cache;
    this.io = io;
  }

  /**
   * Fetch all RSS feeds, merge, sort by date, deduplicate, and store in Redis.
   */
  async execute(): Promise<void> {
    try {
      console.log('[intel:news] Fetching RSS feeds...');

      // Fetch all feeds concurrently
      const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
      const allItems = results.flat();

      // Sort by pubDate descending (most recent first)
      allItems.sort((a, b) => {
        const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });

      // Deduplicate by title (case-insensitive)
      const seen = new Set<string>();
      const unique: NewsItem[] = [];
      for (const item of allItems) {
        const key = item.title.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
        if (unique.length >= MAX_ITEMS) break;
      }

      console.log(
        `[intel:news] Stored ${unique.length} items (from ${allItems.length} total)`,
      );

      // Store in Redis
      await this.cache.setRaw(REDIS_KEY, {
        items: unique,
        fetchedAt: Date.now(),
        sourceCount: RSS_SOURCES.length,
      }, TTL_SECONDS);

      // Broadcast to subscribed clients
      this.io.to('intel').emit('intel-data', {
        channel: 'news',
        data: {
          items: unique,
          fetchedAt: Date.now(),
          sourceCount: RSS_SOURCES.length,
        },
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[intel:news] Execute failed:', msg);
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
      `[intel:news] Scheduled every ${intervalMs / 1000}s (initial in ${jitter}ms)`,
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
