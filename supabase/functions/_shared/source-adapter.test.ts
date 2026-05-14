import { assertEquals, assertInstanceOf } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { MissingCredentialsError, skippedResponse } from './source-adapter.ts'

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
