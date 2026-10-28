import { deepStrictEqual as assertEquals } from 'node:assert/strict'
import { applyCityFactualPatch } from './write.ts'

const city = {
  id: '00000000-0000-4000-8000-000000000001', row_version: '123', updated_at: '2026-10-28T00:00:00Z',
  field_provenance: { description: { source: 'wikipedia' } }, enrichment_status: {},
}

Deno.test('guarded writer sends the original snapshot and scoped aliases', async () => {
  const patch = { description: 'Verified source' }
  const aliases = [{ alias: 'City alias', locale: 'en' }]
  const client = { rpc(name: string, args: Record<string, unknown>) {
    assertEquals(name, 'apply_city_factual_patch')
    assertEquals(args, { p_city_id: city.id, p_expected_row_version: city.row_version, p_expected_updated_at: city.updated_at,
      p_expected_provenance: city.field_provenance, p_expected_status: city.enrichment_status,
      p_patch: patch, p_aliases: aliases })
    return Promise.resolve({ data: { status: 'updated', aliases_written: 1 }, error: null })
  } }
  assertEquals(await applyCityFactualPatch(client, city, patch, aliases),
    { error: null, blocked: null, aliasesWritten: 1 })
})

for (const reason of ['human_hold','stale_snapshot','missing_or_retired_city','review_sweep_running']) {
  Deno.test(`guarded writer preserves ${reason} as a deferral`, async () => {
    const client = { rpc: () => Promise.resolve({ data: { status: 'blocked', reason }, error: null }) }
    assertEquals(await applyCityFactualPatch(client, city, {}),
      { error: null, blocked: reason, aliasesWritten: 0 })
  })
}

Deno.test('malformed, missing or impossible write receipts fail closed', async () => {
  for (const data of [null, {}, { status: 'updated' }, { status: 'updated', aliases_written: -1 },
    { status: 'updated', aliases_written: 1 }, { status: 'blocked', reason: 'ignore_human' }]) {
    const client = { rpc: () => Promise.resolve({ data, error: null }) }
    const result = await applyCityFactualPatch(client, city, {})
    assertEquals(result.error?.message, 'city_factual_patch_response_invalid')
    assertEquals(result.aliasesWritten, 0)
  }
})

Deno.test('database refusal remains an error and never retries a write', async () => {
  let calls = 0
  const error = { message: 'unique constraint', code: '23505' }
  const client = { rpc: () => { calls++; return Promise.resolve({ data: null, error }) } }
  assertEquals(await applyCityFactualPatch(client, city, {}), { error, blocked: null, aliasesWritten: 0 })
  assertEquals(calls, 1)
})
