import { getDb } from '../client.js'

export interface SourceEntityMapRow {
  id: string
  source: string
  source_id: string
  source_url: string
  canonical_entity_id: string
  entity_type: string
  confidence: number
  match_method: string
}

export async function upsertEntityMap(p: {
  source: string
  sourceId: string
  sourceUrl: string
  canonicalEntityId: string
  entityType: string
  confidence?: number
  matchMethod?: string
}): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO source_entity_maps
      (source, source_id, source_url, canonical_entity_id, entity_type, confidence, match_method)
    VALUES
      (${p.source}, ${p.sourceId}, ${p.sourceUrl}, ${p.canonicalEntityId},
       ${p.entityType}, ${p.confidence ?? 1.0}, ${p.matchMethod ?? 'strong'})
    ON CONFLICT (source, source_id, entity_type) DO UPDATE SET
      source_url          = EXCLUDED.source_url,
      canonical_entity_id = EXCLUDED.canonical_entity_id,
      confidence          = EXCLUDED.confidence,
      match_method        = EXCLUDED.match_method,
      updated_at          = NOW()
  `
}

export async function findBySourceId(
  source: string,
  sourceId: string,
  entityType: string
): Promise<SourceEntityMapRow | null> {
  const db = getDb()
  const rows = await db<SourceEntityMapRow[]>`
    SELECT * FROM source_entity_maps
    WHERE source = ${source}
      AND source_id = ${sourceId}
      AND entity_type = ${entityType}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function recordDedupeDecision(p: {
  entityIdA: string
  entityIdB: string
  entityType: string
  confidence: number
  matchMethod: string
  keptEntityId: string
  decision: 'merge' | 'keep_separate' | 'pending_review'
}): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO dedupe_decisions
      (entity_id_a, entity_id_b, entity_type, confidence, match_method, kept_entity_id, decision)
    VALUES
      (${p.entityIdA}, ${p.entityIdB}, ${p.entityType}, ${p.confidence},
       ${p.matchMethod}, ${p.keptEntityId}, ${p.decision})
    ON CONFLICT DO NOTHING
  `
}
