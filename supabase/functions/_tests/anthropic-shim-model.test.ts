/**
 * The shim's `model` argument must reach mapToCfModel, and mapToCfModel must
 * map by TIER rather than by vendor.
 *
 * Two bugs met here. anthropicMessages accepted `model` and silently dropped
 * it, so every one of the 11 callers got the fleet default no matter what it
 * asked for — translate-i18n-batch requested claude-sonnet-4-6 for translation
 * quality and ran on the 8B for its entire life. And mapToCfModel treated every
 * `claude-` name as a request for the 70B, so simply forwarding the argument
 * would have promoted the TEN haiku callers to the expensive model — the exact
 * pattern behind the $765 Workers AI bill (invoice IN-72568830) that the
 * constant's own comment warns about.
 *
 * Hence the haiku assertions below: they are the ones that cost money if wrong.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapToCfModel } from '../_shared/openai-client.ts'

const CHEAP = '@cf/meta/llama-3.1-8b-instruct-fast'
const STRONG = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

Deno.test('haiku is Anthropic\'s CHEAP tier and must not reach the 70B', () => {
  for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-latest']) {
    assertEquals(mapToCfModel(m), CHEAP, `${m} must map to the cheap model`)
  }
})

Deno.test('sonnet/opus are a deliberate request for strength', () => {
  assertEquals(mapToCfModel('claude-sonnet-4-6'), STRONG)
  assertEquals(mapToCfModel('claude-opus-4-8'), STRONG)
})

Deno.test('an explicit @cf/ id is passed through untouched', () => {
  assertEquals(mapToCfModel(STRONG), STRONG)
  assertEquals(mapToCfModel('@cf/google/gemma-4-26b-a4b-it'), '@cf/google/gemma-4-26b-a4b-it')
})

Deno.test('an unknown name falls back to the cheap default, never the 70B', () => {
  assertEquals(mapToCfModel('gpt-4o-mini'), CHEAP)
  assertEquals(mapToCfModel(''), CHEAP)
})
