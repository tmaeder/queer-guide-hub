// The festival / series an event belongs to, read off schema.org JSON-LD.
//
// Recorded as `metadata.parent_ref` on the normalized item, which
// commit_event_staging_item persists verbatim into
// `event_sources.payload -> 'normalized' -> 'metadata' -> 'parent_ref'`.
// It is a REFERENCE, not a link: the programme linker resolves it later (url
// match first, then name within the date window). Nothing here decides
// whether the parent exists.
//
// Mirrored for the browser/worker runtimes in client-sdk/parent-ref.ts; the
// parity test in jsonld-parent-ref.test.ts runs both on the same inputs.

export interface ParentRef {
  name: string | null
  url: string | null
  /** schema.org @type of the parent when stated (Festival vs EventSeries). */
  type: string | null
}

const EVENT_LIKE = /Event$|^Festival$|^EventSeries$/

const httpUrl = (v: unknown): string | null =>
  typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null

const typeOf = (o: Record<string, unknown>): string | null => {
  const t = o['@type']
  const first = Array.isArray(t) ? t.find((x) => typeof x === 'string') : t
  return typeof first === 'string' ? first : null
}

export const isEventLike = (o: unknown): boolean => {
  if (!o || typeof o !== 'object') return false
  const t = (o as Record<string, unknown>)['@type']
  return (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && EVENT_LIKE.test(x))
}

/** A superEvent value (object, array, or bare URL string) -> ref, or null. */
export function toParentRef(v: unknown, decode: (s: string) => string = (s) => s): ParentRef | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = toParentRef(x, decode)
      if (r) return r
    }
    return null
  }
  if (typeof v === 'string') {
    const url = httpUrl(v)
    return url ? { name: null, url, type: null } : null
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const name = typeof o.name === 'string' ? decode(o.name).trim() || null : null
  const url = httpUrl(o.url) ?? httpUrl(o['@id'])
  return name || url ? { name, url, type: typeOf(o) } : null
}

/**
 * `node.superEvent` wins; otherwise the event-like container it was flattened
 * out of (EventSeries.subEvent, Festival.subEvent/hasPart). A ref pointing at
 * the event itself (same url) is not a parent.
 */
export function parentRefOf(
  node: Record<string, unknown>,
  enclosing?: unknown,
  decode?: (s: string) => string,
): ParentRef | null {
  const ref = toParentRef(node.superEvent, decode) ??
    (isEventLike(enclosing) ? toParentRef(enclosing, decode) : null)
  if (!ref) return null
  const own = httpUrl(node.url) ?? httpUrl(node['@id'])
  return ref.url && own && ref.url === own ? null : ref
}
