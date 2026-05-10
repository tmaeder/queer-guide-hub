import type { SourceConnector, ConnectorRunResult } from '../types/connector.js';
import type { EntityType, SourceName, SourceRawEntity } from '../types/schemas.js';
import { Sentry } from '../utils/sentry.js';
import { normalizeEntity } from '../normalize/normalize.js';
import {
  upsertEntity,
  saveSnapshot,
  startIngestRun,
  finishIngestRun,
  saveDedupeDecision,
  getEntitiesForDedupe,
  linkSourceToCanonical,
  touchEntity,
  recordNormalizeRejection
} from '../db/queries.js';
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

const STAGING_BATCH_SIZE = 200;
// Harmonized with Supabase pipeline-deduplicate defaults (auto_merge_min=0.90,
// review_min=0.75) so the local scraper and the unified pipeline apply the
// same policy. Previously the scraper used 0.85/0.5, producing merge/pending
// outcomes that the Supabase pipeline would re-evaluate differently.
const AUTO_MERGE_THRESHOLD = 0.90;
const REVIEW_THRESHOLD = 0.75;

/**
 * Run a scraping job for a single connector and entity type.
 *
 * Pipeline:
 *   discover → fetch → snapshot → normalize → (batched) dedupe → upsert
 *     → link new source→canonical → post-commit publish to staging
 *
 * Key invariants maintained in this function:
 *  - Dedupe lookups are cached per-city inside the batch (no per-item DB query).
 *  - Merge-skip decisions still refresh last_seen_at + register the new
 *    source in scraper_entity_map so multi-source coverage is observable.
 *  - Only entities that passed normalization are published to staging.
 *  - Staging is flushed in batches of 200 inside the loop (not all at end).
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

  if (!connector.isEnabled()) {
    log.info({ source: sourceName }, 'Source is disabled via kill switch');
    result.duration = Date.now() - startTime;
    return result;
  }

  if (!connector.config.supportedTypes.includes(entityType)) {
    log.info({ source: sourceName, entityType }, 'Entity type not supported by this source');
    result.duration = Date.now() - startTime;
    return result;
  }

  const runId = options.dryRun ? 'dry-run' : await startIngestRun(sourceName, entityType);
  let insertedCount = 0;
  let updatedCount = 0;
  let dedupedCount = 0;
  let stagingBuffer: SourceRawEntity[] = [];

  // Per-run field coverage counters. Reported alongside the run stats so we
  // can track "% of entities from source X that had geo/phone/website/images"
  // over time and catch regressions before they hit users.
  const coverage = {
    geo: 0, phone: 0, website: 0, images: 0, tags: 0, address: 0, description: 0,
  };

  const publishEnabled = !options.dryRun && process.env.PUBLISH_TO_STAGING === '1';

  // Per-city dedup cache populated lazily within this run.
  const dedupCacheByCity = new Map<string, DedupeCandidate[]>();
  const CACHE_KEY_NO_CITY = '__nocity__';

  const getCityCandidates = async (city: string | null): Promise<DedupeCandidate[]> => {
    const key = city ? city.toLowerCase().trim() : CACHE_KEY_NO_CITY;
    const cached = dedupCacheByCity.get(key);
    if (cached) return cached;
    const rows = await getEntitiesForDedupe(entityType, city ? [city] : undefined);
    const mapped: DedupeCandidate[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      country: r.country,
      address: r.address,
      website: r.website,
      lat: r.lat,
      lng: r.lng,
      entityType,
    }));
    dedupCacheByCity.set(key, mapped);
    return mapped;
  };

  const flushStaging = async (): Promise<void> => {
    if (!publishEnabled || stagingBuffer.length === 0) return;
    const batch = stagingBuffer;
    stagingBuffer = [];
    try {
      const pub = await publishToStaging(batch, {
        sourceSlug: sourceName,
        sourceType: connector.config.sourceType ?? 'scrape',
      });
      log.info({ source: sourceName, ...pub, batchSize: batch.length }, 'Published batch to ingestion_staging');
    } catch (err) {
      log.error({ source: sourceName, err }, 'publishToStaging batch failed');
      Sentry.captureException(err as Error, { tags: { source: sourceName, stage: 'publish_to_staging' } });
    }
  };

  try {
    log.info({ source: sourceName, entityType }, 'Starting connector run');

    const maxPages = options.maxPages ?? connector.config.maxPagesPerRun;
    let pageCount = 0;

    for await (const batch of connector.discover(entityType)) {
      result.discovered += batch.length;

      for (const discovered of batch) {
        if (pageCount >= maxPages) {
          log.info({ source: sourceName, maxPages }, 'Reached max pages limit');
          break;
        }

        try {
          const rawEntities = await connector.fetchDetail(discovered.url);
          pageCount++;
          result.fetched++;

          for (const rawEntity of rawEntities) {
            if (rawEntity.raw_data === null) {
              result.blockedByRobots++;
              continue;
            }

            // Skip entities whose type doesn't match the job's requested type
            // (e.g. patroc returns venues alongside events on city pages).
            if (rawEntity.entity_type !== entityType) continue;

            result.parsed++;

            if (options.dryRun) {
              log.info({ sourceId: rawEntity.source_id, type: rawEntity.entity_type }, 'DRY RUN: would process');
              continue;
            }

            // Snapshot BEFORE normalize — we want audit of raw payload even if
            // normalization rejects it. The snapshot path dedupes by hash so
            // repeat scrapes of unchanged pages don't bloat storage.
            const content = JSON.stringify(rawEntity.raw_data);
            const hash = hashContent(content);
            await saveSnapshot(sourceName, rawEntity.url, 'json', hash, content, config.scraper.snapshotRetention);

            const normResult = normalizeEntity(rawEntity);
            if (!normResult.ok) {
              log.debug(
                { sourceId: rawEntity.source_id, reason: normResult.reason },
                'Entity failed normalization',
              );
              await recordNormalizeRejection(
                sourceName,
                rawEntity.source_id,
                entityType,
                normResult.reason,
                rawEntity.raw_data,
              );
              continue;
            }
            const normalized = normResult.entity;

            // Field-coverage counters — incremented once per successfully
            // normalized entity, before dedup/upsert. Tracks what the source
            // actually delivered, not what downstream pipelines inferred.
            const d = normalized.data as Record<string, unknown>;
            if (d.lat != null && d.lng != null) coverage.geo++;
            if (d.phone) coverage.phone++;
            if (d.website) coverage.website++;
            if (Array.isArray(d.images) && (d.images as unknown[]).length > 0) coverage.images++;
            if (Array.isArray(d.tags) && (d.tags as unknown[]).length > 0) coverage.tags++;
            if (d.address) coverage.address++;
            if (d.description) coverage.description++;

            const candidateCity = (normalized.data.city as string | null) ?? null;
            const existing = await getCityCandidates(candidateCity);

            const candidate: DedupeCandidate = {
              id: 'candidate',
              name: normalized.data.name as string,
              city: candidateCity,
              country: normalized.data.country as string | null,
              address: normalized.data.address as string | null,
              website: normalized.data.website as string | null,
              lat: normalized.data.lat as number | null,
              lng: normalized.data.lng as number | null,
              entityType,
            };

            const match = findBestMatch(candidate, existing);

            if (match && match.confidence > AUTO_MERGE_THRESHOLD) {
              // High-confidence duplicate. Do NOT insert a new row — but DO
              // register the new source→canonical mapping and refresh
              // last_seen_at so multi-source coverage stays observable.
              const existingId = match.entityA === 'candidate' ? match.entityB : match.entityA;
              dedupedCount++;
              await linkSourceToCanonical(sourceName, rawEntity.source_id, entityType, existingId, match.confidence);
              await touchEntity(entityType, existingId);
              await saveDedupeDecision(
                entityType,
                existingId,
                null,
                match.method,
                match.confidence,
                'merge',
                { sourceName, sourceId: rawEntity.source_id },
              );
              log.debug(
                { sourceId: rawEntity.source_id, existingId, confidence: match.confidence },
                'Deduped — linked new source mapping',
              );
              // Still publish to staging so the Supabase pipeline can augment
              // the canonical entity with any fields only the new source provides.
              if (publishEnabled) {
                stagingBuffer.push(rawEntity);
                if (stagingBuffer.length >= STAGING_BATCH_SIZE) await flushStaging();
              }
              continue;
            }

            const { id, inserted } = await upsertEntity({
              entityType,
              data: normalized.data,
              sourceUrl: rawEntity.url,
              sourceName,
              sourceId: rawEntity.source_id,
            });

            if (inserted) insertedCount++;
            else updatedCount++;

            // Prime the cache with the new/updated entity so subsequent
            // items in the same batch can dedup against it.
            const cacheKey = candidateCity ? candidateCity.toLowerCase().trim() : CACHE_KEY_NO_CITY;
            const cacheList = dedupCacheByCity.get(cacheKey);
            if (cacheList && !cacheList.some((c) => c.id === id)) {
              cacheList.push({ ...candidate, id });
            }

            // Save low-confidence matches for review, with the real IDs.
            if (match && match.confidence > REVIEW_THRESHOLD) {
              const existingId = match.entityA === 'candidate' ? match.entityB : match.entityA;
              if (existingId !== id) {
                await saveDedupeDecision(
                  entityType,
                  id,
                  existingId,
                  match.method,
                  match.confidence,
                  'pending',
                  { sourceName, sourceId: rawEntity.source_id },
                );
              }
            }

            if (publishEnabled) {
              stagingBuffer.push(rawEntity);
              if (stagingBuffer.length >= STAGING_BATCH_SIZE) await flushStaging();
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

    if (!options.dryRun) {
      await finishIngestRun(runId, result.errors.length > 0 ? 'partial' : 'completed', {
        pages_fetched: result.fetched,
        entities_parsed: result.parsed,
        entities_inserted: insertedCount,
        entities_updated: updatedCount,
        entities_deduped: dedupedCount,
        blocked_by_robots: result.blockedByRobots,
        failed_requests: result.errors.length,
        coverage_geo: coverage.geo,
        coverage_phone: coverage.phone,
        coverage_website: coverage.website,
        coverage_images: coverage.images,
        coverage_tags: coverage.tags,
        coverage_address: coverage.address,
        coverage_description: coverage.description,
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
    // Final flush of any residual staging entries.
    await flushStaging();
    await connector.cleanup();
  }

  result.duration = Date.now() - startTime;

  const pct = (n: number) => (result.parsed > 0 ? Math.round((n / result.parsed) * 1000) / 10 : 0);
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
      coverage: {
        geo_pct:         pct(coverage.geo),
        phone_pct:       pct(coverage.phone),
        website_pct:     pct(coverage.website),
        images_pct:      pct(coverage.images),
        tags_pct:        pct(coverage.tags),
        address_pct:     pct(coverage.address),
        description_pct: pct(coverage.description),
      },
    },
    'Connector run complete',
  );

  return result;
}

/**
 * Run all connectors for all their supported entity types.
 *
 * Each connector targets its own domain, so their per-domain crawl delays
 * don't interfere. We run up to SCRAPER_CONNECTOR_PARALLELISM connectors in
 * parallel (default 3). Entity types within a single connector remain
 * sequential so shared browser sessions aren't re-used concurrently.
 */
export async function runAll(options: RunOptions = {}): Promise<ConnectorRunResult[]> {
  const { getEnabledConnectors } = await import('../sources/index.js');
  const { mapWithLimit } = await import('../utils/concurrency.js');
  const connectors = getEnabledConnectors();
  const parallelism = Math.max(
    1,
    parseInt(process.env.SCRAPER_CONNECTOR_PARALLELISM ?? '3', 10),
  );

  const outcomes = await mapWithLimit(connectors, parallelism, async (connector) => {
    const perConnector: ConnectorRunResult[] = [];
    for (const entityType of connector.config.supportedTypes) {
      perConnector.push(await runConnector(connector, entityType, options));
    }
    return perConnector;
  });

  // Flatten; surface per-connector rejections as synthetic failure results so
  // nothing silently disappears from the aggregated report.
  const results: ConnectorRunResult[] = [];
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    if (o.ok) {
      results.push(...o.value);
    } else {
      const c = connectors[i];
      log.error({ source: c.config.name, err: o.error }, 'Connector failed at top level');
      results.push({
        source: c.config.name,
        entityType: null,
        discovered: 0,
        fetched: 0,
        parsed: 0,
        errors: [{ url: '', message: o.error.message }],
        blockedByRobots: 0,
        duration: 0,
      });
    }
  }
  return results;
}
