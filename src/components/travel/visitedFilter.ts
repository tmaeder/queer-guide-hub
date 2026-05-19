export type VisitedFilter = 'all' | 'only_visited' | 'hide_visited';

const STORAGE_KEY = 'qg.travel.visitedFilter';

export function readStoredVisitedFilter(): VisitedFilter {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'only_visited' || v === 'hide_visited') return v;
  } catch {
    /* ignore */
  }
  return 'all';
}

export function writeVisitedFilter(v: VisitedFilter) {
  try {
    if (v === 'all') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}
