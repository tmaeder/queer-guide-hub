// ============================================================
// Event prefilter — cheap LGBTQ+ relevance gate at the SOURCE
// ============================================================
//
// Broad-net source APIs (Ticketmaster keyword search above all) return
// mostly-irrelevant events that then ride the full pipeline — staging →
// normalize → validate → dedup → LLM enrich — before the review-gate's LLM
// verdict finally discards them (measured: 10,605 Ticketmaster rows/30d,
// 13 committed). This module drops the obvious misses BEFORE writeToStaging,
// where an event has cost nothing yet.
//
// Recall-first by design: the keyword list is conservative and the downstream
// LLM relevance gate still runs, so a false KEEP costs one pipeline pass while
// a false DROP loses a real event. Matching is word-boundary-aware (so 'gay'
// does not match 'Gaylord') and separator-tolerant (so 'same-sex' matches
// 'same sex' and 'nonbinary' matches 'non-binary').

/** Conservative, non-sexualized keyword list. Module-level export so tests pin
 *  it and every source shares one definition; override per call via
 *  opts.keywords (request body `prefilter_keywords`). */
export const DEFAULT_EVENT_PREFILTER_KEYWORDS: readonly string[] = [
  'pride',
  'lgbtq+',
  'lgbtq',
  'lgbt',
  'queer',
  'gay',
  'lesbian',
  'trans night',
  'transgender',
  'bisexual',
  'nonbinary',
  'drag',
  'rainbow family',
  'same-sex',
]

/** Structural subset of source-adapter's RawItem — kept import-free so this
 *  module (and its tests) stay dependency-free and network-free. */
export interface PrefilterItem {
  sourceId: string
  data: Record<string, unknown>
}

export interface PrefilterOpts {
  /** Keyword override; omitted or empty → DEFAULT_EVENT_PREFILTER_KEYWORDS. */
  keywords?: string[]
  /** Extracts the searchable field values from one raw source payload.
   *  Non-string values are ignored. */
  fields: (data: Record<string, unknown>) => unknown[]
}

export interface PrefilterResult<T> {
  kept: T[]
  fetched: number
  dropped: number
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One pattern per keyword: word-ish boundaries on both ends (a keyword may
 *  not sit inside a longer alphanumeric run), and the keyword's own
 *  space/hyphen separators match any — or no — space/hyphen run in the text
 *  ('trans night' ≈ 'Trans-Night' ≈ 'TransNight'). */
function compileKeyword(keyword: string): RegExp {
  const parts = keyword.toLowerCase().split(/[\s-]+/).filter(Boolean).map(escapeRegExp)
  return new RegExp(`(?<![a-z0-9])${parts.join('[\\s-]*')}(?![a-z0-9])`, 'i')
}

/**
 * Keep an item when ANY keyword matches ANY of its extracted text fields.
 * Items whose fields yield no text at all are dropped (nothing to match).
 * The dehyphenated second pass lets single-token keywords match hyphenated
 * spellings ('nonbinary' vs "Non-Binary Art Night").
 */
export function prefilterEvents<T extends PrefilterItem>(
  items: T[],
  opts: PrefilterOpts,
): PrefilterResult<T> {
  const keywords =
    opts.keywords && opts.keywords.length > 0
      ? opts.keywords
      : DEFAULT_EVENT_PREFILTER_KEYWORDS
  const patterns = keywords.map(compileKeyword)

  const kept = items.filter((item) => {
    const haystack = opts.fields(item.data)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' \n ')
    if (!haystack) return false
    const dehyphenated = haystack.replace(/-/g, '')
    return patterns.some((p) => p.test(haystack) || p.test(dehyphenated))
  })

  return { kept, fetched: items.length, dropped: items.length - kept.length }
}

/** Ticketmaster Discovery raw event → name / description(+info/pleaseNote) /
 *  classification segment/genre/subGenre names / promoter name(s). */
export function ticketmasterPrefilterFields(d: Record<string, unknown>): unknown[] {
  const cls = Array.isArray(d.classifications)
    ? (d.classifications as Array<Record<string, unknown>>)
    : []
  const promoters = Array.isArray(d.promoters)
    ? (d.promoters as Array<Record<string, unknown>>)
    : []
  return [
    d.name,
    d.info,
    d.pleaseNote,
    d.description,
    ...cls.flatMap((c) => [
      (c?.segment as Record<string, unknown> | undefined)?.name,
      (c?.genre as Record<string, unknown> | undefined)?.name,
      (c?.subGenre as Record<string, unknown> | undefined)?.name,
    ]),
    (d.promoter as Record<string, unknown> | undefined)?.name,
    ...promoters.map((p) => p?.name),
  ]
}

/** Eventbrite v3 raw event → name/description (nested under .text) + summary. */
export function eventbritePrefilterFields(d: Record<string, unknown>): unknown[] {
  const nested = (v: unknown): unknown =>
    v && typeof v === 'object' ? (v as Record<string, unknown>).text : v
  return [nested(d.name), nested(d.description), d.summary]
}
