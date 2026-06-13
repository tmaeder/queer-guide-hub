import { useEffect } from 'react';
import {
  trackRecentlyViewed,
  type RecentlyViewedType,
} from '@/lib/recentlyViewed';

interface TrackViewInput {
  type: RecentlyViewedType;
  slug?: string | null;
  title?: string | null;
  image?: string | null;
  city?: string | null;
  country?: string | null;
}

/**
 * Record the current entity into the local "recently viewed" history.
 * Call once from an entity detail page; no-ops until slug + title resolve.
 */
export function useTrackView(input: TrackViewInput): void {
  const { type, slug, title, image, city, country } = input;
  useEffect(() => {
    if (!slug || !title) return;
    trackRecentlyViewed({
      type,
      slug,
      title,
      image: image ?? undefined,
      city: city ?? undefined,
      country: country ?? undefined,
    });
  }, [type, slug, title, image, city, country]);
}
