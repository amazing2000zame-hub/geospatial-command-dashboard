import cron from 'node-cron';
import type { BaseFetcher } from '../fetchers/BaseFetcher.js';
import type { SourceConfig } from '../config/sources.js';

/**
 * Start the scheduler for all enabled fetchers.
 * Uses node-cron for periodic polling and staggered initial fetch
 * to prevent thundering herd on container restart.
 *
 * @returns Array of cron ScheduledTask objects for graceful shutdown
 */
export function startScheduler(
  fetchers: BaseFetcher[],
  configs: SourceConfig[],
): cron.ScheduledTask[] {
  const tasks: cron.ScheduledTask[] = [];

  for (const config of configs) {
    if (!config.enabled) {
      console.log(`[scheduler] Skipping disabled source: ${config.displayName}`);
      continue;
    }

    const fetcher = fetchers.find((f) => f.sourceId === config.sourceId);
    if (!fetcher) {
      console.warn(
        `[scheduler] No fetcher found for sourceId: ${config.sourceId}`,
      );
      continue;
    }

    // Register cron job for periodic polling
    const task = cron.schedule(config.interval, () => {
      void fetcher.execute();
    });
    tasks.push(task);

    console.log(
      `[scheduler] Registered ${config.displayName} every ${config.interval}`,
    );

    // Staggered initial fetch: random jitter 0-5 seconds
    // Prevents all APIs from being hit simultaneously on container restart
    const jitterMs = Math.floor(Math.random() * 5000);
    console.log(
      `[scheduler] Initial fetch for ${config.displayName} in ${jitterMs}ms`,
    );
    setTimeout(() => {
      void fetcher.execute();
    }, jitterMs);
  }

  console.log(`[scheduler] Started ${tasks.length} scheduled tasks`);
  return tasks;
}
