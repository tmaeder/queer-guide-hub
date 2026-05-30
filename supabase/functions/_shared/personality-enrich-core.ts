// Pure helpers for the personality refresh loop. No I/O here — fetch lives in index.ts.

type Rec = Record<string, unknown>

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** Returns only the keys whose existing value is blank AND incoming value is non-blank. Never clobbers. */
export function fillBlanks(existing: Rec, incoming: Rec): Rec {
  const out: Rec = {}
  for (const [k, v] of Object.entries(incoming)) {
    if (isBlank(v)) continue
    if (isBlank(existing[k])) out[k] = v
  }
  return out
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso), b = Date.parse(bIso)
  return Math.floor((b - a) / 86_400_000)
}

/** Refresh cadence: living people often, recently-deceased very often (catch obituary updates), rest yearly. */
export function refreshTtlDays(r: Rec, nowIso = new Date().toISOString()): number {
  if (r.is_living === true) return 90
  const dd = typeof r.death_date === 'string' ? r.death_date : null
  if (dd) {
    const age = daysBetween(dd, nowIso)
    if (age >= 0 && age <= 90) return 7
  }
  return 365
}

export function isStale(r: Rec, nowIso = new Date().toISOString()): boolean {
  const last = typeof r.last_refreshed_at === 'string' ? r.last_refreshed_at : null
  if (!last) return true
  return daysBetween(last, nowIso) >= refreshTtlDays(r, nowIso)
}

export interface WikiSummary { extract: string | null; image_url: string | null; source_url: string | null }

/** Parses a Wikipedia REST /page/summary response. Rejects disambiguation pages. */
export function parseWikipediaSummary(json: Rec): WikiSummary {
  const blank: WikiSummary = { extract: null, image_url: null, source_url: null }
  if (json?.type === 'disambiguation') return blank
  const extract = typeof json?.extract === 'string' && json.extract.trim() ? json.extract.trim() : null
  const thumb = (json?.thumbnail as Rec | undefined)?.source
  const image_url = typeof thumb === 'string' ? thumb : null
  const page = ((json?.content_urls as Rec | undefined)?.desktop as Rec | undefined)?.page
  const source_url = typeof page === 'string' ? page : null
  return { extract, image_url, source_url }
}
