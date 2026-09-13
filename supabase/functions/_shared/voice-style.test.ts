import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  VOICE_FALLBACK_PROMPT,
  getVoicePrompt,
  resetVoiceCache,
  withVoice,
} from './voice-style.ts'

/**
 * These exercise the contract that matters when the database is NOT reachable,
 * which is the only state in which this module's behaviour is load-bearing.
 * With no SUPABASE_SERVICE_ROLE_KEY in the environment, `callRpc` returns
 * `{ ok: false }` without a network call, so every test here runs offline and
 * takes the fallback path by construction.
 */

Deno.test('falls back to the compiled-in prompt when the database is unreachable', async () => {
  resetVoiceCache()
  const voice = await getVoicePrompt('core')
  assertEquals(voice.source, 'fallback')
  assertEquals(voice.version, null)
  assertEquals(voice.prompt, VOICE_FALLBACK_PROMPT)
})

Deno.test('the fallback is a usable prompt, not a stub', () => {
  // A nearly-empty system prompt would switch the voice off everywhere while
  // every call kept reporting success — the failure this whole module exists
  // to make impossible.
  assert(VOICE_FALLBACK_PROMPT.length > 5000, 'fallback is suspiciously short')
  assertStringIncludes(VOICE_FALLBACK_PROMPT, '===== BEGIN QUEER.GUIDE VOICE DATA =====')
  assertStringIncludes(VOICE_FALLBACK_PROMPT, '===== END QUEER.GUIDE VOICE DATA =====')
  assertStringIncludes(VOICE_FALLBACK_PROMPT, '## Non-negotiables')
  assertStringIncludes(VOICE_FALLBACK_PROMPT, 'Never invent a fact')
})

Deno.test('the fallback never leaks an unclosed data fence', () => {
  const count = (needle: string) => VOICE_FALLBACK_PROMPT.split(needle).length - 1
  assertEquals(count('===== BEGIN QUEER.GUIDE VOICE DATA ====='), 1)
  assertEquals(count('===== END QUEER.GUIDE VOICE DATA ====='), 1)
})

Deno.test('the non-negotiables sit AFTER the data block', () => {
  // Order is the guarantee: anything an editor writes is inside the fence, and
  // the fixed rules that override it come last.
  const fenceEnd = VOICE_FALLBACK_PROMPT.indexOf('===== END QUEER.GUIDE VOICE DATA =====')
  const nonNegotiables = VOICE_FALLBACK_PROMPT.indexOf('## Non-negotiables')
  assert(fenceEnd > 0 && nonNegotiables > fenceEnd)
})

Deno.test('withVoice puts the voice first and the caller task second', async () => {
  resetVoiceCache()
  const combined = await withVoice('Return JSON with keys a and b.', 'compact')
  assert(
    combined.indexOf('queer.guide') < combined.indexOf('Return JSON'),
    'the voice frame claims the task follows it, so it must come first',
  )
  assertStringIncludes(combined, 'Return JSON with keys a and b.')
})

Deno.test('the per-isolate memo returns the same object within its TTL', async () => {
  resetVoiceCache()
  const a = await getVoicePrompt('compact')
  const b = await getVoicePrompt('compact')
  assertEquals(a, b)
})

Deno.test('profiles are cached independently', async () => {
  resetVoiceCache()
  const core = await getVoicePrompt('core')
  const compact = await getVoicePrompt('compact')
  assertEquals(core.profile, 'core')
  assertEquals(compact.profile, 'compact')
})
