import { useEffect, useState } from 'react';
import {
  getRecentlyViewed,
  RECENTLY_VIEWED_EVENT,
  type RecentlyViewedItem,
} from '@/lib/recentlyViewed';

/**
 * Reactive reader for the local "recently viewed" history. Updates on
 * same-tab pushes (custom event) and cross-tab changes (native `storage`).
 */
export function useRecentlyViewed(): RecentlyViewedItem[] {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getRecentlyViewed());
    sync();
    window.addEventListener(RECENTLY_VIEWED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return items;
}
