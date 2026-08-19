import { createContext, useContext } from 'react';
import type { HomeRegionApi } from '@/hooks/useHomeRegion';

/**
 * Split out of `HomeRegionProvider.tsx` so that file exports ONLY its component.
 * A module mixing a component with other exports breaks React Fast Refresh —
 * editing it remounts the subtree instead of hot-swapping it, which on the
 * homepage means re-running the region ladder (a geo call plus a city lookup)
 * on every save.
 */
export const HomeRegionContext = createContext<HomeRegionApi | null>(null);

/** Neutral value for consumers rendered outside the provider (tests, and any
 *  future reuse of a band on another page). Reads as "no region", which every
 *  band already handles by going global — never as an error. */
const NEUTRAL: HomeRegionApi = {
  cityId: null,
  citySlug: null,
  cityName: null,
  countryId: null,
  countryCode: null,
  countryName: null,
  source: 'none',
  inferred: false,
  loading: false,
  setRegion: () => {},
};

export function useHomeRegionContext(): HomeRegionApi {
  return useContext(HomeRegionContext) ?? NEUTRAL;
}
