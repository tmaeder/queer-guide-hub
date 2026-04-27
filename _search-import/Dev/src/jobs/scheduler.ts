/**
 * node-cron scheduler.
 *
 * Schedule:
 *   - 03:15 UTC daily  → full refresh of all sources
 *   - Every hour       → events only (rolling 90-day window)
 *
 * Run with:  npm run schedule
 *
 * GitHub Actions is preferred for production; this is the local alternative.
 */
import cron from 'node-cron'
import { orchestrate } from './orchestrator.js'
import { logger } from '../utils/logger.js'

// Guard against concurrent runs
let isRunning = false

async function runWithGuard(label: string, fn: () => Promise<unknown>): Promise<void> {
  if (isRunning) {
    logger.warn({ label }, 'Previous run still in progress – skipping this tick')
    return
  }
  isRunning = true
  try {
    logger.info({ label }, 'Scheduled run starting')
    await fn()
    logger.info({ label }, 'Scheduled run finished')
  } catch (err) {
    logger.error({ label, err }, 'Scheduled run failed')
  } finally {
    isRunning = false
  }
}

// Full refresh – 03:15 UTC daily
cron.schedule('15 3 * * *', () => {
  runWithGuard('full-refresh', () => orchestrate())
})

// Events only – every hour (for the next 90 days)
cron.schedule('0 * * * *', () => {
  runWithGuard('events-hourly', () =>
    orchestrate({ types: ['event'] })
  )
})

logger.info(
  'Scheduler started. Jobs: full-refresh @ 03:15 UTC daily | events @ top of every hour'
)

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('SIGTERM received – shutting down scheduler')
  process.exit(0)
})
process.on('SIGINT', () => {
  logger.info('SIGINT received – shutting down scheduler')
  process.exit(0)
})
