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
 *
 * That state is now CONSTRUCTED by `offline()`, not inherited from the ambient
 * environment. This comment used to claim the tests took the fallback path "by
 * construction" because no SUPABASE_SERVICE_ROLE_KEY would be set — which was
 * true of the `edge-fn-tests` CI job and false of `pipeline-health.yml`, which
 * exports real credentials so it can query prod. There `callRpc` reached the
 * live database and returned `source: 'db'`, so the first test failed with
 * `Actual: db / Expected: fallback` — green in one job and red in another, for
 * three days, for a reason in neither the module nor the assertion.
 *
 * `pg-rpc.ts` reads both variables INSIDE `callRpc` rather than at module load,
 * which is what makes removing them at call time work.
 */

/**
 * Runs `fn` with the database credentials removed, then restores them.
 *
 * Restoration is in a `finally` and is unconditional: Deno runs every test
 * file in one process per `deno test` invocation, so a leaked deletion here
 * would silently push unrelated suites onto their own offline paths.
 */
async function offline<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    url: Deno.env.get('SUPABASE_URL'),
    key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }
  Deno.env.delete('SUPABASE_URL')
  Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
  try {
    return await fn()
  } finally {
    if (saved.url !== undefined) Deno.env.set('SUPABASE_URL', saved.url)
    if (saved.key !== undefined) Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', saved.key)
  }
}

Deno.test('falls back to the compiled-in prompt when the database is unreachable', async () => {
  await offline(async () => {
    resetVoiceCache()
    const voice = await getVoicePrompt('core')
    assertEquals(voice.source, 'fallback')
    assertEquals(voice.version, null)
    assertEquals(voice.prompt, VOICE_FALLBACK_PROMPT)
  })
  // The cache is per-isolate and now holds a fallback entry built while the
  // credentials were hidden; clear it so a later test cannot inherit it.
  resetVoiceCache()
})

Deno.test('the offline helper restores the credentials it hides', async () => {
  // Without this, a leak would make every later suite in the same process take
  // its offline path and pass for the wrong reason — the exact failure mode
  // this file just had, inverted.
  //
  // The baseline is a SENTINEL this test sets itself, never the ambient value.
  // Reading ambient state makes the assertion self-masking: an earlier test
  // whose `offline()` leaked would leave the variable already unset, so
  // `before` would be `undefined`, the post-condition would compare
  // `undefined === undefined`, and the leak would prove its own absence.
  // Mutation-tested — dropping the restore was NOT caught until this changed.
  const SENTINEL = 'sentinel-value-for-restore-check'
  const saved = {
    url: Deno.env.get('SUPABASE_URL'),
    key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }
  try {
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SENTINEL)
    await offline(async () => {
      assertEquals(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), undefined)
    })
    assertEquals(
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      SENTINEL,
      'offline() must put the credentials back',
    )
  } finally {
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
    if (saved.url !== undefined) Deno.env.set('SUPABASE_URL', saved.url)
    if (saved.key !== undefined) Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', saved.key)
  }
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

// The three below also call the loader, so they are wrapped too. In a
// credentialed job they would otherwise make real network calls to prod —
// slower, and dependent on live data for assertions that are about this
// module's own framing and caching, not about what the database holds.

Deno.test('withVoice puts the voice first and the caller task second', async () => {
  await offline(async () => {
    resetVoiceCache()
    const combined = await withVoice('Return JSON with keys a and b.', 'compact')
    assert(
      combined.indexOf('queer.guide') < combined.indexOf('Return JSON'),
      'the voice frame claims the task follows it, so it must come first',
    )
    assertStringIncludes(combined, 'Return JSON with keys a and b.')
  })
  resetVoiceCache()
})

Deno.test('the per-isolate memo returns the same object within its TTL', async () => {
  await offline(async () => {
    resetVoiceCache()
    const a = await getVoicePrompt('compact')
    const b = await getVoicePrompt('compact')
    assertEquals(a, b)
  })
  resetVoiceCache()
})

Deno.test('profiles are cached independently', async () => {
  await offline(async () => {
    resetVoiceCache()
    const core = await getVoicePrompt('core')
    const compact = await getVoicePrompt('compact')
    assertEquals(core.profile, 'core')
    assertEquals(compact.profile, 'compact')
  })
  resetVoiceCache()
})
