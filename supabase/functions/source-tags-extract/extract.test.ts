import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  DECIDED_STATUSES,
  type AliasRef,
  type ExtractedTag,
  type TagRef,
  type VocabularyIndex,
  buildProposalRow,
  collisionFor,
  foldTags,
  selectProposals,
} from './extract.ts'

const tag = (slug: string, name: string, status: string | null = 'active'): TagRef => ({ slug, name, status })

function vocab(
  tags: Record<string, TagRef> = {},
  aliases: Record<string, AliasRef> = {},
  byId: Record<string, TagRef> = {},
): VocabularyIndex {
  return {
    byName: new Map(Object.entries(tags)),
    byAlias: new Map(Object.entries(aliases)),
    byId: new Map(Object.entries(byId)),
  }
}

Deno.test('foldTags keys by slug and accumulates every source table', () => {
  const acc = new Map<string, ExtractedTag>()
  foldTags(acc, 'venues', ['Bühne', 'Drag Queen'])
  // null and 42 must NOT survive: String(null) is 'null', which would file a
  // proposal for a tag literally named "null".
  foldTags(acc, 'events', ['bühne', '  ', null, 42])
  foldTags(acc, 'personalities', ['BÜHNE'])

  assertEquals([...acc.keys()].sort(), ['buhne', 'drag-queen'])
  // One proposal, not three: the slug is the identity.
  assertEquals(acc.get('buhne')!.seen_in, ['venues', 'events', 'personalities'])
  // First spelling seen wins as the display name.
  assertEquals(acc.get('buhne')!.name, 'Bühne')
  // A non-array column contributes nothing rather than throwing.
  foldTags(acc, 'venues', null)
  assertEquals(acc.size, 2)
})

Deno.test('foldTags drops strings that slugify to nothing', () => {
  const acc = new Map<string, ExtractedTag>()
  foldTags(acc, 'venues', ['---', '!!!', '  '])
  assertEquals(acc.size, 0)
})

Deno.test('the guard skips a slug that is already vocabulary in ANY status', () => {
  const extracted: ExtractedTag[] = [
    { name: 'Sauna', slug: 'sauna', seen_in: ['venues'] },
    { name: 'Bühne', slug: 'buhne', seen_in: ['venues'] },
  ]
  // `sauna` is DEPRECATED here. Re-proposing it is exactly the 297-tag
  // resurrection this node caused before: reviving a deprecated tag is
  // restore_deprecated_tag()'s job, not a scraper's.
  const known = new Set(['sauna'])
  assertEquals(selectProposals(extracted, known, new Set()).map(t => t.slug), ['buhne'])
})

Deno.test('a rejected proposal is a tombstone, not an invitation to re-file', () => {
  const extracted: ExtractedTag[] = [{ name: 'Bühne', slug: 'buhne', seen_in: ['venues'] }]
  // `alreadyProposed` is built from pending + approved + applied + REJECTED.
  // Without the rejected half this weekly cron re-files what a human refused.
  assertEquals(selectProposals(extracted, new Set(), new Set(['buhne'])), [])
})

Deno.test('the second consecutive run files zero', () => {
  const acc = new Map<string, ExtractedTag>()
  foldTags(acc, 'venues', ['Bühne', 'Beratung', 'Drag Queen'])
  const runOne = selectProposals(acc.values(), new Set(), new Set())
  assertEquals(runOne.length, 3)

  // Run 2: the corpus is unchanged and run 1's rows are now pending.
  const pending = new Set(runOne.map(t => t.slug))
  assertEquals(selectProposals(acc.values(), new Set(), pending).length, 0)
})

Deno.test('the decided-status set keeps tombstones and excludes lapsed rows', () => {
  const s = [...DECIDED_STATUSES]
  assert(s.includes('rejected'), 'dropping rejected re-files everything a human refused')
  assert(s.includes('pending') && s.includes('approved') && s.includes('applied'))
  // A lapsed proposal never got a verdict, so re-filing it is correct.
  assert(!s.includes('superseded') && !s.includes('expired'))
})

Deno.test('a name collision is stamped, not filtered', () => {
  // The namespace-prefix cohort: the prefix lives in the slug and NOT in the
  // name by design, so the slug guard cannot see it. Approving one blind grows
  // duplicate_active_name, a hard gate. Measured on prod after 20261128100000:
  // 4 of these survive (genre-erotica, vibe-minimal, genre-poetry, occ-wedding).
  const idx = vocab({ erotica: tag('genre-erotica', 'Erotica') })
  assertEquals(collisionFor('erotica', idx), {
    kind: 'name',
    tag_slug: 'genre-erotica',
    tag_name: 'Erotica',
    tag_status: 'active',
  })
})

Deno.test('name collision comparison matches duplicate_active_name: lower(btrim(name))', () => {
  const idx = vocab({ wedding: tag('occ-wedding', 'Wedding') })
  assert(collisionFor('  WEDDING  ', idx) !== null)
  assert(collisionFor('Weddings', idx) === null)
})

Deno.test('an alias collision resolves through to the canonical tag', () => {
  // The alias-collapses-an-identity class: 46 of today's proposals name an
  // existing tag_aliases row, ten times the name-collision count. Note the
  // stored alias_slug is often lossy (Intersexualität -> intersexualitt), which
  // is precisely why this is matched on the NAME and not on the slug.
  const idx = vocab(
    {},
    // Keyed by nameKey(alias_name) — the LOWERCASED NAME, accents intact, which
    // is what lower(btrim(...)) compares. Not the slug.
    { 'intersexualität': { alias_name: 'Intersexualität', review_status: 'auto', tag_id: 't1' } },
    { t1: tag('intersex', 'Intersex') },
  )
  assertEquals(collisionFor('intersexualität', idx), {
    kind: 'alias',
    tag_slug: 'intersex',
    tag_name: 'Intersex',
    tag_status: 'active',
    via_alias: 'Intersexualität',
    alias_review_status: 'auto',
  })
})

Deno.test('a name collision outranks an alias collision', () => {
  const idx = vocab(
    { jazz: tag('genre-jazz', 'Jazz') },
    { jazz: { alias_name: 'Jazz', review_status: 'approved', tag_id: 't1' } },
    { t1: tag('music', 'Music') },
  )
  assertEquals(collisionFor('jazz', idx)!.kind, 'name')
})

Deno.test('no collision leaves proposed_value without the key at all', () => {
  const idx = vocab({ erotica: tag('genre-erotica', 'Erotica') })
  assertEquals(collisionFor('Feuerwehrfest', idx), null)

  const row = buildProposalRow({ name: 'Feuerwehrfest', slug: 'feuerwehrfest', seen_in: ['events'] }, null, 'run-1')
  assert(!('collides_with' in row.proposed_value))
})

Deno.test('the proposal row cannot be mistaken for a vocabulary write', () => {
  const row = buildProposalRow(
    { name: 'Erotica', slug: 'erotica', seen_in: ['venues', 'events'] },
    { kind: 'name', tag_slug: 'genre-erotica', tag_name: 'Erotica', tag_status: 'active' },
    'run-1',
  )
  assertEquals(row.suggestion_type, 'tag')
  assertEquals(row.entity_type, 'tag')
  // entity_id is NULL because the tag does not exist — that is the whole point.
  assertEquals(row.entity_id, null)
  // 'rule', not a model: this is deterministic extraction.
  assertEquals(row.source, 'rule')
  assertEquals(row.status, 'pending')
  assertEquals(row.proposed_value.slug, 'erotica')
  assertEquals(row.proposed_value.seen_in, ['venues', 'events'])
  assertEquals(row.source_run_id, 'run-1')
  // No `name`/`slug` at the top level: nothing about this row targets unified_tags.
  assert(!('name' in row))
})

Deno.test('every paginated read in index.ts is ordered', async () => {
  // `.range()` without `.order()` is not pagination. The ai_suggestions read
  // plans as a Gather over a Parallel Seq Scan, whose row order is
  // nondeterministic across executions, so a row can sit in page n on one call
  // and page n+1 on the next and never be returned — silently dropping a
  // tombstone and re-filing its slug. There is no DB backstop:
  // ai_suggestions_tag_idempotency_idx keys on (entity_type, entity_id,
  // proposed_value->>'tag_id') and these rows are NULL in both trailing
  // columns, so under NULLS DISTINCT the duplicate inserts cleanly.
  //
  // Asserted over source text because the query is built inside the
  // Deno.serve handler, which cannot be imported without binding a port.
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  const lines = src.split('\n')
  const ranges = lines.flatMap((l, i) => (l.includes('.range(') ? [i] : []))
  assert(ranges.length >= 3, `expected the three paginated reads, found ${ranges.length}`)
  for (const i of ranges) {
    const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n')
    assert(window.includes(".order('id')"), `.range() at line ${i + 1} has no .order('id') above it`)
  }
})

Deno.test('index.ts contains no write to unified_tags', () => {
  // The one invariant the whole change exists to establish. An insert, an
  // upsert or an update here is how a scraped free-text string became live
  // vocabulary, and how 297 deprecated tags came back as half-live rows.
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert(!/from\(['"]unified_tags['"]\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/.test(code))
  assert(!code.includes('.upsert('))
})
