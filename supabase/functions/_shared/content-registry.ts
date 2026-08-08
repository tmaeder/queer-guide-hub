// Content Registry — ONE source of per-content-type pipeline config.
//
// Pure data + small pure helpers, no I/O — same discipline as dedup-engine.ts.
// Consolidates what was previously re-implemented inline in four+ places:
//
//   1. type/alias resolution   (pipeline-deduplicate resolveEntityType,
//                               pipeline-normalize guessEntityType,
//                               pipeline-validate / pipeline-quality-score
//                               per-branch `type === X || target_table === Y`)
//   2. commit dispatch          (pipeline-commit SIMPLE_COMMIT_TARGETS + SOCIAL_COLUMN)
//   3. dedup config             (references — never copies — DEDUP_REGISTRY entries)
//   4. validator/quality keys   (branch SELECTION only; branch bodies stay in
//                               their functions)
//
// Behavior contract: for every (entity_type, target_table) input the pipeline
// sees today (verified against prod ingestion_staging + live pipeline_definitions
// node configs, 2026-08-08) resolution is identical to the pre-registry inline
// switches. The registry is additionally a SUPERSET: alias spellings that one
// consumer knew and another didn't (e.g. entity_type 'news_article', which
// pipeline-deduplicate's resolver missed while validate/quality handled it)
// now resolve uniformly. Inputs are trimmed + lowercased before lookup;
// commit-dispatch lookups stay EXACT-string on the owned table name, matching
// pipeline-commit's previous `resolvedTarget in SIMPLE_COMMIT_TARGETS`.

import { DEDUP_REGISTRY, type EntityType as DedupEntityType, type TypeConfig as DedupTypeConfig } from './dedup-engine.ts'

export type ContentType =
  | 'venue' | 'hotel' | 'event' | 'city' | 'country' | 'news'
  | 'marketplace' | 'personality' | 'organization' | 'queer_village'
  | 'milestone' | 'group' | 'tag' | 'airport'

/** Which pipeline-validate branch handles this type (bodies live there). */
export type ValidatorKey =
  | 'venue' | 'country' | 'marketplace' | 'city' | 'news' | 'personality'
  | 'event' | 'generic'

/** Which pipeline-quality-score rubric scores this type (bodies live there). */
export type QualityRubricKey = 'personality' | 'marketplace' | 'news' | 'generic'

export type CommitConfig =
  /** Dedicated SQL batch RPC (was pipeline-commit's SIMPLE_COMMIT_TARGETS). */
  | { kind: 'simple'; rpc: string; idColumn: string; passPipelineRunId?: true }
  /** News commits per job_id via news_commit_staging_batch — structurally
   *  different, kept as an explicit branch in pipeline-commit. */
  | { kind: 'news_per_job' }
  /** No dedicated RPC — rows fall through to pipeline-commit's legacy
   *  buildRecord insert/upsert path. */
  | { kind: 'legacy' }
  /** Committed through another type's table (hotels stage as venues rows and
   *  commit via the venue batch RPC). Never owns a commit-dispatch table. */
  | { kind: 'via'; type: ContentType }

export type SimpleCommitSpec = Extract<CommitConfig, { kind: 'simple' }>

export interface ContentTypeConfig {
  type: ContentType
  /** Canonical `entity_type` spelling stamped onto staging rows
   *  (what pipeline-normalize's guessEntityType emits for the table). */
  entityType: string
  /** Target table staged rows commit into. */
  table: string
  /** Every alias spelling seen in prod staging rows, DAG node configs and the
   *  pre-registry inline switches. Lowercase. Unique across the registry. */
  aliases: readonly string[]
  /** Reference into dedup-engine's DEDUP_REGISTRY (never a copy). Null for
   *  types whose merge capability lives only in the SQL sweep
   *  (run_dedup_truth_sweep_all) or that don't dedup at all. */
  dedup: DedupTypeConfig | null
  commit: CommitConfig
  /** jsonb column holding normalized social links on the target table
   *  (was pipeline-commit's SOCIAL_COLUMN map). Null = none. */
  socialColumn: string | null
  validator: ValidatorKey
  qualityRubric: QualityRubricKey
}

export const CONTENT_REGISTRY: Record<ContentType, ContentTypeConfig> = {
  venue: {
    type: 'venue',
    entityType: 'venue',
    table: 'venues',
    aliases: ['venue', 'venues'],
    dedup: DEDUP_REGISTRY.venue,
    commit: { kind: 'simple', rpc: 'commit_venue_staging_batch', idColumn: 'venue_id' },
    socialColumn: 'social_links',
    validator: 'venue',
    qualityRubric: 'generic',
  },
  // Hotels are a venue sub-shape: they stage with target_table='venues' and are
  // detected downstream via normalized_data.accommodation_type (never via the
  // 'hotel' type string). The dedup ref exists so DEDUP_REGISTRY.hotel is
  // reachable from the registry, but resolveDedupEntityType still returns
  // 'unknown' for a literal 'hotel'/'hotels' input — exactly as the
  // pre-registry resolver did. validator stays 'generic' for the same reason:
  // the hotel validator only ever fires inside the venue branch.
  hotel: {
    type: 'hotel',
    entityType: 'hotel',
    table: 'venues',
    aliases: ['hotel', 'hotels'],
    dedup: DEDUP_REGISTRY.hotel,
    commit: { kind: 'via', type: 'venue' },
    socialColumn: 'social_links',
    validator: 'generic',
    qualityRubric: 'generic',
  },
  event: {
    type: 'event',
    entityType: 'event',
    table: 'events',
    aliases: ['event', 'events'],
    dedup: DEDUP_REGISTRY.event,
    commit: { kind: 'simple', rpc: 'commit_event_staging_batch', idColumn: 'event_id' },
    socialColumn: 'social_links',
    validator: 'event',
    qualityRubric: 'generic',
  },
  city: {
    type: 'city',
    entityType: 'city',
    table: 'cities',
    aliases: ['city', 'cities'],
    dedup: DEDUP_REGISTRY.city,
    commit: { kind: 'simple', rpc: 'commit_city_staging_batch', idColumn: 'city_id' },
    socialColumn: 'social_links',
    validator: 'city',
    qualityRubric: 'generic',
  },
  country: {
    type: 'country',
    entityType: 'country',
    table: 'countries',
    aliases: ['country', 'countries'],
    dedup: DEDUP_REGISTRY.country,
    commit: { kind: 'simple', rpc: 'commit_country_staging_batch', idColumn: 'country_id' },
    socialColumn: null,
    validator: 'country',
    qualityRubric: 'generic',
  },
  // Canonical entity_type is 'news_article' (110k prod staging rows spell it
  // that way; guessEntityType has always emitted it for news_articles).
  news: {
    type: 'news',
    entityType: 'news_article',
    table: 'news_articles',
    aliases: ['news', 'news_article', 'news_articles'],
    dedup: DEDUP_REGISTRY.news,
    commit: { kind: 'news_per_job' },
    socialColumn: null,
    validator: 'news',
    qualityRubric: 'news',
  },
  marketplace: {
    type: 'marketplace',
    entityType: 'marketplace',
    table: 'marketplace_listings',
    aliases: ['marketplace', 'marketplace_listings'],
    dedup: DEDUP_REGISTRY.marketplace,
    commit: {
      kind: 'simple',
      rpc: 'commit_marketplace_staging_batch',
      idColumn: 'listing_id',
      passPipelineRunId: true,
    },
    socialColumn: 'social_media',
    validator: 'marketplace',
    qualityRubric: 'marketplace',
  },
  personality: {
    type: 'personality',
    entityType: 'personality',
    table: 'personalities',
    aliases: ['personality', 'personalities'],
    dedup: DEDUP_REGISTRY.personality,
    commit: { kind: 'simple', rpc: 'commit_personality_staging_batch', idColumn: 'personality_id' },
    socialColumn: 'social_links',
    validator: 'personality',
    qualityRubric: 'personality',
  },
  organization: {
    type: 'organization',
    entityType: 'organization',
    table: 'organizations',
    aliases: ['organization', 'organizations'],
    dedup: DEDUP_REGISTRY.organization,
    commit: { kind: 'legacy' },
    socialColumn: null,
    validator: 'generic',
    qualityRubric: 'generic',
  },
  // Merge-capable in the SQL sweep only (village key+city) — no edge-side
  // dedup TypeConfig exists, hence dedup: null.
  queer_village: {
    type: 'queer_village',
    entityType: 'queer_village',
    table: 'queer_villages',
    aliases: ['queer_village', 'queer_villages'],
    dedup: null,
    commit: { kind: 'simple', rpc: 'commit_village_staging_batch', idColumn: 'village_id' },
    socialColumn: 'social_links',
    validator: 'generic',
    qualityRubric: 'generic',
  },
  // Merge-capable in the SQL sweep only (milestone key+year).
  milestone: {
    type: 'milestone',
    entityType: 'milestone',
    table: 'milestones',
    aliases: ['milestone', 'milestones'],
    dedup: null,
    commit: { kind: 'legacy' },
    socialColumn: null,
    validator: 'generic',
    qualityRubric: 'generic',
  },
  // Merge-capable in the SQL sweep only (group key+city).
  group: {
    type: 'group',
    entityType: 'group',
    table: 'community_groups',
    aliases: ['group', 'community_groups'],
    dedup: null,
    commit: { kind: 'legacy' },
    socialColumn: null,
    validator: 'generic',
    qualityRubric: 'generic',
  },
  // tags-ingestion DAG commits via the legacy upsert path (conflictKey slug).
  tag: {
    type: 'tag',
    entityType: 'tag',
    table: 'unified_tags',
    aliases: ['tag', 'unified_tags'],
    dedup: null,
    commit: { kind: 'legacy' },
    socialColumn: null,
    validator: 'generic',
    qualityRubric: 'generic',
  },
  airport: {
    type: 'airport',
    entityType: 'airport',
    table: 'airports',
    aliases: ['airport', 'airports'],
    dedup: null,
    commit: { kind: 'legacy' },
    socialColumn: null,
    validator: 'generic',
    qualityRubric: 'generic',
  },
}

// Alias → config index, built once. Throws at module load if two types ever
// claim the same alias (also asserted in content-registry.test.ts).
const ALIAS_INDEX: ReadonlyMap<string, ContentTypeConfig> = (() => {
  const m = new Map<string, ContentTypeConfig>()
  for (const cfg of Object.values(CONTENT_REGISTRY)) {
    for (const a of cfg.aliases) {
      if (m.has(a)) throw new Error(`content-registry: duplicate alias '${a}'`)
      m.set(a, cfg)
    }
  }
  return m
})()

/**
 * Resolve any alias spelling (entity_type or target_table, singular or plural)
 * to its content-type config. Trims + lowercases. Unknown input → null.
 */
export function resolveContentType(input: string | null | undefined): ContentTypeConfig | null {
  if (!input) return null
  return ALIAS_INDEX.get(String(input).trim().toLowerCase()) ?? null
}

/**
 * Resolve a staging row's (entity_type, target_table) pair — entity_type wins
 * when both resolve, mirroring the `type === X || target_table === Y` shape of
 * the pre-registry branches. In prod the two never contradict (entity_type is
 * either null or names the same type as target_table).
 */
export function resolveStagingContentType(
  entityType: string | null | undefined,
  targetTable: string | null | undefined,
): ContentTypeConfig | null {
  return resolveContentType(entityType) ?? resolveContentType(targetTable)
}

/**
 * The dedup EntityType for a staging row, or 'unknown' for types the dedup
 * node handles via its legacy name-match fallback. Contract preserved from
 * pipeline-deduplicate's pre-registry resolveEntityType: only the 8 base types
 * resolve — 'hotel' stays 'unknown' because hotelness is derived downstream
 * from normalized_data.accommodation_type on the venue path, never from the
 * raw type string.
 */
export function resolveDedupEntityType(
  item: { target_table?: string | null; entity_type?: string | null },
): DedupEntityType | 'unknown' {
  const cfg = resolveStagingContentType(item.entity_type, item.target_table)
  if (!cfg?.dedup || cfg.type === 'hotel') return 'unknown'
  return cfg.dedup.entityType
}

/**
 * Commit-dispatch lookup for pipeline-commit: EXACT match on the owned table
 * name only (no alias resolution, no case folding) — identical key semantics
 * to the old `resolvedTarget in SIMPLE_COMMIT_TARGETS` / explicit `===`
 * checks. 'via' entries (hotel) never own a table, so 'hotels' still falls
 * through to the legacy path exactly as before.
 */
export function commitConfigForTable(table: string | null | undefined): ContentTypeConfig | null {
  if (!table) return null
  for (const cfg of Object.values(CONTENT_REGISTRY)) {
    if (cfg.table === table && cfg.commit.kind !== 'via') return cfg
  }
  return null
}

/** Social-links jsonb column for a target table (was SOCIAL_COLUMN). Exact
 *  table match, same key semantics as commitConfigForTable. */
export function socialColumnForTable(table: string | null | undefined): string | null {
  return commitConfigForTable(table)?.socialColumn ?? null
}
