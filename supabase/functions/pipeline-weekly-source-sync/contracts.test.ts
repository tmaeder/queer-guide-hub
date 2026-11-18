import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { adapterName, adapterResult, allowedAdapter, requiredSetting, safeError, secretValues } from './contracts.ts'

Deno.test('registered adapter routing preserves free fallbacks and refuses arbitrary endpoints', () => {
  assertEquals(adapterName({ slug: 'rest-countries', edge_function: 'import-rest-countries' }), 'source-rest-countries')
  assertEquals(adapterName({ slug: 'foursquare', edge_function: 'source-foursquare' }), 'source-foursquare-free')
  for (const path of ['https://example.com/x', '../delete-users', 'source-osm-venue?secret=x', 'delete-account'])
    assertEquals(allowedAdapter(path), false)
  assertEquals(allowedAdapter('source-osm-venue'), true)
})

Deno.test('real empty and idempotent imports remain successful without inventing staged counts', () => {
  assertEquals(adapterResult(200, { success: true, items: 0 }).outcome, 'succeeded')
  const value = adapterResult(200, { success: true, items: 0, items_total: 273, items_skipped: 273, items_failed: 0 })
  assertEquals([value.outcome, value.fetched, value.staged, value.skipped], ['succeeded', 273, 0, 273])
})

Deno.test('HTTP 200 does not conceal failed individual scraper results or partial staging', () => {
  const value = adapterResult(200, { success: true, total_items_staged: 2, results: [{ items_found: 5, error: 'Upstream unavailable' }] })
  assertEquals([value.outcome, value.fetched, value.staged], ['failed', 5, 2])
  assertEquals(adapterResult(200, { success: false, error: 'No source' }).outcome, 'failed')
  assertEquals(adapterResult(200, { items_failed: 1 }).outcome, 'failed')
  assertEquals(adapterResult(503, { error: 'Capacity exhausted' }).retryable, true)
  assertEquals(adapterResult(401, { error: 'Invalid credential' }).retryable, false)
})

Deno.test('setting names are distinguished from legacy boolean flags', () => {
  assertEquals(requiredSetting('FOURSQUARE_API_KEY'), 'FOURSQUARE_API_KEY')
  for (const flag of ['true', 'false', true, false, 'Bearer value', null]) assertEquals(requiredSetting(flag), null)
})

Deno.test('stored errors omit source and transport credentials, URLs and control characters', () => {
  const values = secretValues({ nested: { api_key: 'private-value' }, ordinary: 'kept' })
  const text = safeError('private-value failed at https://example.com/?key=other with Bearer abc123\n token=abcdef', values)
  assertEquals(text, '[redacted] failed at [provider URL] with Bearer [redacted]  token=[redacted]')
  assertEquals(safeError('valid message '.repeat(60)).length, 500)
  assertEquals(safeError('abcdefghijklmnopqrstuvwxyzABCDEF0123'), '[redacted]')
})

Deno.test('an incomplete catalogue or unknown OSM city is never reported as a complete sync', () => {
  for (const body of [{ success: true, has_more: true }, { success: true, continuation_pending: true }, { success: true, cities_unknown: 1 }])
    assertEquals(adapterResult(200, body).outcome, 'failed')
})

Deno.test('HTTP 200 credential skips remain actionable blocked outcomes, not green imports', () => {
  const outcome = adapterResult(200, { success: true, skipped: true, reason: 'Missing credentials', missing_credentials: ['PROVIDER_API_KEY'] })
  assertEquals(outcome.outcome, 'blocked')
  assertEquals(outcome.required_settings, ['PROVIDER_API_KEY'])
  assertEquals(adapterResult(200, { success: true, skipped: true, reason: 'Source paused' }).outcome, 'skipped')
})

Deno.test('dry-run previews report fetched records without inventing staging writes', () => {
  const outcome = adapterResult(200, { success: true, dry_run: true, items: 12, items_succeeded: 12 })
  assertEquals([outcome.fetched, outcome.staged], [12, 0])
})
