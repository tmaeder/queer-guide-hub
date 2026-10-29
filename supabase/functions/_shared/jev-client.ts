/** Server-only typed decisions. Every actual HTTP attempt needs a durable reservation. */
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODEL = 'jev-1.14.0'
// Normal-context documented ceiling. Long-context/image flags are never sent.
export const JEV_MAX_INPUT_TOKENS = 65_536
// $42 / billion input tokens. Nano-USD avoids floating-point currency accounting.
export const JEV_NANO_USD_PER_INPUT_TOKEN = 42
export const JEV_MAX_RESERVATION = JEV_MAX_INPUT_TOKENS * JEV_NANO_USD_PER_INPUT_TOKEN

export class JevProviderError extends Error {
  constructor(readonly status: number) { super(`Jev HTTP ${status}`) }
}
export class JevBudgetError extends Error {}
export class JevBudgetDeferred extends JevBudgetError {}
export interface JevRequest {
  model: string
  state: unknown
  questions: Record<string, unknown>
}
export interface JevUsage { input_tokens: number; output_tokens: number }
export interface JevResponse {
  model: string
  answers: Record<string, unknown>
  usage: JevUsage
}
export interface JevBudget {
  reserve(input: { requestId: string; caller: string; requestHash: string }): Promise<boolean>
  /** Null usage conservatively charges the full reservation, including failed HTTP attempts. */
  settle(requestId: string, inputTokens: number | null): Promise<void>
}
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export function createJevBudget(db: RpcClient, account: string): JevBudget {
  if (!account.trim()) throw new JevBudgetError('JEV_BUDGET_ACCOUNT is not configured')
  return {
    async reserve({ requestId, caller, requestHash }) {
      const { data, error } = await db.rpc('reserve_jev_budget', {
        p_account: account, p_request_id: requestId, p_caller: caller, p_request_hash: requestHash,
      })
      if (error || typeof data !== 'boolean') throw new JevBudgetError('Jev budget reservation unavailable')
      return data
    },
    async settle(requestId, inputTokens) {
      const { data, error } = await db.rpc('settle_jev_budget', {
        p_account: account, p_request_id: requestId, p_input_tokens: inputTokens,
      })
      if (error || data !== true) throw new JevBudgetError('Jev budget settlement unavailable; reservation retained')
    },
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Jev object')
  return value as Record<string, unknown>
}
function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid Jev probability')
  return value
}

/** Validate against the actual questions, before a consumer can interpret any answer. */
export function readJevResponse(raw: unknown, request: JevRequest): JevResponse {
  const value = object(raw), answers = object(value.answers), usage = object(value.usage)
  if (value.model !== request.model) throw new Error('Unexpected Jev model')
  for (const name of ['input_tokens', 'output_tokens']) {
    if (!Number.isSafeInteger(usage[name]) || Number(usage[name]) < 0) throw new Error('Invalid Jev usage')
  }
  if (Number(usage.input_tokens) > JEV_MAX_INPUT_TOKENS) throw new Error('Jev usage exceeds reserved context')
  if (Object.keys(answers).length !== Object.keys(request.questions).length) throw new Error('Unexpected Jev answers')
  for (const [name, rawQuestion] of Object.entries(request.questions)) {
    const question = object(rawQuestion), answer = object(answers[name])
    if (answer.type !== question.type) throw new Error(`Invalid Jev answer type: ${name}`)
    if (question.type === 'noul') { probability(answer.noul); continue }
    if (question.type !== 'choice') throw new Error('Unsupported Jev question type')
    const options = Object.keys(object(question.criteria)), distribution = object(answer.probabilities)
    if (typeof answer.choice !== 'string' || !options.includes(answer.choice) || Object.keys(distribution).length !== options.length) throw new Error('Invalid Jev choice')
    probability(answer.confidence)
    const probabilities = options.map(key => probability(distribution[key]))
    // TypeSafe rounds probabilities to two decimals. Do not renormalize/promote them.
    if (Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > options.length * 0.005 + 0.000001 ||
      probabilities.some(p => p > Number(distribution[answer.choice as string]) + 0.000001)) throw new Error('Inconsistent Jev distribution')
  }
  return { model: value.model as string, answers, usage: { input_tokens: Number(usage.input_tokens), output_tokens: Number(usage.output_tokens) } }
}

export async function callJev(request: JevRequest, options: {
  apiKey: string
  caller: string
  budget: JevBudget
  fetcher?: typeof fetch
}): Promise<JevResponse> {
  if (!options.apiKey.trim()) throw new Error('Jev API key is not configured')
  if (request.model !== JEV_MODEL) throw new Error('Jev model has no approved price/context contract')
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(options.caller)) throw new Error('Invalid Jev caller')
  // Copy only supported top-level fields; callers cannot inject assets, headers or endpoints.
  const body = JSON.stringify({ model: request.model, state: request.state, questions: request.questions })
  // Snapshot the serialized request: a caller mutating its object during an await
  // cannot change the schema we validate or the evidence associated with this call.
  const payload: JevRequest = JSON.parse(body)
  if (new TextEncoder().encode(body).byteLength > 196_608) throw new Error('Jev request exceeds 192 KiB')
  const questionEntries = Object.values(object(payload.questions))
  if (!questionEntries.length || questionEntries.length > 128) throw new Error('Invalid Jev question count')
  for (const raw of questionEntries) {
    const question = object(raw)
    if (!['choice', 'noul'].includes(String(question.type)) || typeof question.instructions !== 'string' || !question.instructions.trim()) throw new Error('Invalid Jev question')
    if (question.type === 'choice' && !Object.keys(object(question.criteria)).length) throw new Error('Empty Jev choice')
  }
  const requestId = crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const requestHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (!await options.budget.reserve({ requestId, caller: options.caller, requestHash })) throw new JevBudgetDeferred('Jev budget deferred')
  let inputTokens: number | null = null
  try {
    const response = await (options.fetcher ?? fetch)(JEV_ENDPOINT, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) { await response.body?.cancel(); throw new JevProviderError(response.status) }
    if (!response.body) throw new Error('Empty Jev response')
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let text = '', size = 0
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break
        size += part.value.byteLength
        if (size > 262_144) throw new Error('Jev response exceeds 256 KiB')
        text += decoder.decode(part.value, { stream: true })
      }
      text += decoder.decode()
    } finally { await reader.cancel().catch(() => {}) }
    const parsed = readJevResponse(JSON.parse(text), payload)
    inputTokens = parsed.usage.input_tokens
    return parsed
  } finally {
    // On settlement failure no answer escapes; its full reservation remains counted.
    await options.budget.settle(requestId, inputTokens)
  }
}
