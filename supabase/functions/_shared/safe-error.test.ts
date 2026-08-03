import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { GENERIC_ERROR_CODE, safeErrCode } from './safe-error.ts'

// Silence the deliberate console.error a suppressed code emits, so the test
// output stays readable, and hand back what it would have logged.
function capturingConsoleError<T>(fn: () => T): { result: T; logged: unknown[][] } {
  const original = console.error
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    return { result: fn(), logged }
  } finally {
    console.error = original
  }
}

Deno.test('passes through a literal the handler declared', () => {
  const { result } = capturingConsoleError(() =>
    safeErrCode(new Error('wdqs_request_failed'), ['wdqs_request_failed'])
  )
  assertEquals(result, 'wdqs_request_failed')
})

// The reason this module exists: line ~539 of city-factual-backfill rethrows a
// Postgres error, which names columns and constraints.
Deno.test('suppresses a Postgres driver message', () => {
  const dbErr = new Error(
    'null value in column "wikidata_qid" of relation "cities" violates not-null constraint',
  )
  const { result } = capturingConsoleError(() => safeErrCode(dbErr, ['wdqs_request_failed']))
  assertEquals(result, GENERIC_ERROR_CODE)
})

Deno.test('suppresses a runtime fault with no allowlist at all', () => {
  const { result } = capturingConsoleError(() =>
    safeErrCode(new TypeError("Cannot read properties of undefined (reading 'bindings')"))
  )
  assertEquals(result, GENERIC_ERROR_CODE)
})

// `catch` is untyped — a thrown string or object must not crash the guard.
Deno.test('handles non-Error throws', () => {
  const { result: fromString } = capturingConsoleError(() => safeErrCode('boom'))
  assertEquals(fromString, GENERIC_ERROR_CODE)

  const { result: fromObject } = capturingConsoleError(() => safeErrCode({ code: '42P01' }))
  assertEquals(fromObject, GENERIC_ERROR_CODE)

  // A bare string throw is still matchable when the handler declared it.
  const { result: allowedString } = capturingConsoleError(() => safeErrCode('boom', ['boom']))
  assertEquals(allowedString, 'boom')
})

Deno.test('accepts a Set as well as an array', () => {
  const { result } = capturingConsoleError(() =>
    safeErrCode(new Error('quota_exhausted'), new Set(['quota_exhausted']))
  )
  assertEquals(result, 'quota_exhausted')
})

// A suppressed error must remain diagnosable by the operator.
Deno.test('logs the full detail server-side when it suppresses', () => {
  const dbErr = new Error('relation "citiez" does not exist')
  const { result, logged } = capturingConsoleError(() => safeErrCode(dbErr, [], 'city-backfill'))
  assertEquals(result, GENERIC_ERROR_CODE)
  assertEquals(logged.length, 1)
  assertStringIncludes(String(logged[0][0]), 'city-backfill')
  assertEquals(logged[0][1], dbErr)
})

// An allowed code is not an error condition — it must not spam the log.
Deno.test('does not log when the code is allowed', () => {
  const { logged } = capturingConsoleError(() =>
    safeErrCode(new Error('wdqs_request_failed'), ['wdqs_request_failed'])
  )
  assertEquals(logged.length, 0)
})
