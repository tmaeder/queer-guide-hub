import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  CONTENT_REGISTRY,
  commitConfigForTable,
  resolveContentType,
  resolveDedupEntityType,
  resolveStagingContentType,
  socialColumnForTable,
  type ContentType,
} from './content-registry.ts'
import { DEDUP_REGISTRY, type EntityType as DedupEntityType } from './dedup-engine.ts'

// ── Alias resolution ────────────────────────────────────────────────────────

Deno.test('every alias resolves to the right table', () => {
  const expect: Record<string, string> = {
    venue: 'venues', venues: 'venues',
    hotel: 'venues', hotels: 'venues', // hotels stage + commit as venues rows
    event: 'events', events: 'events',
    city: 'cities', cities: 'cities',
    country: 'countries', countries: 'countries',
    news: 'news_articles', news_article: 'news_articles', news_articles: 'news_articles',
    marketplace: 'marketplace_listings', marketplace_listings: 'marketplace_listings',
    personality: 'personalities', personalities: 'personalities',
    organization: 'organizations', organizations: 'organizations',
    queer_village: 'queer_villages', queer_villages: 'queer_villages',
    milestone: 'milestones', milestones: 'milestones',
    group: 'community_groups', community_groups: 'community_groups',
    tag: 'unified_tags', unified_tags: 'unified_tags',
    airport: 'airports', airports: 'airports',
  }
  for (const [alias, table] of Object.entries(expect)) {
    assertEquals(resolveContentType(alias)?.table, table, `alias '${alias}'`)
  }
})

Deno.test('unknown input resolves to null', () => {
  for (const input of [null, undefined, '', '  ', 'unknown', 'foo', 'place', 'stays', 'restroom']) {
    assertEquals(resolveContentType(input), null, `input ${JSON.stringify(input)}`)
  }
})

Deno.test('resolution trims and lowercases (superset behavior, documented)', () => {
  assertEquals(resolveContentType(' Venues ')?.type, 'venue')
  assertEquals(resolveContentType('NEWS_ARTICLE')?.type, 'news')
})

Deno.test('canonical entityType matches what guessEntityType always emitted per table', () => {
  // pipeline-normalize's old map: table → entity_type it stamps on staging rows.
  const oldGuessMap: Record<string, string> = {
    venues: 'venue', events: 'event', personalities: 'personality',
    news_articles: 'news_article', unified_tags: 'tag', cities: 'city',
    countries: 'country', marketplace_listings: 'marketplace', airports: 'airport',
  }
  for (const [table, et] of Object.entries(oldGuessMap)) {
    assertEquals(resolveContentType(table)?.entityType, et, `table '${table}'`)
  }
})

// ── Completeness invariants ─────────────────────────────────────────────────

Deno.test('no duplicate aliases across types', () => {
  const all = Object.values(CONTENT_REGISTRY).flatMap((c) => [...c.aliases])
  assertEquals(new Set(all).size, all.length)
})

Deno.test('every entry: aliases include its type + entityType; table resolves to same table', () => {
  for (const cfg of Object.values(CONTENT_REGISTRY)) {
    assert(cfg.aliases.includes(cfg.type), `${cfg.type}: type not in aliases`)
    assert(cfg.aliases.includes(cfg.entityType), `${cfg.type}: entityType not in aliases`)
    // The table name always resolves — for 'via' entries (hotel) it resolves to
    // the OWNING type's entry, which shares the same table.
    assertEquals(resolveContentType(cfg.table)?.table, cfg.table, `${cfg.type}: table alias`)
  }
})

Deno.test('every entry has a commit config with an explicit discriminant', () => {
  const kinds = new Set(['simple', 'news_per_job', 'legacy', 'via'])
  for (const cfg of Object.values(CONTENT_REGISTRY)) {
    assert(kinds.has(cfg.commit.kind), `${cfg.type}: commit kind '${cfg.commit.kind}'`)
    if (cfg.commit.kind === 'via') {
      const target = CONTENT_REGISTRY[cfg.commit.type]
      assert(target, `${cfg.type}: via target missing`)
      assertEquals(target.table, cfg.table, `${cfg.type}: via target owns a different table`)
      assert(target.commit.kind !== 'via', `${cfg.type}: via chain`)
    }
  }
  // The news special case stays explicit.
  assertEquals(CONTENT_REGISTRY.news.commit.kind, 'news_per_job')
})

Deno.test('dedup refs are identity references into DEDUP_REGISTRY, one per merge-capable dedup type', () => {
  // Every edge-side dedup TypeConfig is referenced by exactly one registry entry,
  // and it is the SAME object (reference, not copy) — dedup-engine stays the
  // single owner of thresholds/guards.
  const seen = new Map<DedupEntityType, ContentType>()
  for (const cfg of Object.values(CONTENT_REGISTRY)) {
    if (!cfg.dedup) continue
    assertStrictEquals(cfg.dedup, DEDUP_REGISTRY[cfg.dedup.entityType], `${cfg.type}: dedup not an identity ref`)
    assert(!seen.has(cfg.dedup.entityType), `${cfg.type}: duplicate dedup ref for '${cfg.dedup.entityType}'`)
    seen.set(cfg.dedup.entityType, cfg.type)
  }
  assertEquals([...seen.keys()].sort(), (Object.keys(DEDUP_REGISTRY) as DedupEntityType[]).sort())
  // The remaining merge-capable types (queer_village, milestone, group) merge in
  // the SQL sweep only — no edge TypeConfig exists, so dedup is explicitly null.
  for (const t of ['queer_village', 'milestone', 'group', 'tag', 'airport'] as ContentType[]) {
    assertEquals(CONTENT_REGISTRY[t].dedup, null, t)
  }
})

// ── Commit dispatch (parity with pipeline-commit's old maps) ────────────────

Deno.test('commitConfigForTable reproduces SIMPLE_COMMIT_TARGETS exactly', () => {
  const old: Record<string, { rpc: string; idColumn: string; passPipelineRunId?: true }> = {
    venues:         { rpc: 'commit_venue_staging_batch',       idColumn: 'venue_id' },
    countries:      { rpc: 'commit_country_staging_batch',     idColumn: 'country_id' },
    cities:         { rpc: 'commit_city_staging_batch',        idColumn: 'city_id' },
    personalities:  { rpc: 'commit_personality_staging_batch', idColumn: 'personality_id' },
    events:         { rpc: 'commit_event_staging_batch',       idColumn: 'event_id' },
    queer_villages: { rpc: 'commit_village_staging_batch',     idColumn: 'village_id' },
    marketplace_listings: {
      rpc: 'commit_marketplace_staging_batch', idColumn: 'listing_id', passPipelineRunId: true,
    },
  }
  for (const [table, spec] of Object.entries(old)) {
    const commit = commitConfigForTable(table)?.commit
    assertEquals(commit?.kind, 'simple', table)
    if (commit?.kind !== 'simple') continue
    assertEquals(commit.rpc, spec.rpc, table)
    assertEquals(commit.idColumn, spec.idColumn, table)
    assertEquals(commit.passPipelineRunId, spec.passPipelineRunId, table)
  }
})

Deno.test('commit dispatch is exact-table only — aliases and via-entries never match', () => {
  assertEquals(commitConfigForTable('news_articles')?.commit.kind, 'news_per_job')
  // 'hotels' (live hotel-ingestion-unified DAG targetTable) stays on the legacy
  // path, exactly as when it was simply absent from SIMPLE_COMMIT_TARGETS.
  assertEquals(commitConfigForTable('hotels'), null)
  assertEquals(commitConfigForTable('venue'), null)   // alias, not a table
  assertEquals(commitConfigForTable('Venues'), null)  // exact match, no case folding
  assertEquals(commitConfigForTable('unified_tags')?.commit.kind, 'legacy')
  assertEquals(commitConfigForTable(null), null)
})

Deno.test('socialColumnForTable reproduces SOCIAL_COLUMN exactly', () => {
  const old: Record<string, string> = {
    venues: 'social_links',
    events: 'social_links',
    cities: 'social_links',
    queer_villages: 'social_links',
    personalities: 'social_links',
    marketplace_listings: 'social_media',
  }
  for (const [table, col] of Object.entries(old)) {
    assertEquals(socialColumnForTable(table), col, table)
  }
  // Tables the old map did not know keep returning nothing.
  for (const table of ['countries', 'news_articles', 'unified_tags', 'hotels', 'organizations']) {
    assertEquals(socialColumnForTable(table), null, table)
  }
})

// ── Dedup resolution (parity with pipeline-deduplicate's old resolver) ──────

Deno.test('resolveDedupEntityType matches the pre-registry resolver on every input it handled', () => {
  const cases: Array<[string | null, string | null, DedupEntityType | 'unknown']> = [
    // [target_table, entity_type, expected]
    ['events', null, 'event'],          [null, 'event', 'event'],
    ['venues', null, 'venue'],          [null, 'venue', 'venue'],
    ['cities', null, 'city'],           [null, 'city', 'city'],
    ['countries', null, 'country'],     [null, 'country', 'country'],
    ['news_articles', null, 'news'],    [null, 'news_articles', 'news'], [null, 'news', 'news'],
    ['marketplace_listings', null, 'marketplace'], [null, 'marketplace', 'marketplace'],
    ['personalities', null, 'personality'],        [null, 'personality', 'personality'],
    ['organizations', null, 'organization'],       [null, 'organization', 'organization'],
    // prod pairs where both fields are set
    ['events', 'event', 'event'],
    ['news_articles', 'news_article', 'news'],
    ['marketplace_listings', 'marketplace', 'marketplace'],
    // types without an edge dedup config → legacy fallback
    ['queer_villages', 'queer_village', 'unknown'],
    ['unified_tags', 'tag', 'unknown'],
    ['milestones', null, 'unknown'],
    [null, null, 'unknown'],
    ['glossary_terms', null, 'unknown'],
    // hotel is derived from accommodation_type on the venue path, never from
    // the raw type string — preserved from the pre-registry resolver.
    ['hotels', null, 'unknown'],
    [null, 'hotel', 'unknown'],
  ]
  for (const [table, et, expected] of cases) {
    assertEquals(
      resolveDedupEntityType({ target_table: table, entity_type: et }),
      expected,
      `(${table}, ${et})`,
    )
  }
})

Deno.test("superset: entity_type 'news_article' now resolves for dedup (the old resolver missed it)", () => {
  // The old resolveEntityType only knew 'news_articles' | 'news' as entity_type
  // spellings; the canonical 'news_article' fell to 'unknown' when target_table
  // was absent. All prod news rows carry target_table='news_articles', so
  // observable behavior is unchanged — this pins the deliberate unification.
  assertEquals(resolveDedupEntityType({ target_table: null, entity_type: 'news_article' }), 'news')
})

// ── Validator + quality-rubric selection keys ───────────────────────────────

Deno.test('validator keys reproduce pipeline-validate branch selection', () => {
  const cases: Array<[string | null, string | null, string]> = [
    ['venue', null, 'venue'],          [null, 'venues', 'venue'],
    ['country', null, 'country'],      [null, 'countries', 'country'],
    ['marketplace', null, 'marketplace'], [null, 'marketplace_listings', 'marketplace'],
    ['city', null, 'city'],            [null, 'cities', 'city'],
    ['news_articles', null, 'news'],   ['news_article', null, 'news'], [null, 'news_articles', 'news'],
    ['personality', null, 'personality'], [null, 'personalities', 'personality'],
    ['event', null, 'event'],          [null, 'events', 'event'],
    // fell to the generic branch before, still do
    ['queer_village', null, 'generic'],
    ['organization', null, 'generic'],
    ['tag', null, 'generic'],
    ['hotel', null, 'generic'], // the literal string never selected hotel validation
  ]
  for (const [et, table, expected] of cases) {
    assertEquals(
      resolveStagingContentType(et, table)?.validator ?? 'generic',
      expected,
      `(${et}, ${table})`,
    )
  }
  assertEquals(resolveStagingContentType('nonsense', null)?.validator ?? 'generic', 'generic')
})

Deno.test('quality rubric keys reproduce pipeline-quality-score branch selection', () => {
  const cases: Array<[string | null, string | null, string]> = [
    ['personality', null, 'personality'], [null, 'personalities', 'personality'],
    ['marketplace', null, 'marketplace'], [null, 'marketplace_listings', 'marketplace'],
    ['news_article', null, 'news'],       [null, 'news_articles', 'news'],
    ['venue', null, 'generic'],
    ['event', null, 'generic'],
    ['city', null, 'generic'],
    ['country', null, 'generic'],
    ['queer_village', null, 'generic'],
  ]
  for (const [et, table, expected] of cases) {
    assertEquals(
      resolveStagingContentType(et, table)?.qualityRubric ?? 'generic',
      expected,
      `(${et}, ${table})`,
    )
  }
})

Deno.test('staging resolution: entity_type wins, target_table fills in when it is null', () => {
  assertEquals(resolveStagingContentType(null, 'venues')?.type, 'venue')
  assertEquals(resolveStagingContentType('event', 'events')?.type, 'event')
  assertEquals(resolveStagingContentType(undefined, undefined), null)
})
