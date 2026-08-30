/**
 * Every recordLlmUsage() call site must name its provider.
 *
 * Sibling of llm-caller-attribution.test.ts, and it exists because the same
 * class of omission happened again one layer down. When `llm_call_log.provider`
 * was added, three of the four success paths set it and the fourth — the
 * Cloudflare fallback inside `llmChatCompletion` — did not. Found on prod:
 * translate-i18n-batch rows carried `model: '@cf/meta/llama-3.3-70b…'` and
 * `provider: null` in the same row, which is self-contradictory on its face.
 *
 * A null provider is not a cosmetic gap. NVIDIA cannot be routed through AI
 * Gateway, so this column is the only record of which backend served a call,
 * and `check-pipeline-health.mjs` reports the split from it. A null is
 * indistinguishable from a row written before the column existed, so the
 * fallback provider silently under-counts.
 *
 * Text-scanning rather than behavioural, deliberately: the point is to catch a
 * NEW success path that forgets the field, and a behavioural test only covers
 * the paths someone remembered to write a test for — which is exactly the
 * assumption that failed here.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

/** Files that own a recordLlmUsage call site. */
const CLIENTS = [
  '../_shared/llm-client.ts',
  '../_shared/openai-client.ts',
]

Deno.test('every recordLlmUsage call site sets provider', async () => {
  const offenders: string[] = []

  for (const rel of CLIENTS) {
    const path = new URL(rel, import.meta.url).pathname
    const src = await Deno.readTextFile(path)

    // Slice each recordLlmUsage({ ... }) argument object by brace matching, so
    // a nested object inside the call cannot end the slice early.
    let i = 0
    for (;;) {
      const start = src.indexOf('recordLlmUsage({', i)
      if (start === -1) break
      let depth = 0
      let end = start
      for (let p = src.indexOf('{', start); p < src.length; p++) {
        if (src[p] === '{') depth++
        else if (src[p] === '}') {
          depth--
          if (depth === 0) { end = p; break }
        }
      }
      const call = src.slice(start, end + 1)
      if (!/\bprovider:/.test(call)) {
        const line = src.slice(0, start).split('\n').length
        offenders.push(`${rel.replace('../', '')}:${line}`)
      }
      i = end + 1
    }
  }

  assertEquals(
    offenders,
    [],
    'These recordLlmUsage() calls omit `provider`, so their rows land NULL and ' +
      'the provider split under-counts that backend:\n  ' + offenders.join('\n  '),
  )
})

/** The scanner must be able to fail, or it proves nothing. */
Deno.test('the scanner detects a missing provider', () => {
  const sample = `recordLlmUsage({\n  fn: 'x',\n  usage: { a: 1 },\n})`
  assertEquals(/\bprovider:/.test(sample), false)
  const fixed = `recordLlmUsage({\n  fn: 'x',\n  usage: { a: 1 },\n  provider: 'cloudflare',\n})`
  assertEquals(/\bprovider:/.test(fixed), true)
})
