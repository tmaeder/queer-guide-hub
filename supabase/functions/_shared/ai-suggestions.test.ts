import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { applySuggestion } from './ai-suggestions.ts'

// ── Stub SupabaseClient ──────────────────────────────────────────────────────
// Records every .from(table).insert/upsert call so tests can assert on the
// arguments. Returns whatever the test sets up via `setNextResult`.

interface Call {
  table: string
  op: 'insert' | 'upsert'
  values: Record<string, unknown>
  options?: Record<string, unknown>
}

function makeClient(opts: { error?: { message: string } } = {}) {
  const calls: Call[] = []
  const error = opts.error ?? null
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (table: string): any => ({
    insert(values: Record<string, unknown>) {
      calls.push({ table, op: 'insert', values })
      return Promise.resolve({ data: null, error })
    },
    upsert(values: Record<string, unknown>, options?: Record<string, unknown>) {
      calls.push({ table, op: 'upsert', values, options })
      return Promise.resolve({ data: null, error })
    },
  })
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = { from: builder, _calls: calls }
  return client
}

// ── tag suggestions ─────────────────────────────────────────────────────────

Deno.test('applySuggestion: tag — upserts unified_tag_assignments', async () => {
  const client = makeClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'tag',
    entity_type: 'venues',
    entity_id: 'venue-uuid-1',
    locale: null,
    proposed_value: { tag_id: 'tag-uuid-1' },
  })
  assertEquals(ok, true)
  assertEquals(client._calls.length, 1)
  assertEquals(client._calls[0].table, 'unified_tag_assignments')
  assertEquals(client._calls[0].op, 'upsert')
  assertEquals(client._calls[0].values, {
    entity_type: 'venues',
    entity_id: 'venue-uuid-1',
    tag_id: 'tag-uuid-1',
  })
  assertEquals(client._calls[0].options, { onConflict: 'entity_type,entity_id,tag_id' })
})

Deno.test('applySuggestion: tag — throws when entity_type is missing', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeClient(), {
        suggestion_type: 'tag',
        entity_type: null,
        entity_id: 'venue-uuid-1',
        locale: null,
        proposed_value: { tag_id: 'tag-uuid-1' },
      }),
    Error,
    'tag suggestion needs entity_type, entity_id, proposed_value.tag_id',
  )
})

Deno.test('applySuggestion: tag — throws when tag_id is missing', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeClient(), {
        suggestion_type: 'tag',
        entity_type: 'venues',
        entity_id: 'venue-uuid-1',
        locale: null,
        proposed_value: {},
      }),
    Error,
    'tag suggestion needs entity_type, entity_id, proposed_value.tag_id',
  )
})

Deno.test('applySuggestion: tag — propagates DB error', async () => {
  const client = makeClient({ error: { message: 'boom' } })
  await assertRejects(
    () =>
      applySuggestion(client, {
        suggestion_type: 'tag',
        entity_type: 'venues',
        entity_id: 'v-1',
        locale: null,
        proposed_value: { tag_id: 't-1' },
      }),
    Error,
    'boom',
  )
})

// ── synonym suggestions ─────────────────────────────────────────────────────

Deno.test('applySuggestion: synonym — inserts search_synonyms', async () => {
  const client = makeClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'synonym',
    entity_type: null,
    entity_id: null,
    locale: 'en',
    proposed_value: {
      terms: ['gay bar'],
      replacements: ['queer bar', 'lgbtq bar'],
      is_one_way: false,
      indexes: ['venues'],
    },
  })
  assertEquals(ok, true)
  assertEquals(client._calls[0].table, 'search_synonyms')
  assertEquals(client._calls[0].values, {
    terms: ['gay bar'],
    replacements: ['queer bar', 'lgbtq bar'],
    is_one_way: false,
    locale: 'en',
    indexes: ['venues'],
    status: 'active',
    source: 'ai-suggested',
  })
})

Deno.test('applySuggestion: synonym — defaults locale to "*" when null', async () => {
  const client = makeClient()
  await applySuggestion(client, {
    suggestion_type: 'synonym',
    entity_type: null,
    entity_id: null,
    locale: null,
    proposed_value: { terms: ['a'], replacements: ['b'] },
  })
  assertEquals(client._calls[0].values.locale, '*')
})

Deno.test('applySuggestion: synonym — throws when terms missing', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeClient(), {
        suggestion_type: 'synonym',
        entity_type: null,
        entity_id: null,
        locale: null,
        proposed_value: { replacements: ['a'] },
      }),
    Error,
    'synonym suggestion needs terms[] and replacements[]',
  )
})

// ── cluster_membership suggestions ──────────────────────────────────────────

Deno.test('applySuggestion: cluster_membership — upserts topic_cluster_tags', async () => {
  const client = makeClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'cluster_membership',
    entity_type: null,
    entity_id: null,
    locale: null,
    proposed_value: { cluster_id: 'c-1', tag_id: 't-1' },
  })
  assertEquals(ok, true)
  assertEquals(client._calls[0].table, 'topic_cluster_tags')
  assertEquals(client._calls[0].op, 'upsert')
  assertEquals(client._calls[0].values, { cluster_id: 'c-1', tag_id: 't-1' })
  assertEquals(client._calls[0].options, { onConflict: 'cluster_id,tag_id' })
})

Deno.test('applySuggestion: cluster_membership — throws when cluster_id missing', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeClient(), {
        suggestion_type: 'cluster_membership',
        entity_type: null,
        entity_id: null,
        locale: null,
        proposed_value: { tag_id: 't-1' },
      }),
    Error,
    'cluster_membership needs proposed_value.cluster_id and tag_id',
  )
})

// ── unsupported types ───────────────────────────────────────────────────────

Deno.test('applySuggestion: unsupported types return false for non-tag entities', async () => {
  const client = makeClient()
  // description/image_replacement/category only apply for entity_type='unified_tags';
  // for other entity types they remain manual (false).
  // 'translation' is supported (needs a locale) so it's excluded here — it throws
  // rather than returning false. These all short-circuit to false for non-tag entities.
  for (const t of ['alt_text', 'description', 'title', 'image_replacement', 'category', 'other']) {
    const ok = await applySuggestion(client, {
      suggestion_type: t,
      entity_type: 'venues',
      entity_id: 'v-1',
      locale: null,
      proposed_value: { text: 'hi' },
    })
    assertEquals(ok, false, `expected ${t} to return false`)
  }
  assertEquals(client._calls.length, 0)
})

// ── tag enrichment suggestions (entity_type='unified_tags') ──────────────────
// Extended stub: also records .update(patch).eq(col,val) calls.

/**
 * A PostgREST filter chain that is both chainable and thenable. Self-referential
 * on purpose — `.eq()` returns the same object — which is why it needs a named
 * type rather than being inferred.
 */
type Chainable = {
  eq: () => Chainable
  neq: () => Chainable
  maybeSingle: () => Promise<unknown>
  then: (res: (v: unknown) => unknown) => Promise<unknown>
}

function makeTagClient(
  opts: { error?: { message: string }; isFacet?: boolean; tagRow?: Record<string, unknown> | null } = {},
) {
  const calls: { table: string; op: string; values: Record<string, unknown>; options?: Record<string, unknown> }[] = []
  const error = opts.error ?? null
  // The category branch demotes with a THREE-filter chain
  // (.eq.eq.neq) and reads the tag before writing, so the mock has to be
  // chainable and thenable rather than resolving on the first .eq().
  const chain = (record: () => void, result: unknown): Chainable => {
    const self: Chainable = {
      eq: () => self,
      neq: () => self,
      maybeSingle: () => {
        record()
        return Promise.resolve(result)
      },
      then: (res: (v: unknown) => unknown) => {
        record()
        return Promise.resolve(result).then(res)
      },
    }
    return self
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (table: string): any => ({
    select() {
      const row = opts.tagRow === undefined ? { slug: 'drag', entity_kind: 'concept' } : opts.tagRow
      return chain(() => calls.push({ table, op: 'select', values: {} }), { data: row, error: null })
    },
    update(values: Record<string, unknown>) {
      return chain(() => calls.push({ table, op: 'update', values }), { data: null, error })
    },
    upsert(values: Record<string, unknown>, options?: Record<string, unknown>) {
      calls.push({ table, op: 'upsert', values, options })
      return Promise.resolve({ data: null, error })
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from: builder,
    rpc: (fn: string) => {
      calls.push({ table: `rpc:${fn}`, op: 'rpc', values: {} })
      return Promise.resolve({ data: opts.isFacet ?? false, error: null })
    },
    _calls: calls,
  }
  return client
}

Deno.test('applySuggestion: description — updates unified_tags field', async () => {
  const client = makeTagClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'description',
    entity_type: 'unified_tags',
    entity_id: 'tag-1',
    locale: null,
    proposed_value: { field: 'short_description', value: 'A short blurb.' },
  })
  assertEquals(ok, true)
  assertEquals(client._calls[0].table, 'unified_tags')
  assertEquals(client._calls[0].op, 'update')
  assertEquals(client._calls[0].values.short_description, 'A short blurb.')
})

Deno.test('applySuggestion: description — defaults field to description', async () => {
  const client = makeTagClient()
  await applySuggestion(client, {
    suggestion_type: 'description',
    entity_type: 'unified_tags',
    entity_id: 'tag-1',
    locale: null,
    proposed_value: { value: 'Default field blurb.' },
  })
  assertEquals(client._calls[0].values.description, 'Default field blurb.')
})

Deno.test('applySuggestion: description — throws on invalid field', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeTagClient(), {
        suggestion_type: 'description',
        entity_type: 'unified_tags',
        entity_id: 'tag-1',
        locale: null,
        proposed_value: { field: 'name', value: 'x' },
      }),
    Error,
    'description needs proposed_value.field',
  )
})

Deno.test('applySuggestion: image_replacement — updates image fields', async () => {
  const client = makeTagClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'image_replacement',
    entity_type: 'unified_tags',
    entity_id: 'tag-1',
    locale: null,
    proposed_value: { image_url: 'https://x/i.jpg', image_alt: 'alt', image_source: 'pexels' },
  })
  assertEquals(ok, true)
  assertEquals(client._calls[0].table, 'unified_tags')
  assertEquals(client._calls[0].values.image_url, 'https://x/i.jpg')
  assertEquals(client._calls[0].values.image_alt, 'alt')
  assertEquals(client._calls[0].values.image_source, 'pexels')
})

Deno.test('applySuggestion: image_replacement — throws without image_url', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeTagClient(), {
        suggestion_type: 'image_replacement',
        entity_type: 'unified_tags',
        entity_id: 'tag-1',
        locale: null,
        proposed_value: {},
      }),
    Error,
    'image_replacement needs proposed_value.image_url',
  )
})

Deno.test('applySuggestion: category — DEMOTES the old primary before promoting', async () => {
  // The demote is the whole point: without it a tag that is already filed ends
  // up with two primaries, which the partial unique index from 20261008130000
  // now rejects outright. Order matters — promote-then-demote would trip the
  // same index.
  const client = makeTagClient()
  const ok = await applySuggestion(client, {
    suggestion_type: 'category',
    entity_type: 'unified_tags',
    entity_id: 'tag-1',
    locale: null,
    proposed_value: { category_id: 'cat-1' },
  })
  assertEquals(ok, true)
  const writes = client._calls.filter((c: { table: string }) => c.table === 'tag_category_assignments')
  assertEquals(writes[0].op, 'update')
  assertEquals(writes[0].values, { is_primary: false })
  assertEquals(writes[1].op, 'upsert')
  assertEquals(writes[1].values, { tag_id: 'tag-1', category_id: 'cat-1', is_primary: true })
  assertEquals(writes[1].options, { onConflict: 'tag_id,category_id' })
})

Deno.test('applySuggestion: category — refuses to file a marketplace facet', async () => {
  // Asked of the database via is_marketplace_facet(), not re-spelled here.
  const client = makeTagClient({ isFacet: true, tagRow: { slug: 'spandex', entity_kind: 'attribute' } })
  await assertRejects(
    () =>
      applySuggestion(client, {
        suggestion_type: 'category',
        entity_type: 'unified_tags',
        entity_id: 'tag-1',
        locale: null,
        proposed_value: { category_id: 'cat-1' },
      }),
    Error,
    'refusing to file marketplace facet',
  )
  assertEquals(
    client._calls.filter((c: { table: string }) => c.table === 'tag_category_assignments').length,
    0,
  )
})

Deno.test('applySuggestion: category — propagates DB error', async () => {
  await assertRejects(
    () =>
      applySuggestion(makeTagClient({ error: { message: 'kaboom' } }), {
        suggestion_type: 'category',
        entity_type: 'unified_tags',
        entity_id: 'tag-1',
        locale: null,
        proposed_value: { category_id: 'cat-1' },
      }),
    Error,
    'kaboom',
  )
})
