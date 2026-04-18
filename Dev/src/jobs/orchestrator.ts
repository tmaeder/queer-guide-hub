/**
 * Orchestrator: runs one or more connectors, normalises results,
 * deduplicates, and persists to the database.
 *
 * Writes a summary IngestRun record on completion.
 */
import { getConnector, getRegistry } from '../sources/registry.js'
import { normalize } from '../normalize/index.js'
import { upsertVenue } from '../db/queries/venues.js'
import { upsertEvent } from '../db/queries/events.js'
import { upsertPlace } from '../db/queries/places.js'
import { upsertStay } from '../db/queries/stays.js'
import { upsertEntityMap, findBySourceId } from '../db/queries/sourceEntityMap.js'
import {
  startIngestRun,
  completeIngestRun,
  recordFailedRequest,
} from '../db/queries/ingestRuns.js'
import { computeStrongKey, compareEntities } from '../utils/dedupe.js'
import { logger } from '../utils/logger.js'
import { ALL_SOURCES } from '../utils/config.js'
import type { EntityType } from '../normalize/schema.js'
import type { SourceName } from '../utils/config.js'
import type { NormalizedVenue, NormalizedEvent, NormalizedPlace, NormalizedStay } from '../normalize/schema.js'
import type { ConnectorResult } from '../sources/base.js'

export interface OrchestratorOptions {
  sources?: SourceName[]
  types?: EntityType[]
  maxPagesPerSource?: number
  sinceMs?: number
}

export interface OrchestratorSummary {
  sources: SourceName[]
  totalPagesFetched: number
  totalEntitiesParsed: number
  totalInserted: number
  totalUpdated: number
  totalDeduped: number
  totalBlocked: number
  totalFailed: number
  errors: Array<{ source: string; url: string; message: string }>
  durationMs: number
}

/** Run the full ingest pipeline for the given sources. */
export async function orchestrate(
  opts: OrchestratorOptions = {}
): Promise<OrchestratorSummary> {
  const start = Date.now()
  const sources: SourceName[] = opts.sources ?? (ALL_SOURCES as unknown as SourceName[])
  const entityTypes = opts.types ?? (['venue', 'event', 'stay', 'place'] as EntityType[])

  let totalPagesFetched = 0
  let totalEntitiesParsed = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalDeduped = 0
  let totalBlocked = 0
  let totalFailed = 0
  const allErrors: Array<{ source: string; url: string; message: string }> = []

  for (const sourceName of sources) {
    const runId = await startIngestRun(sourceName, entityTypes).catch(() => 'no-db')

    logger.info({ source: sourceName }, 'Starting ingest run')

    let result: ConnectorResult
    try {
      const connector = getConnector(sourceName)
      result = await connector.run({
        types: entityTypes,
        maxPages: opts.maxPagesPerSource ?? 500,
      })
    } catch (err) {
      const e = err as Error
      logger.error({ source: sourceName, err }, 'Connector run threw unexpectedly')
      result = {
        source: sourceName,
        blocked: false,
        pagesFetched: 0,
        entitiesParsed: 0,
        errors: [{ url: sourceName, message: e.message, ...(e.stack !== undefined ? { stack: e.stack } : {}) }],
        entities: [],
      }
    }

    if (result.blocked) {
      logger.warn(
        { source: sourceName, reason: result.blockedReason },
        'Source blocked – skipping'
      )
      totalBlocked++

      if (runId !== 'no-db') {
        await completeIngestRun(runId, {
          pagesFetched: 0,
          entitiesParsed: 0,
          entitiesInserted: 0,
          entitiesUpdated: 0,
          entitiesDeduped: 0,
          entitiesBlocked: 1,
          entitiesFailed: 0,
        }, [], 'completed', { blockedReason: result.blockedReason })
      }
      continue
    }

    // Process entities
    let inserted = 0
    let updated = 0
    const deduped = 0
    let failed = 0

    for (const rawEntity of result.entities) {
      // Filter by requested entity types
      if (!entityTypes.includes(rawEntity.entityType as EntityType)) continue

      try {
        // Check if already mapped
        const existing = await findBySourceId(
          rawEntity.source,
          rawEntity.sourceId,
          rawEntity.entityType
        ).catch(() => null)

        const normalized = normalize(rawEntity)
        if (!normalized) {
          logger.debug({ sourceId: rawEntity.sourceId }, 'Normalization returned null')
          failed++
          continue
        }

        let canonicalId: string
        let isNew = true

        if (existing) {
          // Already have a mapping – update the entity
          canonicalId = existing.canonical_entity_id
          isNew = false
        } else {
          // Persist the entity
          canonicalId = await persistEntity(normalized)
          isNew = true
        }

        // Update entity map
        await upsertEntityMap({
          source: rawEntity.source,
          sourceId: rawEntity.sourceId,
          sourceUrl: rawEntity.url,
          canonicalEntityId: canonicalId,
          entityType: rawEntity.entityType,
          confidence: 1.0,
          matchMethod: 'strong',
        }).catch((err) => logger.warn({ err }, 'Entity map upsert failed'))

        if (isNew) inserted++
        else updated++
      } catch (err) {
        const e = err as Error
        logger.error({ err, sourceId: rawEntity.sourceId }, 'Entity persist failed')
        failed++

        if (runId !== 'no-db') {
          await recordFailedRequest(runId, sourceName, rawEntity.url, {
            message: e.message,
            ...(e.stack !== undefined ? { stack: e.stack } : {}),
          }).catch(() => {})
        }
      }
    }

    // Record connector errors
    for (const ce of result.errors) {
      allErrors.push({ source: sourceName, ...ce })
      if (runId !== 'no-db') {
        await recordFailedRequest(runId, sourceName, ce.url, {
          message: ce.message,
          ...(ce.stack !== undefined ? { stack: ce.stack } : {}),
          ...(ce.status !== undefined ? { httpStatus: ce.status } : {}),
        }).catch(() => {})
      }
    }

    totalPagesFetched += result.pagesFetched
    totalEntitiesParsed += result.entitiesParsed
    totalInserted += inserted
    totalUpdated += updated
    totalDeduped += deduped
    totalFailed += failed + result.errors.length

    const status =
      result.errors.length > 0 && inserted + updated === 0 ? 'failed' : 'completed'

    if (runId !== 'no-db') {
      await completeIngestRun(
        runId,
        {
          pagesFetched: result.pagesFetched,
          entitiesParsed: result.entitiesParsed,
          entitiesInserted: inserted,
          entitiesUpdated: updated,
          entitiesDeduped: deduped,
          entitiesBlocked: result.blocked ? 1 : 0,
          entitiesFailed: failed,
        },
        result.errors.map((e) => ({ url: e.url, message: e.message, ...(e.status !== undefined ? { status: e.status } : {}) })),
        status
      ).catch((err) => logger.warn({ err }, 'completeIngestRun failed'))
    }

    logger.info(
      {
        source: sourceName,
        pagesFetched: result.pagesFetched,
        inserted,
        updated,
        failed,
      },
      'Ingest run complete'
    )
  }

  const summary: OrchestratorSummary = {
    sources,
    totalPagesFetched,
    totalEntitiesParsed,
    totalInserted,
    totalUpdated,
    totalDeduped,
    totalBlocked,
    totalFailed,
    errors: allErrors,
    durationMs: Date.now() - start,
  }

  logger.info(summary, 'Orchestration complete')
  return summary
}

async function persistEntity(entity: ReturnType<typeof normalize>): Promise<string> {
  if (!entity) throw new Error('Cannot persist null entity')

  switch (entity.entityType) {
    case 'venue':
      return upsertVenue(entity as NormalizedVenue)
    case 'event':
      return upsertEvent(entity as NormalizedEvent)
    case 'place':
      return upsertPlace(entity as NormalizedPlace)
    case 'stay':
      return upsertStay(entity as NormalizedStay)
    default: {
      const _e: never = entity
      throw new Error(`Unknown entity type`)
    }
  }
}
