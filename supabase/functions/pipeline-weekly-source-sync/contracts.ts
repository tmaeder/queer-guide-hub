export const WEEKLY_PIPELINE = 'weekly-data-source-sync'
export const REGISTRIES = ['scrape_sources', 'ingestion_sources', 'news_sources'] as const
export type Registry = typeof REGISTRIES[number]
export type Outcome = 'succeeded' | 'skipped' | 'blocked' | 'failed'
export interface SourceResult {
  outcome: Outcome
  reason?: string
  required_settings?: string[]
  fetched: number
  staged: number
  skipped: number
  failed: number
  retryable: boolean
  waiting?: boolean
  child_run_id?: string
  child_pipeline?: string
}
export interface SourceJob {
  id: string
  run_id: string
  registry: Registry
  source_id: string
  source_name: string
  source_slug: string | null
  attempts: number
  child_run_id?: string | null
  child_pipeline?: string | null
}

export function result(outcome: Outcome, reason?: string): SourceResult {
  return { outcome, ...(reason ? { reason } : {}), fetched: 0, staged: 0, skipped: 0, failed: 0, retryable: false }
}

/** Keep endpoint selection on this project's function host and in the import surface. */
export function allowedAdapter(name: string): boolean {
  return /^source-[a-z0-9-]{1,70}$/.test(name) ||
    ['scrape-web-sources', 'import-ilga-data', 'get-wikipedia-info', 'get-pexels-images'].includes(name)
}

export function adapterName(source: { slug?: string; edge_function?: string | null }): string | null {
  // Registry entries predate the native staging adapters. Prefer their current
  // equivalent, without enabling retired source registrations.
  if (source.slug === 'rest-countries') return 'source-rest-countries'
  if (source.slug === 'foursquare' || source.slug === 'foursquare-os') return 'source-foursquare-free'
  const name = source.edge_function ?? ''
  return allowedAdapter(name) ? name : null
}

export function requiredSetting(value: unknown): string | null {
  // The legacy column contains both names and literal "true"/"false" strings.
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,79}$/.test(value) ? value : null
}

export function secretValues(config: unknown, depth = 0): string[] {
  if (!config || typeof config !== 'object' || depth > 5) return []
  return Object.entries(config).flatMap(([key, value]) =>
    /(?:secret|token|password|api.?key|authorization)/i.test(key) && typeof value === 'string' && value.length >= 4
      ? [value]
      : typeof value === 'object' ? secretValues(value, depth + 1) : [],
  ).slice(0, 100)
}

export function safeError(message: unknown, secrets: string[] = []): string {
  let text = typeof message === 'string' ? message : 'Source adapter failed'
  for (const secret of secrets) if (secret.length >= 4) text = text.split(secret).join('[redacted]')
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, '[provider URL]')
    .replace(/Bearer\s+[^\s,"']+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, '[redacted]')
    .split('').map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('')
    .slice(0, 500)
}

function count(...values: unknown[]): number {
  for (const value of values) if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return Math.min(value, 2147483647)
  return 0
}

/** Legacy scrapers may return a failed per-source result inside HTTP 200. */
export function adapterResult(status: number, value: unknown, secrets: string[] = []): SourceResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...result('failed', `Adapter returned an invalid response (HTTP ${status})`), retryable: status >= 500 }
  }
  const body = value as Record<string, unknown>
  const missing = Array.isArray(body.missing_credentials)
    ? body.missing_credentials.map(requiredSetting).filter((name): name is string => name !== null) : []
  if (missing.length) return { ...result('blocked', safeError(body.reason ?? 'Required source credentials are unavailable', secrets)), required_settings: missing }
  if (body.skipped === true) return result('skipped', safeError(body.reason ?? 'Source adapter skipped this import', secrets))
  const rows = Array.isArray(body.results) ? body.results as Record<string, unknown>[] : []
  const rowError = rows.find(row => typeof row.error === 'string' && row.error)?.error
  const fetched = count(body.items_total, body.total_items_found, body.items_found, body.fetched,
    rows.length ? rows.reduce((sum, row) => sum + count(row.items_found), 0) : undefined,
    body.items, body.imported, body.countries_imported)
  const staged = body.dry_run === true ? 0 : count(body.items_succeeded, body.items_processed, body.total_items_staged, body.items_staged,
    body.items, body.imported, body.countries_imported)
  const skipped = count(body.items_skipped)
  const failed = count(body.items_failed, body.total_items_failed,
    rows.length ? rows.reduce((sum, row) => sum + count(row.items_failed), 0) : undefined)
  const incomplete = body.has_more === true || body.continuation_pending === true || Number(body.cities_unknown ?? 0) > 0
  const error = typeof body.error === 'string' ? body.error : rowError ??
    (incomplete ? 'Source import is incomplete; configure its durable source pipeline' : undefined)
  const bad = status < 200 || status >= 300 || body.success === false || Boolean(error) || failed > 0
  return {
    outcome: bad ? 'failed' : 'succeeded', fetched, staged, skipped, failed,
    ...(bad ? { reason: safeError(error ?? `Adapter failed (HTTP ${status})`, secrets) }
      : typeof body.reason === 'string' ? { reason: safeError(body.reason, secrets) } : {}),
    retryable: bad && (status === 408 || status === 429 || status >= 500 || failed > 0),
  }
}

export function batchSize(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(1, Math.min(500, Math.floor(n))) : 50
}
