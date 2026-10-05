/**
 * Complete AgendaQ venue + event import.
 *
 * Fetches the public AgendaQ business API, deduplicates embedded events by
 * source slug, and publishes commit-ready rows to ingestion_staging.
 *
 * Env: SUPABASE_DB_URL or PUBLISH_DB_URL (not needed for --dry-run).
 *
 * Usage:
 *   npx tsx scripts/agendaq-import.ts --dry-run
 *   npx tsx scripts/agendaq-import.ts
 *   npx tsx scripts/agendaq-import.ts --venues-only --offset 0 --limit 360
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import {
  publishToStaging,
  shutdownPublisher,
  sha256,
  stableStringify,
  type PublishResult,
  type PublishableEntity,
} from '../src/db/staging-publisher.js';
import {
  agendaqEventEntity,
  agendaqVenueEntity,
  collectUniqueAgendaqEvents,
  fetchAllAgendaq,
  normalizeAgendaqEvent,
  normalizeAgendaqVenue,
} from '../src/sources/agendaq/lib.js';

interface CliOptions {
  dryRun: boolean;
  venuesOnly: boolean;
  eventsOnly: boolean;
  offset: number;
  limit?: number;
  concurrency: number;
  crawlDelayMs: number;
  batchSize: number;
  managementApi: boolean;
}

function numberArg(name: string): number | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${name} requires a non-negative integer`);
  return parsed;
}

function cliOptions(): CliOptions {
  const venuesOnly = process.argv.includes('--venues-only');
  const eventsOnly = process.argv.includes('--events-only');
  if (venuesOnly && eventsOnly)
    throw new Error('--venues-only and --events-only are mutually exclusive');
  return {
    dryRun: process.argv.includes('--dry-run'),
    venuesOnly,
    eventsOnly,
    offset: numberArg('--offset') ?? 0,
    limit: numberArg('--limit'),
    concurrency: numberArg('--concurrency') ?? 1,
    crawlDelayMs: numberArg('--crawl-delay-ms') ?? 5_000,
    batchSize: numberArg('--batch-size') ?? 100,
    managementApi:
      process.argv.includes('--management-api') ||
      (!process.env.SUPABASE_DB_URL && !process.env.PUBLISH_DB_URL),
  };
}

function addResult(total: PublishResult, next: PublishResult): void {
  total.inserted += next.inserted;
  total.duplicates += next.duplicates;
  total.failed += next.failed;
}

const PROJECT_REF = 'xqeacpakadqfxjxjcewc';

function managementToken(): string {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_PAT;
  if (fromEnv) return fromEnv;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  const value = raw.startsWith('go-keyring-base64:')
    ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim()
    : raw;
  if (!value.startsWith('sbp_')) throw new Error('Unexpected Supabase CLI token format');
  return value;
}

async function managementSql(token: string, query: string, attempt = 1): Promise<unknown[]> {
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Queer Guide AgendaQ importer)',
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(180_000),
      },
    );
    const text = await response.text();
    if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 500)}`);
    if (!text) return [];
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return parsed;
    const record = parsed as Record<string, unknown>;
    const rows = record.result ?? record.rows ?? record.data;
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    return managementSql(token, query, attempt + 1);
  }
}

function managementInsertSql(
  entities: PublishableEntity[],
  targetTable: 'venues' | 'events',
): string {
  const rows = entities.map((entity) => ({
    sid: entity.source_id,
    raw: entity.raw_data,
    norm: entity.normalized_data,
    hash: sha256(stableStringify(entity.raw_data)),
  }));
  const payload = JSON.stringify(rows);
  let tag = 'agendaq_stage';
  while (payload.includes(`$${tag}$`)) tag += 'x';
  const entityType = targetTable === 'venues' ? 'venue' : 'event';
  return `
WITH inserted AS (
  INSERT INTO public.ingestion_staging
    (raw_data, normalized_data, source_type, source_name, source_entity_id, payload_hash,
     target_table, entity_type, pipeline_run_id, disposition, ai_validation_status,
     dedup_status, created_at, updated_at)
  SELECT x->'raw', x->'norm', 'api', 'agendaq', x->>'sid', x->>'hash',
         '${targetTable}', '${entityType}', NULL, 'pending', 'pending', 'pending', now(), now()
  FROM jsonb_array_elements($${tag}$${payload}$${tag}$::jsonb) AS x
  ON CONFLICT DO NOTHING
  RETURNING 1
)
SELECT count(*)::integer AS inserted FROM inserted;`;
}

async function managementPublish(
  token: string,
  entities: PublishableEntity[],
  targetTable: 'venues' | 'events',
): Promise<PublishResult> {
  const rows = await managementSql(token, managementInsertSql(entities, targetTable));
  const inserted = Number((rows[0] as Record<string, unknown> | undefined)?.inserted ?? 0);
  return { inserted, duplicates: entities.length - inserted, failed: 0 };
}

async function publishBatches(
  entities: PublishableEntity[],
  targetTable: 'venues' | 'events',
  batchSize: number,
  managementApi: boolean,
): Promise<PublishResult> {
  const total: PublishResult = { inserted: 0, duplicates: 0, failed: 0 };
  const token = managementApi ? managementToken() : null;
  for (let index = 0; index < entities.length; index += batchSize) {
    const batch = entities.slice(index, index + batchSize);
    const result = token
      ? await managementPublish(token, batch, targetTable)
      : await publishToStaging(batch, {
          sourceSlug: 'agendaq',
          sourceType: 'api',
          targetTable,
        });
    addResult(total, result);
    console.error(
      `[agendaq] ${targetTable} ${Math.min(index + batchSize, entities.length)}/${entities.length}` +
        ` inserted=${total.inserted} duplicates=${total.duplicates} failed=${total.failed}`,
    );
  }
  return total;
}

async function main(): Promise<void> {
  const options = cliOptions();
  let lastProgress = 0;
  const fetched = await fetchAllAgendaq({
    offset: options.offset,
    limit: options.limit,
    concurrency: options.concurrency,
    crawlDelayMs: options.crawlDelayMs,
    onProgress: (complete, total) => {
      const percent = Math.floor((complete / total) * 100);
      if (percent >= lastProgress + 10 || complete === total) {
        lastProgress = percent;
        console.error(`[agendaq] fetched ${complete}/${total} pages (${percent}%)`);
      }
    },
  });

  const venues = fetched.venues;
  const events = collectUniqueAgendaqEvents(venues);
  const venueIds = new Set(venues.map((venue) => venue.slug).filter(Boolean));
  const eventIds = new Set(events.keys());
  const venueMissingLocation = venues.filter((venue) => !venue.locations?.length).length;
  const eventValues = [...events.values()];
  const eventMissingLocation = eventValues.filter((event) => !event.locations?.length).length;
  const eventMissingStart = eventValues.filter(
    (event) => normalizeAgendaqEvent(event).start_date == null,
  ).length;
  const scheduledEvents = eventValues.filter(
    (event) => normalizeAgendaqEvent(event).schedule != null,
  ).length;
  const recurringEvents = eventValues.filter((event) =>
    (event.dates ?? []).some(([, rule]) => Boolean(rule.recurring?.trim())),
  ).length;

  const inventory = {
    reported_venues: fetched.reportedTotal,
    fetched_venues: venues.length,
    unique_venue_ids: venueIds.size,
    unique_event_ids: eventIds.size,
    recurring_event_definitions: recurringEvents,
    scheduled_event_definitions: scheduledEvents,
    venues_missing_location: venueMissingLocation,
    events_missing_location: eventMissingLocation,
    events_missing_start: eventMissingStart,
    pages_fetched: fetched.pagesFetched,
    offset: options.offset,
    limit: options.limit ?? null,
  };
  console.log(JSON.stringify({ mode: options.dryRun ? 'dry_run' : 'stage', inventory }, null, 2));

  if (options.dryRun) return;

  const fetchedAt = new Date();
  const results: Record<string, PublishResult> = {};
  try {
    if (!options.eventsOnly) {
      const venueEntities = venues.map((venue) => agendaqVenueEntity(venue, fetchedAt));
      results.venues = await publishBatches(
        venueEntities,
        'venues',
        options.batchSize,
        options.managementApi,
      );
    }
    if (!options.venuesOnly) {
      const eventEntities = eventValues.map((event) => agendaqEventEntity(event, fetchedAt));
      results.events = await publishBatches(
        eventEntities,
        'events',
        options.batchSize,
        options.managementApi,
      );
    }
  } finally {
    await shutdownPublisher();
  }

  console.log(JSON.stringify({ success: true, inventory, results }, null, 2));
  if (Object.values(results).some((result) => result.failed > 0)) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`[agendaq] fatal: ${(error as Error).stack ?? String(error)}`);
  await shutdownPublisher();
  process.exit(1);
});
