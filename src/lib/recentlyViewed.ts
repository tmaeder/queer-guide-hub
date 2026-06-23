/**
 * Lightweight client-side "recently viewed" history.
 *
 * Records the entities a visitor opens (venue, city, event, …) in
 * localStorage so the homepage can show a "Pick up where you left off" rail.
 * This is distinct from useRecentVenues (recently *added* to the DB) — this is
 * per-device viewing history. No server round-trip, no PII beyond what the user
 * already navigated to.
 */

import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

export type RecentlyViewedType =
  | 'venue'
  | 'event'
  | 'city'
  | 'country'
  | 'personality'
  | 'hotel'
  | 'marketplace'
  | 'queer_village'
  | 'organization';

export interface RecentlyViewedItem {
  type: RecentlyViewedType;
  slug: string;
  title: string;
  image?: string;
  city?: string;
  country?: string;
  ts: number;
}

const STORAGE_KEY = 'qg_recently_viewed';
const MAX_ITEMS = 12;
/** Same-tab change notification (the native `storage` event only fires cross-tab). */
export const RECENTLY_VIEWED_EVENT = 'qg:recently-viewed';

/** Route base per type — mirrors TrendingStrip's TYPE_PATH. */
const TYPE_PATH: Record<RecentlyViewedType, string> = {
  venue: '/venues',
  event: '/events',
  city: '/city',
  country: '/country',
  personality: '/personalities',
  hotel: '/hotels',
  marketplace: '/marketplace',
  queer_village: '/villages',
  organization: '/organizations',
};

export function recentlyViewedHref(item: RecentlyViewedItem): string {
  return `${TYPE_PATH[item.type]}/${item.slug}`;
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (it): it is RecentlyViewedItem =>
          it &&
          typeof it.slug === 'string' &&
          typeof it.title === 'string' &&
          typeof it.type === 'string' &&
          it.type in TYPE_PATH,
      )
      // Drop a present-but-invalid stored image (legacy non-https/corrupt/empty
      // entries written before image guards existed) so the rail renders its
      // deterministic fallback instead of a broken-image icon.
      .map((it) =>
        typeof it.image === 'string' && !isValidImageUrl(it.image)
          ? { ...it, image: undefined }
          : it,
      );
  } catch {
    return [];
  }
}

/**
 * Record a viewed entity. Most-recent-first, deduped by `${type}:${slug}`,
 * capped at MAX_ITEMS. Silently no-ops without slug/title or storage.
 */
export function trackRecentlyViewed(
  item: Omit<RecentlyViewedItem, 'ts'> & { ts?: number },
): void {
  if (!hasStorage()) return;
  if (!item.slug || !item.title || !(item.type in TYPE_PATH)) return;
  const entry: RecentlyViewedItem = {
    type: item.type,
    slug: item.slug,
    title: item.title,
    image: item.image,
    city: item.city,
    country: item.country,
    ts: item.ts ?? Date.now(),
  };
  try {
    const key = `${entry.type}:${entry.slug}`;
    const next = [
      entry,
      ...getRecentlyViewed().filter((it) => `${it.type}:${it.slug}` !== key),
    ].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_EVENT));
  } catch {
    /* quota / serialization failure — viewing history is non-critical */
  }
}

export function clearRecentlyViewed(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_EVENT));
  } catch {
    /* ignore */
  }
}
