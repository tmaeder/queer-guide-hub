/**
 * Bidirectional mapping between the Events page filter state and URL query
 * params. Keep keys short and stable — these end up in shared links.
 */

export type EventSort = 'date-asc' | 'date-desc' | 'distance' | 'popularity' | 'recent';

export interface EventsFilterState {
  q: string;
  cities: string[];
  types: string[];
  tags: string[];
  accessibility: string[];
  languages: string[];
  ageRestriction: string;
  organizerId: string;
  from?: string; // ISO date
  to?: string; // ISO date
  nearMe: boolean;
  showPast: boolean;
  isFree: boolean;
  featured: boolean;
  sort: EventSort;
  view: 'grid' | 'timeline' | 'map';
}

export const DEFAULT_FILTER_STATE: EventsFilterState = {
  q: '',
  cities: [],
  types: [],
  tags: [],
  accessibility: [],
  languages: [],
  ageRestriction: '',
  organizerId: '',
  from: undefined,
  to: undefined,
  nearMe: false,
  showPast: false,
  isFree: false,
  featured: false,
  sort: 'date-asc',
  view: 'grid',
};

function splitCsv(v: string | null): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function joinCsv(arr: string[]): string | undefined {
  return arr.length ? arr.join(',') : undefined;
}

function isSort(v: string | null): v is EventSort {
  return v === 'date-asc' || v === 'date-desc' || v === 'distance' || v === 'popularity' || v === 'recent';
}

export function parseFilterState(params: URLSearchParams): EventsFilterState {
  // Backwards compat: legacy single-value city + q params
  const legacyCity = params.get('city');
  const cities = splitCsv(params.get('cities'));
  if (legacyCity && cities.length === 0) cities.push(legacyCity);

  const view = params.get('view');
  const sort = params.get('sort');

  return {
    q: params.get('q') ?? '',
    cities,
    types: splitCsv(params.get('types')),
    tags: splitCsv(params.get('tags')),
    accessibility: splitCsv(params.get('acc')),
    languages: splitCsv(params.get('lang')),
    ageRestriction: params.get('age') ?? '',
    organizerId: params.get('org') ?? '',
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    nearMe: params.get('near') === '1',
    showPast: params.get('past') === '1',
    isFree: params.get('free') === '1',
    featured: params.get('featured') === '1',
    sort: isSort(sort) ? sort : 'date-asc',
    view: view === 'timeline' || view === 'map' ? view : 'grid',
  };
}

export function serializeFilterState(state: EventsFilterState): URLSearchParams {
  const out = new URLSearchParams();
  const set = (k: string, v: string | undefined) => {
    if (v) out.set(k, v);
  };
  set('q', state.q || undefined);
  set('cities', joinCsv(state.cities));
  set('types', joinCsv(state.types));
  set('tags', joinCsv(state.tags));
  set('acc', joinCsv(state.accessibility));
  set('lang', joinCsv(state.languages));
  set('age', state.ageRestriction || undefined);
  set('org', state.organizerId || undefined);
  set('from', state.from);
  set('to', state.to);
  if (state.nearMe) out.set('near', '1');
  if (state.showPast) out.set('past', '1');
  if (state.isFree) out.set('free', '1');
  if (state.featured) out.set('featured', '1');
  if (state.sort !== 'date-asc') out.set('sort', state.sort);
  if (state.view !== 'grid') out.set('view', state.view);
  return out;
}
