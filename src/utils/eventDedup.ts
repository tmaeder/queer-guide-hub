/**
 * Client-side safety net for event de-duplication. Catches near-duplicates
 * the ingestion pipeline missed (language variants, slightly different
 * city spellings, etc.) so users see each event once on /events, the
 * homepage "Upcoming Events" rail, and similar feeds.
 *
 * Canonical key = lower(trim(title)) | startOfDay(start_date) | lower(trim(city ?? '')).
 * Among collisions, prefer:
 *   1. `is_featured = true`
 *   2. earliest `created_at` (oldest record wins, treat newer as the dupe)
 */

type DedupCandidate = {
  id?: string | null;
  title?: string | null;
  start_date?: string | null;
  city?: string | null;
  is_featured?: boolean | null;
  created_at?: string | null;
};

export function canonicalEventKey(e: DedupCandidate): string | null {
  if (!e.title || !e.start_date) return null;
  const title = e.title.trim().toLowerCase();
  if (!title) return null;
  const day = e.start_date.slice(0, 10); // YYYY-MM-DD from ISO 8601
  const city = (e.city ?? '').trim().toLowerCase();
  return `${title}|${day}|${city}`;
}

function preferEvent<T extends DedupCandidate>(a: T, b: T): T {
  // Featured wins.
  if (a.is_featured && !b.is_featured) return a;
  if (b.is_featured && !a.is_featured) return b;
  // Earliest created_at wins (the older record is canonical).
  const aT = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
  const bT = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
  return aT <= bT ? a : b;
}

export function dedupeEvents<T extends DedupCandidate>(events: T[]): T[] {
  const winners = new Map<string, T>();
  const order: string[] = [];
  for (const ev of events) {
    const key = canonicalEventKey(ev);
    if (!key) {
      // Records without a usable key (missing title/date) pass through.
      // Use the id (or a unique sentinel) so they aren't collapsed.
      const fallback = `__nokey__:${ev.id ?? Math.random().toString(36).slice(2)}`;
      winners.set(fallback, ev);
      order.push(fallback);
      continue;
    }
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, ev);
      order.push(key);
    } else {
      winners.set(key, preferEvent(existing, ev));
    }
  }
  return order.map((k) => winners.get(k)!).filter(Boolean);
}
