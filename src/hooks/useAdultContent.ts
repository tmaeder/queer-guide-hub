import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'qg.marketplace.ageAck';
// Categories that gate without needing any per-listing flag — useful for the
// category-page route where listings haven't loaded yet. Mirrors the adult /
// explicit department bases in marketplace_content_rating() plus the two
// adult browse umbrellas (department column).
const ADULT_CATEGORY_SLUGS = new Set([
  // fine subcategory slugs (explicit/adult rating base)
  'fetish_gear',
  'fetish_wear',
  'sex_toys',
  'anal_toys',
  'cock_rings_and_stretchers',
  'pumps_and_enlargement',
  'chastity',
  'bdsm_and_bondage',
  'pup_and_pet_play',
  'lubricant',
  'bdsm',
  'adult_toys',
  // department umbrellas
  'intimacy',
  'bdsm_fetish',
]);

export function isAdultListing(
  listing: { sensitivity_flags?: unknown; content_rating?: unknown } | null | undefined,
): boolean {
  if (!listing) return false;
  // content_rating is the canonical signal (migration 20260608210000). It's a
  // STORED generated column, correct on every row; sensitivity_flags is the
  // under-populated legacy fallback kept only for pre-migration cached data.
  const rating = listing.content_rating;
  if (typeof rating === 'string') return rating === 'adult' || rating === 'explicit';
  const flags = listing.sensitivity_flags;
  if (Array.isArray(flags)) return flags.includes('adult');
  if (flags && typeof flags === 'object') {
    // Some rows have been seen as `{ "0": "adult" }` from older imports.
    return Object.values(flags as Record<string, unknown>).includes('adult');
  }
  return false;
}

export function isAdultCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return ADULT_CATEGORY_SLUGS.has(slug.toLowerCase().replace(/[\s-]+/g, '_'));
}

// Storage events only fire in OTHER tabs/windows, never the tab that made the
// change — so two same-tab instances of this hook (e.g. AdultContentGate
// calling acknowledge() and a sibling component reading `acknowledged`) never
// see each other's update without this same-tab broadcast, leaving the
// sibling stuck showing stale (SFW-only) data until a full reload.
const SAME_TAB_EVENT = 'qg:adult-ack-changed';

/**
 * Returns whether the visitor has confirmed they are 18+ for this device.
 * `acknowledge` flips it on; `reset` (test-only) clears it.
 */
export function useAdultAcknowledgement() {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setAcknowledged(!!localStorage.getItem(STORAGE_KEY));
    // Cross-tab (storage event) and same-tab (custom event) sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAME_TAB_EVENT, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SAME_TAB_EVENT, sync);
    };
  }, []);

  const acknowledge = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setAcknowledged(true);
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  }, []);

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    setAcknowledged(false);
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  }, []);

  return { acknowledged, acknowledge, reset };
}
