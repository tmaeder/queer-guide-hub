import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

/**
 * Guards the /events shareable-filter-link contract.
 *
 * The bug this file exists for: filters in the URL rendered as active chips but
 * were not applied to the results, so every shared or bookmarked filter link —
 * and everything ShareFiltersButton emits — showed the wrong events.
 *
 * The cause was ordering, not parsing. `useEventFilters` initialised its 18
 * filter dimensions to hard-coded defaults and read the URL only in a
 * `useEffect` declared AFTER the mount-fetch effect, so the first query went out
 * unfiltered (or scoped to the visitor's geo city) and the URL's filters reached
 * the data layer one commit later, as a second query. `useEvents.fetchEvents`
 * applies whichever response resolves last, and the unfiltered query is the
 * slower of the two — it runs `count: 'exact'` over the whole upcoming corpus
 * and pays a second round-trip for attendee counts on its 24 rows, while a
 * narrow city+date query often returns zero rows and skips that round-trip. So
 * the stale unfiltered response landed last and overwrote the correct results.
 *
 * ASSERT ON THE QUERY, NEVER ON THE CHIPS. The chips render from filter state,
 * which was correct throughout the bug — a chip assertion passes on the broken
 * code. The only load-bearing question is what the FIRST fetch carried.
 */

const toastMock = vi.fn();
const visitorLocation = { value: null as { city?: string } | null };

vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: visitorLocation.value, loading: false }),
}));
vi.mock('@/hooks/useAccessibilityAttributes', () => ({
  useAccessibilityAttributes: () => ({ accessibilityAttributes: [] }),
}));
vi.mock('@/hooks/useTargetGroups', () => ({
  useTargetGroups: () => ({ targetGroups: [] }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

import { useEventFilters } from '../useEventFilters';

function wrapperFor(url: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
}

/** The shared link from the bug report: Zürich, 11–12 Sep 2026. */
const SHARED_LINK = '/events?cities=Z%C3%BCrich&from=2026-09-11&to=2026-09-12';

describe('useEventFilters — URL filters must reach the FIRST fetch', () => {
  beforeEach(() => {
    toastMock.mockReset();
    visitorLocation.value = null;
  });

  it('carries the URL cities + date range on the very first query', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({ fetched: 0, total: 0 });

    renderHook(() => useEventFilters(fetchEvents, []), {
      wrapper: wrapperFor(SHARED_LINK),
    });

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled());

    // The FIRST call is the one that matters: a later corrective call cannot be
    // relied on to win, because responses are applied in resolution order.
    const [filters] = fetchEvents.mock.calls[0];
    expect(filters).toMatchObject({ cities: ['Zürich'] });
    expect(filters.dateRange).toBeDefined();
    expect(filters.dateRange.start).toContain('2026-09-11');
    expect(filters.dateRange.end).toContain('2026-09-12');
  });

  it('issues no unfiltered query alongside it', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({ fetched: 0, total: 0 });

    renderHook(() => useEventFilters(fetchEvents, []), {
      wrapper: wrapperFor(SHARED_LINK),
    });

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled());
    // Let any follow-up effects settle before counting.
    await new Promise((r) => setTimeout(r, 50));

    // Every query on mount must be scoped. One unscoped query is enough to
    // reintroduce the bug, whatever order it was issued in.
    for (const [filters] of fetchEvents.mock.calls) {
      expect(filters?.cities, `unscoped query: ${JSON.stringify(filters)}`).toEqual(['Zürich']);
    }
  });

  it('does not inject the visitor geo city into a date-only shared link', async () => {
    // Warm geo cache: useVisitorLocation serves a resolved value synchronously
    // on first render, which is the normal case for in-site navigation.
    visitorLocation.value = { city: 'Berlin' };
    const fetchEvents = vi.fn().mockResolvedValue({ fetched: 0, total: 0 });

    renderHook(() => useEventFilters(fetchEvents, []), {
      wrapper: wrapperFor('/events?from=2026-09-11&to=2026-09-12'),
    });

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    // The link asked for a date window, not a city. Silently scoping it to
    // wherever the reader happens to be answers a question nobody asked.
    for (const [filters] of fetchEvents.mock.calls) {
      expect(filters?.cities, `geo city leaked: ${JSON.stringify(filters)}`).toBeUndefined();
    }
  });

  it('still applies the visitor geo city when the URL carries no filters', async () => {
    // Positive control: proves the guard above tests the URL branch and not a
    // blanket disabling of geo defaulting, which would pass it vacuously.
    visitorLocation.value = { city: 'Berlin' };
    const fetchEvents = vi.fn().mockResolvedValue({ fetched: 0, total: 0 });

    renderHook(() => useEventFilters(fetchEvents, []), {
      wrapper: wrapperFor('/events'),
    });

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled());
    expect(fetchEvents.mock.calls[0][0]).toMatchObject({ cities: ['Berlin'] });
  });
});
