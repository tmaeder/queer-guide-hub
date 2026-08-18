import { type ReactNode } from 'react';
import { useHomeRegion } from '@/hooks/useHomeRegion';
import { HomeRegionContext } from './homeRegionContext';

/**
 * Resolves the homepage's region ONCE and shares it.
 *
 * Mounted inside the homepage rather than in App: the ladder costs a geo call
 * and a city lookup, and no other route should pay for them. Several bands and
 * the region chip all read the same value, so resolving per-consumer would
 * multiply the requests and let two bands briefly disagree about where the
 * visitor is.
 *
 * The context and its `useHomeRegionContext` reader live in
 * `homeRegionContext.ts`, not here: this file must export only its component or
 * Fast Refresh stops hot-swapping it.
 */
export function HomeRegionProvider({ children }: { children: ReactNode }) {
  const region = useHomeRegion();
  return <HomeRegionContext.Provider value={region}>{children}</HomeRegionContext.Provider>;
}
