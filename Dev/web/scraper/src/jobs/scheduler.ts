import cron from 'node-cron';
import { runAll, runConnector } from './orchestrator.js';
import { getEnabledConnectors } from '../sources/index.js';
import { query } from '../db/pool.js';
import { childLogger } from '../utils/logger.js';
import { reportError } from '../utils/reportError.js';

const log = childLogger('scheduler');

let dailyRunning = false;

/** Any daily full-refresh currently marked 'running' in the ingest log? */
async function dailyInFlight(): Promise<boolean> {
  if (dailyRunning) return true;
  try {
    const res = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM scraper_ingest_runs
       WHERE status = 'running' AND started_at > now() - interval '6 hours'`,
    );
    return parseInt(res.rows[0]?.n ?? '0', 10) > 0;
  } catch (err) {
    log.warn({ err }, 'dailyInFlight check failed — assuming no');
    return false;
  }
}

/**
 * Start the local cron scheduler.
 * - Daily at 03:15 UTC: full refresh of all sources
 * - Hourly at :30: events only. Skips if a daily refresh is still running.
 */
export function startScheduler(): void {
  log.info('Starting cron scheduler');

  // Daily full refresh at 03:15 UTC
  cron.schedule('15 3 * * *', async () => {
    log.info('Cron: Daily full refresh starting');
    dailyRunning = true;
    try {
      const results = await runAll();
      const summary = results.map((r) => ({
        source: r.source,
        type: r.entityType,
        discovered: r.discovered,
        parsed: r.parsed,
        errors: r.errors.length,
      }));
      log.info({ summary }, 'Cron: Daily full refresh complete');
    } catch (err) {
      log.error({ err }, 'Cron: Daily full refresh failed');
      reportError('scheduler/daily-refresh', err);
    } finally {
      dailyRunning = false;
    }
  });

  // Hourly events refresh — derive source list from config instead of
  // hardcoding, so new event sources automatically participate.
  cron.schedule('30 * * * *', async () => {
    if (await dailyInFlight()) {
      log.info('Cron: Skipping hourly events — daily refresh still running');
      return;
    }
    log.info('Cron: Hourly events refresh starting');
    try {
      const eventConnectors = getEnabledConnectors().filter((c) =>
        c.config.supportedTypes.includes('event'),
      );
      for (const connector of eventConnectors) {
        await runConnector(connector, 'event');
      }
      log.info(
        { sources: eventConnectors.map((c) => c.config.name) },
        'Cron: Hourly events refresh complete',
      );
    } catch (err) {
      log.error({ err }, 'Cron: Hourly events refresh failed');
      reportError('scheduler/hourly-events', err);
    }
  });

  log.info('Cron jobs scheduled: daily full refresh at 03:15 UTC, hourly events at :30');
}
