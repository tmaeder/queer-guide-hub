import { useCallback, useState } from 'react';

export type NewsDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'qg:news:density';

// Card density for the news feeds, persisted to localStorage. Drives NewsCard's
// existing `density` prop (comfortable = taller images, compact = denser).
export function useNewsDensity() {
  const [density, setDensityState] = useState<NewsDensity>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const setDensity = useCallback((next: NewsDensity) => {
    setDensityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota/SSR */
    }
  }, []);

  const toggle = useCallback(() => {
    setDensityState((d) => {
      const next = d === 'comfortable' ? 'compact' : 'comfortable';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { density, setDensity, toggle };
}
