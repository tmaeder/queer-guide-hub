import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'qg.marketplace.ageAck';
// Categories that gate without needing any per-listing flag — useful for the
// category-page route where listings haven't loaded yet.
const ADULT_CATEGORY_SLUGS = new Set([
  'fetish_gear',
  'sex_toys',
  'lubricant',
  'bdsm',
  'adult_toys',
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

/**
 * Returns whether the visitor has confirmed they are 18+ for this device.
 * `acknowledge` flips it on; `reset` (test-only) clears it.
 */
export function useAdultAcknowledgement() {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(STORAGE_KEY);
  });

  // Pick up changes made in other tabs/windows.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAcknowledged(!!e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const acknowledge = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setAcknowledged(true);
  }, []);

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    setAcknowledged(false);
  }, []);

  return { acknowledged, acknowledge, reset };
}
