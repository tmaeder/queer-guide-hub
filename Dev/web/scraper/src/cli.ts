import './utils/sentry.js';
import 'dotenv/config';
import { Command } from 'commander';
import { runAll, runConnector } from './jobs/orchestrator.js';
import { startScheduler } from './jobs/scheduler.js';
import { getConnector, getEnabledConnectors } from './sources/index.js';
import { runMigrations } from './db/migrate.js';
import { closePool } from './db/pool.js';
import { childLogger } from './utils/logger.js';
import { SourceName, EntityType } from './types/schemas.js';

const log = childLogger('cli');

const program = new Command();

program
  .name('queer-guide-scraper')
  .description('LGBTQ+ venue, event, and place scraping system')
  .version('1.0.0');

program
  .command('scrape')
  .description('Run scraping for one or all sources')
  .option('-s, --source <name>', 'Source name (patroc, outsavvy, travelgay, iglta, misterbnb, wikipedia)')
  .option('-t, --type <type>', 'Entity type (venue, event, place, stay)')
  .option('-n, --dry-run', 'Dry run — discover and parse but do not persist')
  .option('-m, --max-pages <n>', 'Maximum pages to fetch per source', parseInt)
  .option('--since <duration>', 'Only process items newer than (e.g., 24h, 7d)')
  .action(async (opts) => {
    try {
      if (opts.source && opts.source !== 'all') {
        // Validate source name
        const parsed = SourceName.safeParse(opts.source);
        if (!parsed.success) {
          console.error(`Unknown source: ${opts.source}. Valid sources: ${SourceName.options.join(', ')}`);
          process.exit(1);
        }

        const connector = getConnector(parsed.data);

        if (opts.type) {
          const typeParsed = EntityType.safeParse(opts.type);
          if (!typeParsed.success) {
            console.error(`Unknown type: ${opts.type}. Valid types: ${EntityType.options.join(', ')}`);
            process.exit(1);
          }
          const result = await runConnector(connector, typeParsed.data, {
            dryRun: opts.dryRun,
            maxPages: opts.maxPages,
          });
          printResult(result);
        } else {
          // Run all supported types for this source
          for (const entityType of connector.config.supportedTypes) {
            const result = await runConnector(connector, entityType, {
              dryRun: opts.dryRun,
              maxPages: opts.maxPages,
            });
            printResult(result);
          }
        }
      } else {
        // Run all sources
        const results = await runAll({
          dryRun: opts.dryRun,
          maxPages: opts.maxPages,
        });
        console.log('\n=== Summary ===');
        for (const r of results) {
          printResult(r);
        }
      }
    } catch (err) {
      log.error({ err }, 'Scrape command failed');
      process.exit(1);
    } finally {
      await closePool();
    }
  });

program
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    try {
      await runMigrations();
      console.log('Migrations complete');
    } catch (err) {
      log.error({ err }, 'Migration failed');
      process.exit(1);
    } finally {
      await closePool();
    }
  });

program
  .command('scheduler')
  .description('Start the local cron scheduler')
  .action(() => {
    startScheduler();
    console.log('Scheduler running. Press Ctrl+C to stop.');
  });

program
  .command('list-sources')
  .description('List all available sources and their status')
  .action(() => {
    const connectors = getEnabledConnectors();
    console.log('\nEnabled sources:');
    for (const c of connectors) {
      console.log(`  ${c.config.name}`);
      console.log(`    Base URL: ${c.config.baseUrl}`);
      console.log(`    Types: ${c.config.supportedTypes.join(', ')}`);
      console.log(`    Crawl delay: ${c.config.crawlDelay}s`);
      console.log(`    Max pages/run: ${c.config.maxPagesPerRun}`);
      console.log(`    Needs browser: ${c.config.requiresBrowser}`);
      console.log();
    }
  });

function printResult(result: import('./types/connector.js').ConnectorRunResult): void {
  console.log(`\n[${result.source}] ${result.entityType || 'all'}`);
  console.log(`  Discovered: ${result.discovered}`);
  console.log(`  Fetched: ${result.fetched}`);
  console.log(`  Parsed: ${result.parsed}`);
  console.log(`  Blocked: ${result.blockedByRobots}`);
  console.log(`  Errors: ${result.errors.length}`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  if (result.errors.length > 0) {
    console.log('  Error details:');
    for (const err of result.errors.slice(0, 5)) {
      console.log(`    - ${err.url}: ${err.message}`);
    }
    if (result.errors.length > 5) {
      console.log(`    ... and ${result.errors.length - 5} more`);
    }
  }
}

program.parse();
