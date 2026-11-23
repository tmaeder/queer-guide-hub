/**
 * The one transport to Firecrawl Cloud: endpoint, auth header and response shape.
 *
 * Callers keep their own reading limits, retries, pacing and error codes —
 * those differ on purpose (GayOut maps 402/429 to sync errors, the weekly
 * importer paces against the per-minute plan limit, redirect previews cap
 * user-submitted destinations at 512 KB). Only what was copied four times
 * lives here.
 */
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev'

export interface FirecrawlScrapeBody {
  url: string
  formats: Array<'rawHtml' | 'markdown'>
  onlyMainContent?: boolean
  /** Server-side page timeout in ms. */
  timeout?: number
  /** Accept a cached copy up to this age in ms. */
  maxAge?: number
  proxy?: 'basic' | 'stealth' | 'auto'
  parsers?: string[]
}

export interface FirecrawlScrapeInit {
  signal?: AbortSignal
  version?: 'v1' | 'v2'
  redirect?: RequestRedirect
  fetcher?: typeof fetch
}

export function firecrawlScrape(apiKey: string, body: FirecrawlScrapeBody, init: FirecrawlScrapeInit = {}): Promise<Response> {
  return (init.fetcher ?? fetch)(`${FIRECRAWL_API_URL}/${init.version ?? 'v2'}/scrape`, {
    method: 'POST',
    signal: init.signal,
    redirect: init.redirect,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export interface FirecrawlPage {
  success: boolean
  rawHtml?: string
  markdown?: string
  statusCode?: number
  url?: string
  metadata: Record<string, unknown>
}

/** Normalise a v1/v2 scrape response body (v1 used `html`, some plans omit `data`). */
export function firecrawlPage(json: unknown): FirecrawlPage {
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
  const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    success: root.success !== false,
    rawHtml: text(data.rawHtml) ?? text(data.html),
    markdown: text(data.markdown),
    statusCode: typeof metadata.statusCode === 'number' ? metadata.statusCode : undefined,
    url: text(metadata.url) ?? text(metadata.sourceURL),
    metadata,
  }
}

export interface FirecrawlCreditUsage {
  remainingCredits: number
  planCredits: number | null
  billingPeriodStart: string | null
  billingPeriodEnd: string | null
}

/** GET /v2/team/credit-usage for the account the key belongs to. Throws on any failure. */
export async function firecrawlCreditUsage(apiKey: string, init: { signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<FirecrawlCreditUsage> {
  const response = await (init.fetcher ?? fetch)(`${FIRECRAWL_API_URL}/v2/team/credit-usage`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: init.signal ?? AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Firecrawl credit usage HTTP ${response.status}`)
  }
  const body = await response.json() as { data?: Record<string, unknown> }
  const d = body?.data ?? {}
  if (typeof d.remainingCredits !== 'number') throw new Error('Firecrawl credit usage returned no remainingCredits')
  const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)
  return {
    remainingCredits: d.remainingCredits,
    planCredits: typeof d.planCredits === 'number' ? d.planCredits : null,
    billingPeriodStart: date(d.billingPeriodStart),
    billingPeriodEnd: date(d.billingPeriodEnd),
  }
}
