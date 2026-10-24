/**
 * Guards the /events contract that every query the page issues carries the
 * reader's active filter set.
 *
 * The bug this file exists for: four call sites in Events.tsx passed a literal
 * `{}` as the filter argument.
 *
 *   - "Load more" fetched page 2 UNFILTERED and appended those rows under a
 *     filtered page 1. Filter to one city, click Load more, and events from
 *     everywhere arrive below the fold. Load more is now `loadMore()` on the
 *     same infinite query, so it cannot carry a different filter set at all.
 *   - The error-state and loading-timeout retry buttons refetched page 1 with
 *     no filters, so recovering from a failure silently replaced the reader's
 *     filtered list with an unfiltered one.
 *   - RSVPing refreshed the list the same way, dropping the filters.
 *
 * ASSERT ON THE REQUEST THE FEED RECEIVES, NEVER ON RENDERED CARDS. The
 * page renders whatever the mocked data layer hands back, so a card assertion
 * passes on the broken code. The only load-bearing question is what each query
 * carried. Same discipline as useEventFilters.urlHydration.test.tsx.
 *
 * Each test also asserts the PAGE-1 query was filtered before comparing. Two
 * unfiltered queries compare equal, so without that control the central
 * assertion — "page 2 carries what page 1 carried" — passes vacuously on a
 * page whose filters never applied at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** Every request the page hands the feed, in render order. */
const requests: Array<{ filters: Record<string, unknown> }> = [];
const loadMore = vi.fn();
const refetch = vi.fn();
const eventsState = {
  events: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  hasMore: true,
  loadingTimedOut: false,
};

vi.mock('@/hooks/useEvents', () => ({
  useEventsFeed: (request: { filters: Record<string, unknown> }) => {
    requests.push(request);
    return { ...eventsState, loadingMore: false, datasetTotal: 100, loadMore, refetch };
  },
  updateEventAttendance: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/hooks/useEventWindowCounts', () => ({ useEventWindowCounts: () => ({ data: null }) }));
vi.mock('@/hooks/useAccessibilityAttributes', () => ({
  useAccessibilityAttributes: () => ({ accessibilityAttributes: [] }),
}));
vi.mock('@/hooks/useTargetGroups', () => ({ useTargetGroups: () => ({ targetGroups: [] }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// Handles both `t(key, 'default')` and `t(key, 'default', {count})` /
// `t(key, {defaultValue})`. A naive `(k, d) => d` returns the OPTIONS OBJECT
// for the third shape, which React then refuses to render as a child.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, second?: unknown, third?: unknown) => {
      const opts = (typeof second === 'object' ? second : third) as
        { defaultValue?: string } | undefined;
      if (typeof second === 'string') return second;
      return opts?.defaultValue ?? key;
    },
  }),
}));

// Presentational children, stubbed so this spec is about the QUERIES and does
// not fail on an unrelated card/rail/map change.
vi.mock('@/components/events/EventGridView', () => ({
  EventGridView: ({ events }: { events: unknown[] }) => (
    <div data-testid="grid">{events.length}</div>
  ),
}));
// Events.tsx renders EventCard directly for the loading skeletons.
vi.mock('@/components/events/EventCard', () => ({ EventCard: () => null }));
vi.mock('@/components/events/EventsTimelineView', () => ({ EventsTimelineView: () => null }));
vi.mock('@/components/events/EventsHeroSpotlight', () => ({ EventsHeroSpotlight: () => null }));
vi.mock('@/components/guides/GuidesRail', () => ({ GuidesRail: () => null }));
vi.mock('@/components/events/EventsFilterSheet', () => ({ EventsFilterSheet: () => null }));

import Events from '../Events';

/** A shared filter link: one city. Any city-scoped browse has this shape. */
const CITY_LINK = '/events?cities=Z%C3%BCrich';

function renderAt(url: string) {
  // The loading branch renders real skeleton EventCards, which useQuery.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<Events />, { wrapper });
}

/** The request the page is currently showing. */
function currentFilters() {
  const r = requests[requests.length - 1];
  if (!r) throw new Error('the page never handed the feed a request');
  return r.filters;
}

async function waitForFilteredPageOne() {
  await waitFor(() => {
    expect(currentFilters()).toMatchObject({ cities: ['Zürich'] });
  });
  return currentFilters();
}

describe('/events — every query carries the active filters', () => {
  beforeEach(() => {
    requests.length = 0;
    loadMore.mockReset();
    refetch.mockReset();
    eventsState.events = [{ id: 'e1' }];
    eventsState.loading = false;
    eventsState.error = null;
    eventsState.hasMore = true;
    eventsState.loadingTimedOut = false;
  });

  it('"Load more" asks for the next page of the same request, never a new filter set', async () => {
    renderAt(CITY_LINK);
    const pageOne = await waitForFilteredPageOne();

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    // Page 2 belongs to the request that built page 1 (useEventsFeed keys the
    // infinite query on it — see useEventsFeed.test.tsx). A new request here
    // is the shape that once appended an unfiltered page.
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(currentFilters()).toEqual(pageOne);
  });

  it('retrying after an error re-runs the filtered query, not an unfiltered one', async () => {
    renderAt(CITY_LINK);
    const pageOneFilters = await waitForFilteredPageOne();

    eventsState.error = 'Network error';
    eventsState.events = [];
    renderAt(CITY_LINK);
    await waitForFilteredPageOne();

    await userEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]);
    // Retry re-runs the SAME request: a refetch, with the filters unchanged.
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(currentFilters()).toEqual(pageOneFilters);
  });

  it('retrying a slow load re-runs the filtered query', async () => {
    renderAt(CITY_LINK);
    const pageOneFilters = await waitForFilteredPageOne();

    eventsState.loading = true;
    eventsState.loadingTimedOut = true;
    renderAt(CITY_LINK);
    await waitForFilteredPageOne();

    await userEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]);
    // Retry re-runs the SAME request: a refetch, with the filters unchanged.
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(currentFilters()).toEqual(pageOneFilters);
  });

  it('an unfiltered /events still queries unfiltered (control for the assertions above)', async () => {
    // Without this, "page 2 equals page 1" would also be satisfied by a page
    // that had quietly stopped applying filters altogether.
    renderAt('/events');
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));

    expect(currentFilters().cities).toBeUndefined();
  });
});
