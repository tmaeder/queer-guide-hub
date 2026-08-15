import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  CITIES_SORT_KEYS,
  type CitiesSortKey,
  type EqualityTier,
  EQUALITY_TIERS,
  isCitiesSortKey,
  isEqualityTier,
  parseSetParam,
} from '@/utils/citiesFilter';

export type CitiesView = 'list' | 'map';

export interface CitiesUrlState {
  q: string;
  continents: Set<string>;
  tiers: Set<EqualityTier>;
  sort: CitiesSortKey;
  view: CitiesView;
  city: string;
}

export interface CitiesUrlSetters {
  setQ: (q: string) => void;
  toggleContinent: (code: string) => void;
  clearContinents: () => void;
  toggleTier: (tier: EqualityTier) => void;
  setSort: (sort: CitiesSortKey) => void;
  setView: (view: CitiesView) => void;
  setCity: (slug: string) => void;
  reset: () => void;
}

/**
 * Venue count, not population.
 *
 * The directory used to be capped at the 400 most populous cities, so population
 * was both the cap and the sort. Now that `cities_directory()` returns the whole
 * corpus, ranking by how much of a city we actually hold produces the list this
 * site is for — Berlin, San Francisco, New York, London, Paris, Barcelona, Madrid,
 * Amsterdam, Chicago, Los Angeles, Rio, Bangkok, Cologne, Buenos Aires, Osaka,
 * Brighton — with no editorial whitelist. Population ranks Kolkata above Brighton.
 *
 * A bookmarked /cities with no ?sort= therefore changes order once. That is the
 * intended, visible effect of this change.
 */
const DEFAULT_SORT: CitiesSortKey = 'venues';
const DEFAULT_VIEW: CitiesView = 'list';

function parseTiers(raw: string | null | undefined): Set<EqualityTier> {
  const parsed = parseSetParam(raw);
  const out = new Set<EqualityTier>();
  for (const v of parsed) if (isEqualityTier(v)) out.add(v);
  return out;
}

function serializeSet(set: Set<string>): string | null {
  if (set.size === 0) return null;
  return Array.from(set).sort().join(',');
}

/**
 * Read + write the /cities URL state. Single source of truth.
 *
 * Params: ?q=&continent=&equality=&sort=&view=&city=
 *
 * All writes use `replace: true` to avoid history pile — the user pans /
 * filters / sorts many times per session and back-button should jump out
 * of /cities, not through every chip toggle.
 */
export function useCitiesUrlState(): CitiesUrlState & CitiesUrlSetters {
  const [params, setParams] = useSearchParams();

  const state = useMemo<CitiesUrlState>(() => {
    const sortRaw = params.get('sort');
    const viewRaw = params.get('view');
    return {
      q: params.get('q') ?? '',
      continents: parseSetParam(params.get('continent')),
      tiers: parseTiers(params.get('equality')),
      sort: isCitiesSortKey(sortRaw) ? sortRaw : DEFAULT_SORT,
      view: viewRaw === 'map' ? 'map' : DEFAULT_VIEW,
      city: params.get('city') ?? '',
    };
  }, [params]);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setQ = useCallback(
    (q: string) => {
      update((next) => {
        if (q) next.set('q', q);
        else next.delete('q');
      });
    },
    [update],
  );

  const toggleContinent = useCallback(
    (code: string) => {
      const lc = code.toLowerCase();
      update((next) => {
        const cur = parseSetParam(next.get('continent'));
        if (cur.has(lc)) cur.delete(lc);
        else cur.add(lc);
        const ser = serializeSet(cur);
        if (ser) next.set('continent', ser);
        else next.delete('continent');
      });
    },
    [update],
  );

  /** Clears only the continent facet — the line index's "Clear" must not also
   *  drop the search text or the equality tiers, which live in other bands. */
  const clearContinents = useCallback(() => {
    update((next) => next.delete('continent'));
  }, [update]);

  const toggleTier = useCallback(
    (tier: EqualityTier) => {
      update((next) => {
        const cur = parseTiers(next.get('equality'));
        if (cur.has(tier)) cur.delete(tier);
        else cur.add(tier);
        const ser = serializeSet(cur as Set<string>);
        if (ser) next.set('equality', ser);
        else next.delete('equality');
      });
    },
    [update],
  );

  const setSort = useCallback(
    (sort: CitiesSortKey) => {
      update((next) => {
        if (sort === DEFAULT_SORT) next.delete('sort');
        else next.set('sort', sort);
      });
    },
    [update],
  );

  const setView = useCallback(
    (view: CitiesView) => {
      update((next) => {
        if (view === DEFAULT_VIEW) next.delete('view');
        else next.set('view', view);
      });
    },
    [update],
  );

  const setCity = useCallback(
    (slug: string) => {
      update((next) => {
        if (slug) next.set('city', slug);
        else next.delete('city');
      });
    },
    [update],
  );

  const reset = useCallback(() => {
    update((next) => {
      next.delete('q');
      next.delete('continent');
      next.delete('equality');
      next.delete('sort');
      next.delete('city');
      // view is preserved — resetting filters shouldn't toggle list/map
    });
  }, [update]);

  return {
    ...state,
    setQ,
    toggleContinent,
    clearContinents,
    toggleTier,
    setSort,
    setView,
    setCity,
    reset,
  };
}

export { CITIES_SORT_KEYS, EQUALITY_TIERS };
