// MediaWiki API errors normally retain HTTP 200. Treat them as source failures,
// never as missing entities. https://www.mediawiki.org/wiki/API:Errors_and_warnings
// Lagged bots must wait >=5s: https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
export class WikidataReadError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly retryAfterSeconds = 5) {
    super(`wikidata_${code}`)
    this.name = 'WikidataReadError'
  }
}

type Json = Record<string, unknown>
type Options = {
  fetcher?: (url: string, init: RequestInit) => Promise<Response>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  attempts?: number
}
const apiCode = (value: unknown) => typeof value === 'string' && /^[\w-]{1,80}$/.test(value) ? value : 'api_error_unknown'
const transient = (code: string) => ['maxlag', 'ratelimited', 'readonly', 'readonlytext'].includes(code) || code.startsWith('internal_api_error_')
function retryAfter(value: string | null, now: number): number {
  if (!value) return 5
  const numeric = Number(value)
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(value) - now) / 1000
  return Number.isFinite(seconds) ? Math.max(5, Math.ceil(seconds)) : 5
}
function validate(data: unknown, url: URL, wait: number): Json {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new WikidataReadError('payload_invalid')
  const body = data as Json
  const errors = 'error' in body ? [body.error] : Array.isArray(body.errors) ? body.errors : []
  if (errors.length) {
    const codes = errors.map(e => apiCode(e && typeof e === 'object' ? (e as Json).code : null))
    const permanent = codes.find(code => !transient(code))
    throw new WikidataReadError(permanent ?? codes[0], !permanent, wait)
  }
  const action = url.searchParams.get('action')
  if (action === 'wbgetentities') {
    if (!body.entities || typeof body.entities !== 'object' || Array.isArray(body.entities)) throw new WikidataReadError('entities_shape')
    const entities = body.entities as Json
    if ((url.searchParams.get('ids') ?? '').split('|').filter(Boolean).some(id =>
      !entities[id] || typeof entities[id] !== 'object' || Array.isArray(entities[id]))) throw new WikidataReadError('entity_keys_missing')
  }
  if (action === 'wbsearchentities') {
    if (!Array.isArray(body.search)) throw new WikidataReadError('search_shape')
    for (const hit of body.search) {
      if (!hit || typeof hit !== 'object' || typeof hit.id !== 'string' || !/^Q[1-9]\d*$/.test(hit.id)
        || (typeof hit.label !== 'string' && typeof hit.match?.text !== 'string')) throw new WikidataReadError('search_hit_shape')
    }
  }
  return body
}

export async function readWikidataJson(rawUrl: string, userAgent: string, options: Options = {}): Promise<Json> {
  const url = new URL(rawUrl)
  // This worker is a background bot, rather than an interactive user query.
  url.searchParams.set('maxlag', '5')
  const fetcher = options.fetcher ?? fetch
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const attempts = Math.min(3, Math.max(1, options.attempts ?? 3))
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let failure: WikidataReadError
    try {
      const response = await fetcher(url.href, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: controller.signal })
      const wait = retryAfter(response.headers.get('retry-after'), (options.now ?? Date.now)())
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new WikidataReadError(apiCode(response.headers.get('mediawiki-api-error') ?? `http_${response.status}`), response.status === 429 || response.status >= 500, wait)
      }
      let data: unknown
      try { data = await response.json() } catch { throw new WikidataReadError('json_invalid') }
      return validate(data, url, wait)
    } catch (error) {
      failure = error instanceof WikidataReadError ? error : new WikidataReadError('network_unavailable', true)
    } finally { clearTimeout(timer) }
    // A long Retry-After is a deferral, not permission to retry early. Preserve
    // its safe code/deadline for the native receipt and existing circuit breaker.
    if (!failure.retryable || failure.retryAfterSeconds > 5 || attempt + 1 === attempts) throw failure
    await sleep(failure.retryAfterSeconds * 1000)
  }
  throw new WikidataReadError('retry_budget_exhausted')
}
