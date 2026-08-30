import { assertEquals, assertInstanceOf } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { InvalidCredentialsError, MissingCredentialsError, skippedResponse } from './source-adapter.ts'

Deno.test('MissingCredentialsError carries missing keys as array', () => {
  const e = new MissingCredentialsError('FOO_KEY')
  assertInstanceOf(e, Error)
  assertEquals(e.name, 'MissingCredentialsError')
  assertEquals(e.missing, ['FOO_KEY'])
  assertEquals(e.message, 'Missing credentials: FOO_KEY')
})

Deno.test('MissingCredentialsError accepts multiple keys', () => {
  const e = new MissingCredentialsError(['A', 'B'])
  assertEquals(e.missing, ['A', 'B'])
  assertEquals(e.message, 'Missing credentials: A, B')
})

Deno.test('skippedResponse produces non-failing body pipeline-executor recognises', () => {
  const body = skippedResponse('missing_credentials', ['FOO_KEY'])
  assertEquals(body.success, true)
  assertEquals(body.skipped, true)
  assertEquals(body.reason, 'missing_credentials')
  assertEquals(body.items_failed, 0)
  assertEquals(body.items_succeeded, 0)
  assertEquals(body.missing_credentials, ['FOO_KEY'])
})

Deno.test('instanceof check distinguishes MissingCredentialsError from generic Error', () => {
  const missing: unknown = new MissingCredentialsError('X')
  const generic: unknown = new Error('something else')
  assertEquals(missing instanceof MissingCredentialsError, true)
  assertEquals(generic instanceof MissingCredentialsError, false)
})

// ── InvalidCredentialsError ──────────────────────────────────────────────────
// A key that EXISTS but is rejected is a configuration problem, not an outage.
// source-foursquare threw on 401 from inside withCircuitBreaker, so recordFailure
// ran before the handler could classify it: 350 breaker failures, success_count 0,
// and every run still returning HTTP 200 success.

Deno.test('InvalidCredentialsError carries key name and status', () => {
  const e = new InvalidCredentialsError('FOURSQUARE_API_KEY', 401)
  assertInstanceOf(e, Error)
  assertEquals(e.name, 'InvalidCredentialsError')
  assertEquals(e.missing, ['FOURSQUARE_API_KEY'])
  assertEquals(e.status, 401)
  assertEquals(e.message, 'Invalid credentials (HTTP 401): FOURSQUARE_API_KEY')
})

Deno.test('InvalidCredentialsError is distinguishable from MissingCredentialsError', () => {
  const invalid: unknown = new InvalidCredentialsError('K', 403)
  // Both map to a skipped 200, but they are different operator instructions:
  // "set the key" vs "the key you set is rejected".
  assertEquals(invalid instanceof InvalidCredentialsError, true)
  assertEquals(invalid instanceof MissingCredentialsError, false)
  assertEquals(new MissingCredentialsError('K') instanceof InvalidCredentialsError, false)
})

Deno.test('an invalid credential maps to the same non-failing skipped body', () => {
  const e = new InvalidCredentialsError('FOURSQUARE_API_KEY', 401)
  const body = skippedResponse('invalid_credentials', e.missing)
  assertEquals(body.success, true)
  assertEquals(body.skipped, true)
  assertEquals(body.reason, 'invalid_credentials')
  assertEquals(body.missing_credentials, ['FOURSQUARE_API_KEY'])
})
