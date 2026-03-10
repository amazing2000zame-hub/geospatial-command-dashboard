import { loadEnv } from './config/env.js';
import { sourceConfigs } from './config/sources.js';
import { createServer } from './server.js';
import { startScheduler } from './services/scheduler.js';
import { USGSFetcher } from './fetchers/usgs.js';
import { NWSFetcher } from './fetchers/nws.js';
import type { ScheduledTask } from 'node-cron';

const config = loadEnv();

const { fastify, cache, layerNs } = await createServer(config);

// Instantiate fetchers
const fetchers = [
  new USGSFetcher(cache, layerNs),
  new NWSFetcher(cache, layerNs, config.NWS_USER_AGENT),
];

// Start scheduler with staggered initial fetches
const cronJobs: ScheduledTask[] = startScheduler(fetchers, sourceConfigs);

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
