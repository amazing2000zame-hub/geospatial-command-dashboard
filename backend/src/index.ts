import { loadEnv } from './config/env.js';
import { sourceConfigs } from './config/sources.js';
import { createServer } from './server.js';
import { startScheduler } from './services/scheduler.js';
import { USGSFetcher } from './fetchers/usgs.js';
import { NWSFetcher } from './fetchers/nws.js';
import { OpenSkyFetcher } from './fetchers/opensky.js';
import { OpenSkyAuth } from './services/opensky-auth.js';
import { OverpassSpeedCameraFetcher } from './fetchers/overpass.js';
import { DeflockALPRFetcher } from './fetchers/deflock.js';
import { CelesTrakFetcher } from './fetchers/celestrak.js';
import { TrafficCamFetcher } from './fetchers/trafficcam.js';
import { FIRMSFetcher } from './fetchers/firms.js';
import { GDELTConflictFetcher } from './fetchers/gdelt.js';
import { CrimeFetcher } from './fetchers/crime.js';
import { DispatchFetcher } from './fetchers/dispatch.js';
import { NewsRssFetcher } from './fetchers/news-rss.js';
import { EconomyFetcher } from './fetchers/economy.js';
import { SituationsFetcher } from './fetchers/situations.js';
import { ScannerFetcher } from './fetchers/scanner.js';
import type { ScheduledTask } from 'node-cron';

const config = loadEnv();

const { fastify, cache, layerNs } = await createServer(config);

// Create OpenSky auth manager (gracefully handles missing credentials)
const openSkyAuth = new OpenSkyAuth(
  config.OPENSKY_CLIENT_ID,
  config.OPENSKY_CLIENT_SECRET,
);

// Instantiate fetchers
const fetchers = [
  new USGSFetcher(cache, layerNs),
  new NWSFetcher(cache, layerNs, config.NWS_USER_AGENT),
  new OpenSkyFetcher(cache, layerNs, openSkyAuth),
  new OverpassSpeedCameraFetcher(cache, layerNs),
  new DeflockALPRFetcher(cache, layerNs),
  new CelesTrakFetcher(cache, layerNs),
  new TrafficCamFetcher(cache, layerNs),
  new FIRMSFetcher(cache, layerNs),
  new GDELTConflictFetcher(cache, layerNs),
  new CrimeFetcher(cache, layerNs),
  new DispatchFetcher(cache, layerNs),
];

// Start scheduler with staggered initial fetches
const cronJobs: ScheduledTask[] = startScheduler(fetchers, sourceConfigs);

// --- Intel Panel fetchers (interval-based, not cron) ---
const newsRss = new NewsRssFetcher(cache, layerNs);
const economy = new EconomyFetcher(cache, layerNs);
const situations = new SituationsFetcher(cache, layerNs);
const scannerFetcher = new ScannerFetcher(cache, layerNs);

newsRss.start(10 * 60 * 1000);      // every 10 minutes
economy.start(15 * 60 * 1000);      // every 15 minutes
situations.start(15 * 60 * 1000);   // every 15 minutes
scannerFetcher.start(5 * 60 * 1000); // every 5 minutes

console.log('[startup] Intel panel fetchers started (news, economy, situations, scanner)');

console.log(
  `[startup] Geospatial Dashboard backend running on port ${config.PORT}`,
);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] Received ${signal}, shutting down gracefully...`);

  // Stop cron jobs
  for (const job of cronJobs) {
    job.stop();
  }
  console.log('[shutdown] Cron jobs stopped');

  // Stop intel panel fetchers
  newsRss.stop();
  economy.stop();
  situations.stop();
  scannerFetcher.stop();
  console.log('[shutdown] Intel fetchers stopped');

  // Disconnect Redis
  try {
    await cache.disconnect();
  } catch (err) {
    console.error('[shutdown] Redis disconnect error:', err);
  }

  // Close Fastify (and Socket.IO)
  try {
    await fastify.close();
  } catch (err) {
    console.error('[shutdown] Fastify close error:', err);
  }

  console.log('[shutdown] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
