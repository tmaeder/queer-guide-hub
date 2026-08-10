/**
 * Guard: no Workers AI model deprecated on 2026-05-30 may appear in the tree.
 *
 * Cloudflare retired 18 models on that date and now answers them with HTTP 410.
 * The failure is invisible from the repo side — nothing goes red at deploy, the
 * function simply throws at runtime — and it is invisible from the ERROR side
 * too, because Cloudflare reports the model under an internal alias
 * (`@cf/meta/infire-llama-3.1-8b-instruct`) that appears nowhere in this
 * codebase. Grepping the error message for the model name finds nothing.
 *
 * Measured cost of not having this test: `pipeline-safety-relevance` failed
 * every run from 2026-07-24 to 2026-08-10 — 17 days, 6,514 logged errors —
 * and `marketplace-translate` from 2026-08-07. The safety pipeline is the one
 * that emits the `outing` risk flag, so it is exactly the pipeline where a
 * silent 17-day outage matters most. (It failed CLOSED — 0 submissions were
 * promoted unscored — but that was luck of the downstream design, not of this
 * failure mode.)
 *
 * `-fast` and `-lora` variants of the same names remain ACTIVE, so the check
 * must match the deprecated name and NOT its still-live variants. That is why
 * the pattern requires a quote or end-of-string terminator rather than a bare
 * substring: `@cf/meta/llama-3.1-8b-instruct-fast` must pass.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

/** Retired 2026-05-30 — https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/ */
const DEPRECATED_MODELS = [
  '@hf/meta-llama/meta-llama-3-8b-instruct',
  '@cf/meta/llama-3-8b-instruct',
  '@cf/meta/llama-3-8b-instruct-awq',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-awq',
  '@cf/meta/llama-3.1-70b-instruct',
  '@cf/meta/llama-2-7b-chat-int8',
  '@cf/meta/llama-2-7b-chat-fp16',
  '@cf/mistral/mistral-7b-instruct-v0.1',
  '@hf/mistral/mistral-7b-instruct-v0.2',
  '@hf/google/gemma-7b-it',
  '@cf/google/gemma-3-12b-it',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@cf/microsoft/phi-2',
  '@cf/defog/sqlcoder-7b-2',
  '@cf/unum/uform-gen2-qwen-500m',
  '@cf/facebook/bart-large-cnn',
  '@cf/moonshotai/kimi-k2.5',
]

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory) {
      yield* walk(path)
    } else if (entry.isFile && entry.name.endsWith('.ts')) {
      yield path
    }
  }
}

Deno.test('no deprecated Workers AI model is referenced', async () => {
  const offenders: string[] = []
  const self = 'deprecated-models.test.ts'

  for await (const path of walk('.')) {
    if (path.endsWith(self)) continue
    const src = await Deno.readTextFile(path)
    for (const model of DEPRECATED_MODELS) {
      // Terminator required so the still-active `-fast` / `-lora` variants pass.
      const re = new RegExp(
        `${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-\\w])`,
      )
      if (re.test(src)) offenders.push(`${path} -> ${model}`)
    }
  }

  assertEquals(
    offenders,
    [],
    `Deprecated Workers AI model(s) referenced — Cloudflare answers these with HTTP 410:\n  ${offenders.join('\n  ')}\n` +
      `Use a still-active variant (e.g. @cf/meta/llama-3.1-8b-instruct-fast) or a listed replacement.`,
  )
})

Deno.test('the -fast variant is NOT flagged (negative control)', () => {
  const live = '@cf/meta/llama-3.1-8b-instruct-fast'
  const re = new RegExp(
    `${'@cf/meta/llama-3.1-8b-instruct'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-\\w])`,
  )
  // Without the terminator this would match and the guard would reject the very
  // model we migrated TO — a guard that fails its own fix is worse than none.
  assertEquals(re.test(live), false)
})
