import { assertEquals, assertInstanceOf } from 'jsr:@std/assert'
import {
  MissingCredentialsError,
  skippedResponse,
  type RawItem,
  type NormalizedItem,
} from '../_shared/source-adapter.ts'

Deno.test('MissingCredentialsError — string arg', () => {
  const err = new MissingCredentialsError('MY_KEY')
  assertInstanceOf(err, MissingCredentialsError)
  assertEquals(err.missing, ['MY_KEY'])
  assertEquals(err.message, 'Missing credentials: MY_KEY')
})

Deno.test('MissingCredentialsError — array arg', () => {
  const err = new MissingCredentialsError(['KEY_A', 'KEY_B'])
  assertEquals(err.missing, ['KEY_A', 'KEY_B'])
  assertEquals(err.message, 'Missing credentials: KEY_A, KEY_B')
})

Deno.test('skippedResponse — shape', () => {
  const res = skippedResponse('missing_credentials', ['FOO_KEY'])
  assertEquals(res.success, true)
  assertEquals(res.skipped, true)
  assertEquals(res.reason, 'missing_credentials')
  assertEquals(res.missing_credentials, ['FOO_KEY'])
  assertEquals(res.items, 0)
  assertEquals(res.items_total, 0)
  assertEquals(res.items_processed, 0)
  assertEquals(res.items_succeeded, 0)
  assertEquals(res.items_failed, 0)
})

Deno.test('RawItem — sourceId must be string', () => {
  const raw: RawItem = { sourceId: 'booking-12345', data: { url: 'https://example.com' } }
  assertEquals(typeof raw.sourceId, 'string')
  assertEquals(raw.data.url, 'https://example.com')
})

Deno.test('NormalizedItem — minimal valid shape', () => {
  const item: NormalizedItem = {
    entityType: 'venue',
    sourceId: 'test-1',
    sourceName: 'test',
    name: 'Test Venue',
    metadata: { data_source: 'test' },
  }
  assertEquals(item.entityType, 'venue')
  assertEquals(item.sourceName, 'test')
})
