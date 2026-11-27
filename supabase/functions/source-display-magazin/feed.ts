import type { RawItem } from '../_shared/source-adapter.ts'

export const DISPLAY_FEED = 'https://www.display-magazin.ch/wp-content/uploads/dspev-feed/events.json'
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const publisherHosts = new Set(['www.display-magazin.ch', 'display-magazin.ch'])

function hasAuthorityCredentials(url: URL): boolean {
  return [url.username, url.password, url.port].some(value => value.length > 0)
}

function date(value: unknown): string | null {
  const s = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const parsed = new Date(s + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s ? s : null
}

/** Exact publisher feed, with explicit showtimes rather than aggregate ranges. */
export function displayFeedItems(payload: unknown, options: { now: number; daysBack: number; limit: number }): RawItem[] {
  const feed = payload as { generated?: number; events?: unknown[] }
  if (!feed || !Array.isArray(feed.events) || !feed.events.length || feed.events.length > 5000) throw new Error('Display feed has no valid event array')
  if (!Number.isFinite(feed.generated) || feed.generated! * 1000 > options.now + 3600_000 || feed.generated! * 1000 < options.now - 7 * 86400_000) throw new Error('Display feed generation date is stale or invalid')
  const since = new Date(options.now - options.daysBack * 86400_000).toISOString().slice(0, 10)
  const until = new Date(options.now + 730 * 86400_000).toISOString().slice(0, 10)
  const rows: RawItem[] = []
  const seen = new Set<string>()
  function add(sourceId: string, event: Record<string, unknown>) {
    if (seen.has(sourceId) || rows.length >= options.limit) return
    const start = date(text(event.start_date).slice(0, 10))
    const end = date(text(event.end_date).slice(0, 10)) ?? start
    if (!start || !end || start > until || end < since || end < start) return
    const venue = event.venue as Record<string, unknown> | null
    // The feed also contains calendar observances with no published location.
    // These cannot satisfy the event validator; do not re-stage them daily.
    if (!venue || ![venue.city, venue.address, venue.country].some(value => text(value))) return
    seen.add(sourceId)
    rows.push({ sourceId, data: { ...event, source_feed: DISPLAY_FEED } })
  }
  for (const value of feed.events) {
    if (rows.length >= options.limit) break
    if (!value || typeof value !== 'object') continue
    const event = value as Record<string, unknown>
    if (!Number.isInteger(event.id) || Number(event.id) <= 0 || !text(event.title)) continue
    try {
      const url = new URL(text(event.url))
      if (url.protocol !== 'https:' || hasAuthorityCredentials(url) || !publisherHosts.has(url.hostname) || !url.pathname.startsWith('/events/')) continue
    } catch { continue }
    if (Array.isArray(event.sessions) && event.sessions.length) {
      for (const value of event.sessions) {
        if (!value || typeof value !== 'object') continue
        const session = value as Record<string, unknown>
        const day = date(session.date)
        const start = text(session.start)
        if (!day || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)) continue
        const city = text(session.city)
        const venue = text(session.venue)
        const identity = JSON.stringify([event.id, day, start, city, venue, text(session.address)])
        add(`session:${identity}`, {
          ...event, start_date: `${day} ${start}:00`, end_date: null, all_day: false,
          venue: { venue, city, address: text(session.address) },
          tickets: text(session.tickets), cost: session.price,
          source_session: { date: day, start, city, venue },
        })
      }
    } else add(String(event.id), event)
  }
  if (!rows.length) throw new Error('Display feed has no valid occurrences in the import window')
  return rows
}

export async function fetchDisplayFeed(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(DISPLAY_FEED, { signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide)' } })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Display public feed HTTP ${response.status}`) }
  if (!response.body) throw new Error('Display public feed has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) throw new Error('Display public feed exceeds byte budget')
      chunks.push(value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}
