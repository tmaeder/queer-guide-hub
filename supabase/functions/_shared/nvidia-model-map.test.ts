/**
 * Tier mapping for NVIDIA, mirroring anthropic-shim-model.test.ts.
 *
 * The case that earns this file is the `@cf/` STRONG ids: three callers in
 * ai-enrichment.ts name the 70B literally rather than via a `claude-*` alias,
 * and resolving those to the cheap tier would silently demote the only calls
 * that ever deliberately asked for a big model — while still returning
 * plausible JSON, so nothing downstream would notice.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  mapToNvidiaModel,
  NVIDIA_MODEL_DEFAULT,
  NVIDIA_MODEL_STRONG,
} from './nvidia-model-map.ts'

const ENV_KEYS = ['NVIDIA_MODEL', 'NVIDIA_MODEL_STRONG', 'CF_AI_MODEL_STRONG']

/**
 * Run `fn` with the mapper's env vars cleared, then restore them EXACTLY.
 *
 * The restore has to delete keys that had no prior value, not just re-set the
 * ones that did. Deno runs every test file in one process with one shared
 * environment, so a key this file introduces and leaves behind silently
 * reconfigures every later file: an earlier version leaked
 * `CF_AI_MODEL_STRONG` and broke four assertions in anthropic-shim-model and
 * shim-model-reaches-cf, which had passed when each file was run alone.
 */
function withCleanEnv(fn: () => void): void {
  const saved = new Map(ENV_KEYS.map((k) => [k, Deno.env.get(k)]))
  for (const k of ENV_KEYS) Deno.env.delete(k)
  try {
    fn()
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
  }
}

Deno.test('claude-haiku is the CHEAP tier, not the strong one', () => {
  withCleanEnv(() => {
    assertEquals(mapToNvidiaModel('claude-haiku-4-5-20251001'), NVIDIA_MODEL_DEFAULT)
  })
})

Deno.test('claude-sonnet and claude-opus map to the strong tier', () => {
  withCleanEnv(() => {
    assertEquals(mapToNvidiaModel('claude-sonnet-4-6'), NVIDIA_MODEL_STRONG)
    assertEquals(mapToNvidiaModel('claude-opus-4-8'), NVIDIA_MODEL_STRONG)
  })
})

Deno.test('an explicit @cf 70B id keeps its tier instead of being demoted', () => {
  withCleanEnv(() => {
    assertEquals(
      mapToNvidiaModel('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
      NVIDIA_MODEL_STRONG,
    )
    assertEquals(
      mapToNvidiaModel('@cf/meta/llama-3.1-70b-instruct-fp8-fast'),
      NVIDIA_MODEL_STRONG,
    )
  })
})

Deno.test('an ordinary @cf id is a cheap-tier opt-in', () => {
  withCleanEnv(() => {
    assertEquals(
      mapToNvidiaModel('@cf/meta/llama-3.1-8b-instruct-fast'),
      NVIDIA_MODEL_DEFAULT,
    )
  })
})

Deno.test('legacy and unknown names fall to the cheap tier', () => {
  withCleanEnv(() => {
    assertEquals(mapToNvidiaModel('gpt-4o-mini'), NVIDIA_MODEL_DEFAULT)
    assertEquals(mapToNvidiaModel(''), NVIDIA_MODEL_DEFAULT)
  })
})

Deno.test('an NVIDIA-style vendor/model id passes through untouched', () => {
  withCleanEnv(() => {
    assertEquals(mapToNvidiaModel('openai/gpt-oss-120b'), 'openai/gpt-oss-120b')
    assertEquals(mapToNvidiaModel('google/gemma-3-12b-it'), 'google/gemma-3-12b-it')
  })
})

/**
 * The null contract. A vision or embedding request must never be answered by a
 * text model: for embeddings the whole search index lives in one fixed 1024-dim
 * space, and quietly returning chat text instead of a vector would surface
 * weeks later as bad search results rather than as an error.
 */
Deno.test('vision, embedding and reranker models resolve to null, never a chat model', () => {
  withCleanEnv(() => {
    assertEquals(mapToNvidiaModel('@cf/meta/llama-3.2-11b-vision-instruct'), null)
    assertEquals(mapToNvidiaModel('@cf/baai/bge-m3'), null)
    assertEquals(mapToNvidiaModel('@cf/baai/bge-base-en-v1.5'), null)
    assertEquals(mapToNvidiaModel('@cf/baai/bge-reranker-base'), null)
  })
})

Deno.test('both tiers are env-overridable so a retirement is a secret change', () => {
  withCleanEnv(() => {
    Deno.env.set('NVIDIA_MODEL', 'vendor/cheap-x')
    Deno.env.set('NVIDIA_MODEL_STRONG', 'vendor/strong-x')
    assertEquals(mapToNvidiaModel('gpt-4o-mini'), 'vendor/cheap-x')
    assertEquals(mapToNvidiaModel('claude-opus-4-8'), 'vendor/strong-x')
  })
})

Deno.test('a CF_AI_MODEL_STRONG override is recognised as strong tier', () => {
  withCleanEnv(() => {
    Deno.env.set('CF_AI_MODEL_STRONG', '@cf/some/other-big-model')
    assertEquals(mapToNvidiaModel('@cf/some/other-big-model'), NVIDIA_MODEL_STRONG)
  })
})
