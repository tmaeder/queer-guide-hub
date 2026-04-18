/**
 * CLI entry point.
 *
 * Usage:
 *   npm run scrape -- --source=wikipedia
 *   npm run scrape -- --source=all
 *   npm run scrape -- --source=travelgay --type=venue
 *   npm run scrape -- --source=iglta --type=event --since=24h
 *   npm run scrape -- --source=all --max-pages=50
 *   npm run migrate   (runs DB migrations separately)
 */
import 'dotenv/config'
import { orchestrate } from './orchestrator.js'
import { logger } from '../utils/logger.js'
import { closeDb } from '../db/client.js'
import { parseDuration } from '../utils/date.js'
import { ALL_SOURCES } from '../utils/config.js'
import type { EntityType } from '../normalize/schema.js'
import type { SourceName } from '../utils/config.js'

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (const arg of argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, '').split('=')
    if (key) args[key] = val ?? 'true'
  }
  return args
}

function printUsage(): void {
  console.log(`
Usage:
  npm run scrape -- [options]

Options:
  --source=<name|all>    Source to scrape (wikipedia|iglta|outsavvy|travelgay|patroc|misterbandb|all)
  --type=<types>         Entity types: venue,event,stay,place  (comma-separated, default: all)
  --since=<duration>     Only run if last run was before NOW - duration (e.g. 24h, 7d)
  --max-pages=<n>        Max pages per source (default: 500)
  --dry-run              Parse but do not write to DB

Examples:
  npm run scrape -- --source=wikipedia
  npm run scrape -- --source=all
  npm run scrape -- --source=travelgay --type=venue
  npm run scrape -- --source=iglta --since=24h
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  if ('help' in args || 'h' in args) {
    printUsage()
    process.exit(0)
  }

  // --- Source ---
  const sourceArg = args['source'] ?? 'all'
  let sources: SourceName[]

  if (sourceArg === 'all') {
    sources = ALL_SOURCES as unknown as SourceName[]
  } else {
    const requested = sourceArg.split(',').map((s) => s.trim()) as SourceName[]
    const invalid = requested.filter(
      (s) => !ALL_SOURCES.includes(s as (typeof ALL_SOURCES)[number])
    )
    if (invalid.length > 0) {
      logger.error({ invalid }, 'Unknown source(s)')
      printUsage()
      process.exit(1)
    }
    sources = requested
  }

  // --- Types ---
  const validTypes: EntityType[] = ['venue', 'event', 'stay', 'place']
  let types: EntityType[] = validTypes

  if (args['type']) {
    const requested = args['type'].split(',').map((t) => t.trim()) as EntityType[]
    const invalid = requested.filter((t) => !validTypes.includes(t))
    if (invalid.length > 0) {
      logger.error({ invalid }, 'Unknown entity type(s)')
      printUsage()
      process.exit(1)
    }
    types = requested
  }

  // --- since ---
  let sinceMs: number | undefined
  if (args['since']) {
    sinceMs = parseDuration(args['since']) ?? undefined
    if (!sinceMs) {
      logger.error({ since: args['since'] }, 'Invalid --since format (use e.g. 24h, 7d)')
      process.exit(1)
    }
  }

  // --- Max pages ---
  const maxPages = args['max-pages'] ? parseInt(args['max-pages'], 10) : undefined

  // --- Dry run ---
  const dryRun = 'dry-run' in args

  if (dryRun) {
    logger.info('DRY RUN mode – no writes to database')
  }

  logger.info(
    { sources, types, sinceMs, maxPages, dryRun },
    'Starting scrape'
  )

  const summary = await orchestrate({
    sources,
    types,
    ...(sinceMs !== undefined ? { sinceMs } : {}),
    ...(maxPages !== undefined ? { maxPagesPerSource: maxPages } : {}),
  })

  logger.info(
    {
      sources: summary.sources,
      pagesFetched: summary.totalPagesFetched,
      entitiesParsed: summary.totalEntitiesParsed,
      inserted: summary.totalInserted,
      updated: summary.totalUpdated,
      deduped: summary.totalDeduped,
      blocked: summary.totalBlocked,
      failed: summary.totalFailed,
      durationMs: summary.durationMs,
    },
    'Scrape complete'
  )

  if (summary.errors.length > 0) {
    logger.warn({ count: summary.errors.length }, 'Some errors occurred (see logs above)')
  }

  process.exit(summary.totalFailed > 0 ? 1 : 0)
}

main()
  .catch((err) => {
    logger.error({ err }, 'CLI fatal error')
    process.exit(1)
  })
  .finally(closeDb)
