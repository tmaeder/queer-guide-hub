/**
 * NVIDIA-first provider routing, with Cloudflare Workers AI underneath.
 *
 * This is the first real provider CHAIN in this repo. What existed before was
 * switching, not falling back: `USE_OPENAI` and `USE_ANTHROPIC` pick one
 * backend per call, and if it fails the call throws. So the failure
 * classification here has no precedent to inherit and is the load-bearing part
 * of the file.
 *
 * SHAPE. The router owns only the NVIDIA attempt and the decision to make it.
 * It does NOT own the Cloudflare transport, because there are two of those and
 * they are not interchangeable: openai-client.ts posts to the native `/ai/run`
 * endpoint (no `model` in the body, answer at `result.response`) while
 * llm-client.ts posts to the OpenAI-compat `/ai/v1` endpoint (answer at
 * `choices[0].message.content`). Both were arrived at the hard way — the compat
 * endpoint hangs for 25s on some models, which is why the native one exists —
 * so neither gets rewritten here. Each client calls `tryNvidia()`, returns its
 * result if served, and otherwise runs its existing Cloudflare code untouched.
 *
 * That shape is also what makes the rollback guarantee cheap: with
 * NVIDIA_API_KEY unset, `tryNvidia` returns `{served:false}` before doing any
 * work, and the request that goes out is byte-identical to today's.
 *
 * NOT BEHIND AI GATEWAY. Cloudflare's AI Gateway supports 24 providers and
 * NVIDIA is not one of them, with no universal passthrough. So NVIDIA traffic
 * is direct, with no gateway cache and no gateway observability — which is why
 * `llm_call_log.provider` is not optional. It is the only record that this path
 * ran at all.
 */

import { acquireSlot } from './llm-rate-limit.ts'
import { mapToNvidiaModel } from './nvidia-model-map.ts'
import { callRpc } from './pg-rpc.ts'

export const NVIDIA_BREAKER = 'llm.nvidia'
export const NVIDIA_RATE_KEY = 'nvidia'

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

/** Matches the 45s ceiling in openai-client.ts; the strong tier legitimately runs ~20-26s. */
const PER_CALL_TIMEOUT_MS = 45_000

export interface NvidiaRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  /** The caller's model name, in whatever vocabulary that call site uses. */
  model: string
  temperature: number
  max_tokens: number
}

export interface NvidiaOptions {
  /** Edge function name. Drives the per-caller opt-out and the usage log. */
  callerFn: string
  /** Wait budget for a rate-limit slot. Omit to use the policy below. */
  waitMs?: number
  /** Absolute wall-clock deadline (epoch ms) for the caller's invocation. */
  deadlineAt?: number
}

/**
 * Callers allowed to WAIT for a rate-limit slot. Everything else — including
 * anything unrecognised — falls back instantly instead of pacing.
 *
 * Pacing exists to fit batch work under a 32 RPM bucket. Applied to a request a
 * human is sitting in front of, the same mechanism is just a queue in front of
 * the user: the trip concierge would sleep before answering, to save a fraction
 * of a cent. Mutation-testing this list away made one `trip-concierge` call take
 * 61 seconds.
 *
 * IT IS AN ALLOWLIST, NOT A DENYLIST, AND THAT INVERSION IS THE WHOLE POINT.
 * The first version listed the interactive callers instead, and was wrong in a
 * way its own test could not see: the eleven trip/user-facing functions reach
 * this file through `anthropicMessages` → `llmAnthropicStyle`, which did not
 * forward `callerFn` at all, so every one of them arrived as the fallback string
 * `'llmChatCompletion'` and matched no entry in the interactive list. They would
 * all have paced. The test passed because it called `tryNvidia` with
 * `callerFn: 'trip-concierge'` directly — a name no production code ever
 * passed. Testing the lookup proved the lookup, not the path; the same failure
 * shim-model-reaches-cf.test.ts was written about.
 *
 * `callerFn` is threaded through the shim now, but the allowlist stays inverted
 * regardless: an unknown or unattributed caller must fail toward "answer the
 * user immediately and pay Cloudflare", never toward "make a person wait".
 * Getting an entry wrong here costs money in one direction and user experience
 * in the other, and those are not equal.
 */
const BATCH_CALLERS = new Set([
  'backfill-llm-enrich',
  'bulk-create-ai-tags',
  'bulk-create-personalities',
  'categorize-tags',
  'fetch-personality-data',
  'marketplace-categorize',
  'marketplace-relevance-rescore',
  'marketplace-translate',
  'news-quality-backfill',
  'personality-extract-from-bio',
  'pipeline-ai-suggest',
  'pipeline-enrich-country-editorial',
  'pipeline-enrich-news',
  'pipeline-enrich-places',
  'pipeline-quality-enhance',
  'pipeline-safety-relevance',
  'shared:ai-enrichment',
  'shared:existence-probe',
  'shared:personhood-classifier',
  'tag-enrichment-sweep',
  'translate-i18n-batch',
  'venue-contact-enrich',
])

/**
 * Deadline for the current invocation, set by batch drivers that know their own
 * wall-clock budget (see enrichment-driver.ts). Used only when the caller did
 * not pass `deadlineAt` explicitly.
 *
 * Module-scoped mutable state is a real cost, taken deliberately: the
 * alternative is threading a deadline parameter through eleven enrichment
 * adopters and every function they call. The failure mode is bounded and safe
 * in one direction — if two invocations share an isolate, the shorter deadline
 * wins, so the router paces LESS and falls back to Cloudflare SOONER. That
 * spends money; it cannot overrun the edge wall, which is the failure this
 * deadline exists to prevent.
 */
let invocationDeadlineAt: number | null = null

/** Set the wall-clock deadline for work started now. Returns a reset handle. */
export function setInvocationDeadline(deadlineAt: number): () => void {
  const prev = invocationDeadlineAt
  invocationDeadlineAt = deadlineAt
  return () => {
    invocationDeadlineAt = prev
  }
}

/**
 * How long this caller may wait for a rate-limit slot.
 *
 * Explicit `waitMs` wins; then the batch allowlist; otherwise zero.
 */
function resolveWaitMs(opts: NvidiaOptions): number {
  if (typeof opts.waitMs === 'number') return Math.max(0, opts.waitMs)
  if (!BATCH_CALLERS.has(opts.callerFn)) return 0
  const raw = Number(Deno.env.get('NVIDIA_MAX_WAIT_MS'))
  return Number.isFinite(raw) && raw >= 0 ? raw : 2000
}

export interface NvidiaServed {
  served: true
  content: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model: string
}

export interface NvidiaSkipped {
  served: false
  /** Why NVIDIA did not serve this. Logged by the caller, never thrown. */
  reason: string
}

export type NvidiaOutcome = NvidiaServed | NvidiaSkipped

/** The subset of the OpenAI-compatible response body this file reads. */
interface CompletionBody {
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  model?: string
}

/**
 * Coerce a `content` field to a string, mirroring openai-client.ts. An
 * OpenAI-compatible server may still hand back an already-parsed object when
 * the model emitted JSON, and every downstream parser here expects a string.
 */
function asContentString(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

function excludedCallers(): Set<string> {
  const raw = Deno.env.get('NVIDIA_EXCLUDE_CALLERS') ?? ''
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/**
 * How the provider failed, which decides whether the circuit breaker hears
 * about it.
 *
 * The distinction that matters is `rate_limited` vs everything else. A 429 is
 * the provider saying "too fast", not "you are out" — our own bucket should
 * have prevented it, so it means the configured cap is too high, and it is a
 * fact about pacing rather than about provider health. Counting it as a breaker
 * failure would trip the circuit during any legitimate burst and take NVIDIA
 * out for the reset window, which is precisely backwards.
 *
 * This is the same lesson as the pg_net reaper's `timed_out` handling: a
 * response that means "not now" must not be filed as "broken".
 */
type FailureKind = 'rate_limited' | 'exhausted' | 'auth' | 'transient'

/**
 * Breaker operations over the SQL RPCs rather than circuit-breaker.ts, which
 * requires a SupabaseClient this module deliberately does not have (see
 * pg-rpc.ts). Same three functions, same table, same semantics — the
 * `circuit_breaker_*` RPCs are what circuit-breaker.ts itself calls.
 *
 * All three are advisory: if the RPC is unreachable, `breakerAllows` returns
 * true and inference proceeds. A breaker that cannot be read must not become a
 * second outage on top of whatever it was meant to protect against.
 */
async function breakerAllows(apiName: string): Promise<boolean> {
  const res = await callRpc<boolean>('circuit_breaker_check', { p_api_name: apiName })
  if (!res.ok) return true
  return res.data !== false
}

async function breakerFailure(apiName: string, error: string): Promise<void> {
  // The parameter is `p_error_msg`. It was `p_error` here, and PostgREST
  // resolves overloads BY ARGUMENT NAME, so every one of these calls 404'd with
  // PGRST202 and the breaker never recorded a single failure — it could not
  // trip, which made the whole 401/403/exhaustion classification inert.
  //
  // It was invisible because callRpc never throws and this function ignored its
  // result. So the symptom was an absence: `failure_count` stayed 0, and that
  // reads exactly like "nothing has gone wrong". It actively misled the live
  // diagnosis — "a slot was consumed and the breaker did not move, therefore it
  // must have been a 429" is only sound if the breaker COULD have moved.
  const res = await callRpc('circuit_breaker_record_failure', {
    p_api_name: apiName,
    p_error_msg: error,
  })
  if (!res.ok) {
    // Bookkeeping must never break inference, so this still does not throw —
    // but silence is what let a dead breaker look healthy for three days.
    console.warn(`[llm-router] breaker failure NOT recorded for ${apiName}: ${res.error}`)
  }
}

async function breakerSuccess(apiName: string): Promise<void> {
  await callRpc('circuit_breaker_record_success', { p_api_name: apiName })
}

function classify(status: number): FailureKind {
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 500) return 'transient'
  // 402 and every other non-429 4xx. NVIDIA does not document the status it
  // returns when free credits run out, so this arm is deliberately wide and
  // conservative: an unrecognised client error stops us asking rather than
  // hammering. The response body goes into api_circuit_breakers.last_error, so
  // the real shape is readable from production after the first occurrence and
  // this classifier can be narrowed against evidence instead of guesswork.
  return 'exhausted'
}

/**
 * Attempt one chat completion on NVIDIA.
 *
 * Never throws. Every failure path returns `{served:false}` so the caller
 * proceeds to Cloudflare — a provider chain whose first link can throw is not a
 * chain.
 */
export async function tryNvidia(
  req: NvidiaRequest,
  opts: NvidiaOptions,
): Promise<NvidiaOutcome> {
  const apiKey = Deno.env.get('NVIDIA_API_KEY')
  // `not_configured` is the only SILENT skip: with no key that is the steady
  // state for the whole fleet and logging it would be pure noise. Every other
  // skip means the provider IS configured and still did not serve, which is
  // precisely what an operator needs to see.
  //
  // This function computed a exact `reason` and then discarded it. Diagnosing a
  // live "why is everything still on Cloudflare?" cost a dozen round-trips of
  // inferring the answer from side-effects — whether the rate bucket's
  // last_refill had moved, whether the breaker counter had changed — when the
  // answer was sitting in a variable nobody printed. A fallback that cannot say
  // why it fell back is not observable, and this one is deliberately invisible
  // to AI Gateway as well, so there is no second place to look.
  if (!apiKey) return { served: false, reason: 'not_configured' }

  // `reason` stays a stable machine-readable token — callers and tests match on
  // it — so human detail goes in the log line only, never in the value.
  const skip = (reason: string, detail = ''): NvidiaSkipped => {
    console.warn(
      `[llm-router] nvidia skipped for ${opts.callerFn}: ${reason}${detail ? ` ${detail}` : ''}`,
    )
    return { served: false, reason }
  }

  if (Deno.env.get('NVIDIA_DISABLED') === '1') return skip('disabled')
  if (excludedCallers().has(opts.callerFn)) return skip('caller_excluded')

  // Vision / embedding models resolve to null — NVIDIA must not serve those.
  const model = mapToNvidiaModel(req.model)
  if (!model) return skip('model_unsupported', `(${req.model})`)

  if (!(await breakerAllows(NVIDIA_BREAKER))) return skip('circuit_open')

  const slot = await acquireSlot(NVIDIA_RATE_KEY, {
    waitMs: resolveWaitMs(opts),
    deadlineAt: opts.deadlineAt ?? invocationDeadlineAt ?? undefined,
  })
  if (!slot.granted) {
    return skip(
      slot.degraded ? 'rate_rpc_unavailable' : 'no_slot',
      `(waited ${slot.waitedMs}ms)`,
    )
  }

  // `response_format` is deliberately NOT sent, even though NVIDIA supports
  // json_object properly where Cloudflare hangs on it. Every prompt in
  // ai-enrichment.ts already demands bare JSON and every parser is defensive
  // three-stage, so sending it here would make the two providers produce
  // subtly different output for the same call — a divergence that only shows up
  // as parse failures on one path.
  const body = {
    model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
  }

  // One retry, for transient upstream failures only. More than that and a
  // struggling provider costs more wall clock than simply using the fallback,
  // which is sitting right there and works.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), PER_CALL_TIMEOUT_MS)
    let response: Response

    try {
      response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      })
    } catch (e) {
      clearTimeout(timer)
      const aborted = (e as Error).name === 'AbortError'
      const msg = aborted ? `timeout after ${PER_CALL_TIMEOUT_MS}ms` : (e as Error).message
      // A timed-out call almost never succeeds on retry — surface it and let
      // Cloudflare serve rather than stacking another 45s.
      if (aborted || attempt === 1) {
        await breakerFailure(NVIDIA_BREAKER, `network: ${msg}`)
        return { served: false, reason: aborted ? 'timeout' : 'network_error' }
      }
      continue
    }
    clearTimeout(timer)

    if (response.ok) {
      const data = (await response.json().catch(() => null)) as CompletionBody | null
      const content = asContentString(data?.choices?.[0]?.message?.content)
      if (!content.trim()) {
        // An empty 200 is a failure, and one the breaker should see: it is how
        // a degraded model presents, and it is indistinguishable from success
        // to anything that only checks the status.
        await breakerFailure(NVIDIA_BREAKER, 'empty content on 200')
        return { served: false, reason: 'empty_content' }
      }
      await breakerSuccess(NVIDIA_BREAKER)
      return {
        served: true,
        content,
        usage: data?.usage,
        model: data?.model ?? model,
      }
    }

    const errText = (await response.text().catch(() => '')).slice(0, 300)
    const kind = classify(response.status)

    if (kind === 'rate_limited') {
      // Not a breaker failure — see the FailureKind note. Our bucket is meant to
      // make this unreachable, so reaching it means llm_provider_rate.rpm_cap is
      // set too high for what the account actually allows.
      // THE BODY IS THE WHOLE POINT and it used to be discarded. NVIDIA does not
      // document the status it returns when free credits run out, so a provider
      // signalling exhaustion as 429 is indistinguishable from one saying "slow
      // down" — except in the body. Because this arm deliberately does NOT record
      // a breaker failure, `api_circuit_breakers.last_error` never receives it
      // either, so without this line there is no surface anywhere carrying the
      // reason. Measured 2026-08-29: the fallback served every call through a
      // silent branch and nothing in the system could say why.
      console.warn(
        `[llm-router] nvidia 429 for ${opts.callerFn} ` +
          `(retry-after=${response.headers.get('retry-after') ?? 'none'}): ${errText}`,
      )
      return { served: false, reason: 'rate_limited' }
    }

    if (kind === 'transient' && attempt === 0) {
      await new Promise((r) => setTimeout(r, 300))
      continue
    }

    await breakerFailure(NVIDIA_BREAKER, `${response.status}: ${errText}`)
    return { served: false, reason: kind }
  }

  return { served: false, reason: 'exhausted_attempts' }
}
