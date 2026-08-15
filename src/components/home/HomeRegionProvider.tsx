import { createContext, useContext, type ReactNode } from 'react';
import { useHomeRegion, type HomeRegionApi } from '@/hooks/useHomeRegion';

const HomeRegionContext = createContext<HomeRegionApi | null>(null);

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

/**
 * Resolves the homepage's region ONCE and shares it.
 *
 * Mounted inside the homepage rather than in App: the ladder costs a geo call
 * and a city lookup, and no other route should pay for them. Several bands and
 * the region chip all read the same value, so resolving per-consumer would
 * multiply the requests and let two bands briefly disagree about where the
 * visitor is.
 */
export function HomeRegionProvider({ children }: { children: ReactNode }) {
  const region = useHomeRegion();
  return <HomeRegionContext.Provider value={region}>{children}</HomeRegionContext.Provider>;
}

export function useHomeRegionContext(): HomeRegionApi {
  return useContext(HomeRegionContext) ?? NEUTRAL;
}
