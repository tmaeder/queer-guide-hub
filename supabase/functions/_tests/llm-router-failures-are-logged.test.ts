/**
 * Every breaker-failure path must LOG, not only record.
 *
 * `breakerFailure()` calls `circuit_breaker_record_failure`, and on this
 * project `api_circuit_breakers` HAS NO `last_error` column — so the
 * `p_error_msg` argument is accepted and dropped. Recording a failure preserves
 * the COUNT and destroys the REASON.
 *
 * Measured 2026-09-02: `openai/gpt-oss-120b` failed a live city-agentic-enrich
 * call. The breaker counted it and Cloudflare served correctly, but no surface
 * anywhere could say whether the cause was a 404, a timeout, a refusal or a bad
 * request — so "which model actually works" stalled on a missing string.
 *
 * This provider is deliberately outside AI Gateway. If the router does not
 * print it, it does not exist. Text-scanning rather than behavioural for the
 * same reason as llm-provider-attribution.test.ts: the point is to catch a NEW
 * failure path that forgets, and a behavioural test only covers the paths
 * someone remembered to write.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const SRC = new URL('../_shared/llm-router.ts', import.meta.url).pathname

/** Lines within `window` lines above a call, used to look for a nearby log. */
function hasLogNear(lines: string[], idx: number, window = 8): boolean {
  const from = Math.max(0, idx - window)
  return lines.slice(from, idx).some((l) => /console\.(warn|error)\(/.test(l))
}

Deno.test('every breakerFailure call site logs the reason first', async () => {
  const src = await Deno.readTextFile(SRC)
  const lines = src.split('\n')
  const offenders: string[] = []
  let seen = 0

  lines.forEach((line, i) => {
    if (!/await breakerFailure\(/.test(line)) return
    seen++
    if (!hasLogNear(lines, i)) {
      offenders.push(
        `line ${i + 1}: ${line.trim()} — records the failure but prints nothing, ` +
          `and last_error does not exist on this table, so the reason is lost`,
      )
    }
  })

  assertEquals(seen >= 3, true, `expected >=3 breakerFailure sites, found ${seen}`)
  assertEquals(offenders, [], `\n  ${offenders.join('\n  ')}\n`)
})

/** The scanner must be able to fail, or it proves nothing. */
Deno.test('the scanner detects an unlogged failure path', () => {
  const sample = [
    'if (bad) {',
    '  await breakerFailure(NVIDIA_BREAKER, "x")',
    '}',
  ]
  assertEquals(hasLogNear(sample, 1), false)
  const fixed = [
    'if (bad) {',
    '  console.warn("[llm-router] nvidia failed")',
    '  await breakerFailure(NVIDIA_BREAKER, "x")',
    '}',
  ]
  assertEquals(hasLogNear(fixed, 2), true)
})
