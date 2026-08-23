/**
 * Per-history-entry scroll offsets, so Back returns the reader to the place
 * they left rather than to the top of a list they had already scrolled through.
 *
 * sessionStorage, not a module-level Map alone: react-router keys history
 * entries in `history.state`, which the browser preserves across a reload, so
 * a reload followed by Back can still land correctly. The Map is the hot path
 * and the store is written through it.
 *
 * Every storage access is wrapped — sessionStorage throws outright in Safari's
 * private mode and in some embedded webviews, and losing a scroll offset must
 * never take the app down with it.
 */

const STORAGE_KEY = 'qg:scroll-positions';
/** Bounded so a long session cannot grow the entry without limit. */
const MAX_ENTRIES = 50;

let cache: Map<string, number> | null = null;

function load(): Map<string, number> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) {
        if (typeof v === 'number' && Number.isFinite(v)) cache.set(k, v);
      }
    }
  } catch {
    // Unreadable or unparseable: start empty rather than throw.
  }
  return cache;
}

function persist(map: Map<string, number>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // Quota or a blocked store — the in-memory Map still serves this session.
  }
}

export function getScrollPosition(key: string): number | undefined {
  return load().get(key);
}

export function setScrollPosition(key: string, top: number): void {
  const map = load();
  // Re-insert so Map iteration order is least-recently-written first, which
  // is what makes the eviction below drop the oldest entry.
  map.delete(key);
  map.set(key, Math.max(0, Math.round(top)));
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
  persist(map);
}

/** Test seam. */
export function resetScrollPositions(): void {
  cache = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
