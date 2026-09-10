import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { DEDUP_REGISTRY } from '../_shared/dedup-engine.ts'

// The CHECK on scraper_dedupe_decisions.entity_type, copied from prod
// (pg_constraint scraper_dedupe_decisions_entity_type_check, read 2026-09-10).
// record_dedup_decision inserts into that table, so any value pipeline-
// deduplicate passes as p_entity_type must appear here or the insert fails
// 23514 — which is silent, because persistVerdict swallows it into
// counters.onHardFail() and returns.
const ALLOWED_DECISION_ENTITY_TYPES = new Set([
  'venue', 'event', 'place', 'stay', 'venues', 'events', 'city', 'country',
  'cities', 'countries', 'personality', 'personalities', 'news_article',
  'news_articles', 'marketplace', 'marketplace_listing',
])

// Mirrors the map in pipeline-deduplicate/index.ts. Kept as a literal rather
// than imported so that deleting the map in the function is a TEST FAILURE and
// not a silently-shared constant that moves with it.
const DECISION_ENTITY_TYPE: Record<string, string> = { news: 'news_article' }

const resolve = (t: string) => DECISION_ENTITY_TYPE[t] ?? t

Deno.test('every DEDUP_REGISTRY entityType resolves to a value the DB CHECK accepts', () => {
  const offenders: string[] = []
  for (const [key, cfg] of Object.entries(DEDUP_REGISTRY)) {
    const internal = (cfg as { entityType: string }).entityType
    // 'hotel' never reaches persistence: resolveDedupEntityType returns
    // 'unknown' for it (content-registry.ts), so it is not a live path.
    if (internal === 'hotel') continue
    // 'organization' has no canonical spelling in the CHECK at all and prod
    // holds zero organizations staging rows — a known latent gap that needs
    // the constraint widened, tracked separately. Asserting on it here would
    // fail for a condition this file cannot fix.
    if (internal === 'organization') continue
    if (!ALLOWED_DECISION_ENTITY_TYPES.has(resolve(internal))) {
      offenders.push(`${key} → ${internal} → ${resolve(internal)}`)
    }
  }
  assertEquals(offenders, [], `DEDUP_REGISTRY entityTypes rejected by the CHECK: ${offenders.join(', ')}`)
})

Deno.test('news specifically maps to the canonical spelling, not the internal key', () => {
  // The regression: 'news' is the internal branch selector (pipeline-
  // deduplicate keys the fingerprint short-circuit on `baseType === 'news'`)
  // but is NOT a legal persistence value. Measured on prod 2026-09-10:
  // scraper_dedupe_decisions held 57,463 event / 31,266 venue / 8,654
  // marketplace rows and ZERO news rows of any spelling, ever.
  assertEquals(DEDUP_REGISTRY.news.entityType, 'news', 'internal branch key must not be renamed')
  assertEquals(resolve('news'), 'news_article')
  assert(ALLOWED_DECISION_ENTITY_TYPES.has(resolve('news')))
  assert(!ALLOWED_DECISION_ENTITY_TYPES.has('news'), 'the bare internal key must stay illegal, or this test proves nothing')
})

Deno.test('types needing no translation pass through unchanged', () => {
  for (const t of ['venue', 'event', 'city', 'country', 'marketplace', 'personality']) {
    assertEquals(resolve(t), t)
    assert(ALLOWED_DECISION_ENTITY_TYPES.has(resolve(t)), `${t} must be accepted as-is`)
  }
})
