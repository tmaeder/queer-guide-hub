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

Deno.test('applySuggestion: unsupported types return false (no apply)', async () => {
  const client = makeClient()
  for (const t of ['alt_text', 'description', 'title', 'image_replacement', 'translation', 'other']) {
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
