import type { SourceConnector, ConnectorRunResult } from '../types/connector.js';
import type { EntityType, SourceName, SourceRawEntity } from '../types/schemas.js';
import { Sentry } from '../utils/sentry.js';
import { normalizeEntity } from '../normalize/normalize.js';
import { upsertEntity, saveSnapshot, startIngestRun, finishIngestRun, saveDedupeDecision, getEntitiesForDedupe } from '../db/queries.js';
import { publishToStaging } from '../db/staging-publisher.js';
import { findBestMatch, type DedupeCandidate } from '../utils/dedupe.js';
import { hashContent } from '../utils/fetch.js';
import { config } from '../config.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('orchestrator');

export interface RunOptions {
  source?: SourceName;
  entityType?: EntityType;
  dryRun?: boolean;
  maxPages?: number;
}

/**
 * Run a scraping job for a single connector and entity type.
 * Handles the full pipeline: discover → fetch → normalize → dedupe → persist.
 */
export async function runConnector(
  connector: SourceConnector,
  entityType: EntityType,
  options: RunOptions = {},
): Promise<ConnectorRunResult> {
  const sourceName = connector.config.name;
  const startTime = Date.now();

  const result: ConnectorRunResult = {
    source: sourceName,
    entityType,
    discovered: 0,
    fetched: 0,
    parsed: 0,
    errors: [],
    blockedByRobots: 0,
    duration: 0,
  };

  // Check if source is enabled
  if (!connector.isEnabled()) {
    log.info({ source: sourceName }, 'Source is disabled via kill switch');
    result.duration = Date.now() - startTime;
    return result;
  }

  // Check if entity type is supported
  if (!connector.config.supportedTypes.includes(entityType)) {
    log.info({ source: sourceName, entityType }, 'Entity type not supported by this source');
    result.duration = Date.now() - startTime;
    return result;
  }

  // Start ingest run
  const runId = options.dryRun ? 'dry-run' : await startIngestRun(sourceName, entityType);
  let insertedCount = 0;
  let updatedCount = 0;
  let dedupedCount = 0;
  const stagingBuffer: Array<import('../types/schemas.js').SourceRawEntity> = [];

  try {
    log.info({ source: sourceName, entityType }, 'Starting connector run');

    const maxPages = options.maxPages ?? connector.config.maxPagesPerRun;
    let pageCount = 0;

    // Phase 1: Discover URLs
    for await (const batch of connector.discover(entityType)) {
      result.discovered += batch.length;

      for (const discovered of batch) {
        if (pageCount >= maxPages) {
          log.info({ source: sourceName, maxPages }, 'Reached max pages limit');
          break;
        }

        try {
          // Phase 2: Fetch detail
          const rawEntities = await connector.fetchDetail(discovered.url);
          pageCount++;
          result.fetched++;

          // Collect for publish-to-staging (deferred, post-loop) when enabled.
          if (!options.dryRun && process.env.PUBLISH_TO_STAGING === '1') {
            const valid = rawEntities.filter((e) => e.raw_data !== null);
            if (valid.length > 0) stagingBuffer.push(...valid);
          }

          for (const rawEntity of rawEntities) {
            // Check if blocked
            if (rawEntity.raw_data === null) {
              result.blockedByRobots++;
              continue;
            }

            result.parsed++;

            if (options.dryRun) {
              log.info({ sourceId: rawEntity.source_id, type: rawEntity.entity_type }, 'DRY RUN: would process');
              continue;
            }

            // Phase 3: Save snapshot
            const content = JSON.stringify(rawEntity.raw_data);
            const hash = hashContent(content);
            await saveSnapshot(sourceName, rawEntity.url, 'json', hash, content, config.scraper.snapshotRetention);

            // Phase 4: Normalize
            const normalized = normalizeEntity(rawEntity);
            if (!normalized) {
              log.debug({ sourceId: rawEntity.source_id }, 'Entity failed normalization');
              continue;
            }

            // Phase 5: Dedupe check
            const existingEntities = await getEntitiesForDedupe(
              entityType,
              normalized.data.city as string | undefined,
            );

            const candidate: DedupeCandidate = {
              id: 'candidate',
              name: normalized.data.name as string,
              city: normalized.data.city as string | null,
              country: normalized.data.country as string | null,
              address: normalized.data.address as string | null,
              website: normalized.data.website as string | null,
              entityType,
            };

            const dedupeExisting = existingEntities.map((e) => ({
              ...e,
              entityType,
            }));

            const match = findBestMatch(candidate, dedupeExisting);
            if (match && match.confidence > 0.85) {
              // High-confidence duplicate — update existing instead of inserting new
              dedupedCount++;
              const existingId = match.entityA === 'candidate' ? match.entityB : match.entityA;
              await saveDedupeDecision(entityType, existingId, existingId, match.method, match.confidence, 'merge');
              log.debug({ sourceId: rawEntity.source_id, existingId, confidence: match.confidence }, 'Deduped');
              continue;
            }

            // Phase 6: Upsert
            const { id, inserted } = await upsertEntity({
              entityType,
              data: normalized.data,
              sourceUrl: rawEntity.url,
              sourceName,
              sourceId: rawEntity.source_id,
            });

            if (inserted) {
              insertedCount++;
            } else {
              updatedCount++;
            }

            // Save low-confidence matches for review
            if (match && match.confidence > 0.5) {
              const existingId = match.entityA === 'candidate' ? match.entityB : match.entityA;
              await saveDedupeDecision(entityType, id, existingId, match.method, match.confidence, 'pending');
            }
          }
        } catch (err) {
          const error = err as Error;
          result.errors.push({
            url: discovered.url,
            message: error.message,
            statusCode: undefined,
          });
          log.error({ url: discovered.url, err }, 'Error processing URL');
          Sentry.captureException(error, {
            tags: { source: sourceName, entity_type: entityType },
            extra: { url: discovered.url },
          });
        }
      }

      if (pageCount >= maxPages) break;
    }

    // Finish ingest run
    if (!options.dryRun) {
      await finishIngestRun(runId, result.errors.length > 0 ? 'partial' : 'completed', {
        pages_fetched: result.fetched,
        entities_parsed: result.parsed,
        entities_inserted: insertedCount,
        entities_updated: updatedCount,
        entities_deduped: dedupedCount,
        blocked_by_robots: result.blockedByRobots,
        failed_requests: result.errors.length,
        errors: result.errors.map((e) => ({
          url: e.url,
          message: e.message,
          status_code: e.statusCode ?? null,
          stack: null,
          timestamp: new Date(),
        })),
      } as any);
    }
  } catch (err) {
    log.error({ source: sourceName, err }, 'Connector run failed');
    if (!options.dryRun) {
      await finishIngestRun(runId, 'failed', {
        pages_fetched: result.fetched,
        entities_parsed: result.parsed,
        errors: [{
          url: '',
          message: (err as Error).message,
          status_code: null,
          stack: (err as Error).stack ?? null,
          timestamp: new Date(),
        }],
      } as any);
    }
  } finally {
    // Publish collected raw entities to Supabase ingestion_staging.
    if (stagingBuffer.length > 0) {
      try {
        const pub = await publishToStaging(stagingBuffer, { sourceSlug: sourceName });
        log.info({ source: sourceName, ...pub }, 'Published to ingestion_staging');
      } catch (err) {
        log.error({ source: sourceName, err }, 'publishToStaging failed (continuing)');
        Sentry.captureException(err as Error, { tags: { source: sourceName, stage: 'publish_to_staging' } });
      }
    }
    await connector.cleanup();
  }

  result.duration = Date.now() - startTime;

  log.info(
    {
      source: sourceName,
      entityType,
      discovered: result.discovered,
      fetched: result.fetched,
      parsed: result.parsed,
      inserted: insertedCount,
      updated: updatedCount,
      deduped: dedupedCount,
      errors: result.errors.length,
      blocked: result.blockedByRobots,
      durationMs: result.duration,
    },
    'Connector run complete',
  );

  return result;
}

/**
 * Run all connectors for all their supported entity types.
 */
export async function runAll(options: RunOptions = {}): Promise<ConnectorRunResult[]> {
  const { getEnabledConnectors } = await import('../sources/index.js');
  const connectors = getEnabledConnectors();
  const results: ConnectorRunResult[] = [];

  for (const connector of connectors) {
    for (const entityType of connector.config.supportedTypes) {
      const result = await runConnector(connector, entityType, options);
      results.push(result);
    }
  }

  return results;
}
