/**
 * The router's RPC calls must use the argument names the DB functions declare.
 *
 * PostgREST resolves overloads BY ARGUMENT NAME. A single wrong key does not
 * throw, does not warn, and does not fail a type-check — it 404s with PGRST202
 * at runtime, and `callRpc` returns `{ok:false}` which the caller ignored.
 *
 * That is exactly what happened: `circuit_breaker_record_failure` was called
 * with `p_error` while the function declares `p_error_msg`. Every failure went
 * unrecorded for three days, so `failure_count` sat at 0 and the breaker could
 * not trip — the 401/403/exhaustion classification was inert. Worse, the
 * absence READ like health, and it corrupted a live diagnosis: "a rate slot was
 * consumed and the breaker did not move, so it must have been a 429" is only
 * sound if the breaker was capable of moving.
 *
 * Nothing else in the stack can catch this. TypeScript sees a
 * `Record<string, unknown>`; the Deno suite never reaches Postgres. So this
 * asserts the literal key names against the signatures recorded here, and the
 * signatures are copied from `pg_get_functiondef` on the live database rather
 * than from a migration file — the repo file and the deployed function had
 * already drifted (the live failure recorder takes no `register` call and
 * writes no `last_error`, unlike the version in 20260415170600).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

/** Argument names as declared on prod, verified 2026-09-02. */
const SIGNATURES: Record<string, string[]> = {
  circuit_breaker_check: ['p_api_name'],
  circuit_breaker_record_success: ['p_api_name'],
  circuit_breaker_record_failure: ['p_api_name', 'p_error_msg'],
  llm_rate_acquire: ['p_provider', 'p_n'],
}

Deno.test('router RPC calls use the declared argument names', async () => {
  const src = await Deno.readTextFile(
    new URL('../_shared/llm-router.ts', import.meta.url).pathname,
  )
  const offenders: string[] = []

  // Match callRpc('<fn>', { ...keys... }) and pull the object's top-level keys.
  const call = /callRpc(?:<[^>]*>)?\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  let seen = 0
  while ((m = call.exec(src)) !== null) {
    const [, fn, args] = m
    const declared = SIGNATURES[fn]
    if (!declared) {
      offenders.push(`${fn}: no recorded signature — add it after checking pg_get_functiondef`)
      continue
    }
    seen++
    for (const key of args.matchAll(/(\w+)\s*:/g)) {
      if (!declared.includes(key[1])) {
        offenders.push(
          `${fn}: sends '${key[1]}', which it does not declare (${declared.join(', ')}) — PostgREST will 404 with PGRST202`,
        )
      }
    }
  }

  assertEquals(seen > 0, true, 'found no callRpc sites — the regex has drifted')
  assertEquals(offenders, [], `\n  ${offenders.join('\n  ')}\n`)
})

/** The scanner must be able to fail, or it proves nothing. */
Deno.test('the argument-name scanner detects a wrong key', () => {
  const bad = `callRpc('circuit_breaker_record_failure', { p_api_name: a, p_error: b })`
  const declared = SIGNATURES.circuit_breaker_record_failure
  const keys = [...bad.matchAll(/(\w+)\s*:/g)].map((k) => k[1])
  assertEquals(keys.some((k) => !declared.includes(k)), true)
})
