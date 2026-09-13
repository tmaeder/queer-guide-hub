/**
 * Guards the /events contract that every query the page issues carries the
 * reader's active filter set.
 *
 * The bug this file exists for: four call sites in Events.tsx passed a literal
 * `{}` as the filter argument.
 *
 *   - "Load more" fetched page 2 UNFILTERED and — because it passes
 *     `append: true` — added those rows under a filtered page 1. Filter to one
 *     city, click Load more, and events from everywhere arrive below the fold.
 *   - The error-state and loading-timeout retry buttons refetched page 1 with
 *     no filters, so recovering from a failure silently replaced the reader's
 *     filtered list with an unfiltered one.
 *   - RSVPing refreshed the list the same way, dropping the filters.
 *
 * ASSERT ON THE ARGUMENTS `fetchEvents` RECEIVES, NEVER ON RENDERED CARDS. The
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

type FetchArgs = [Record<string, unknown> | undefined, Record<string, unknown> | undefined];

const fetchEvents = vi.fn();
const eventsState = {
  events: [] as Array<Record<string, unknown>>,
  loading: false,
  error: null as string | null,
  hasMore: true,
  loadingTimedOut: false,
};

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({
    ...eventsState,
    datasetTotal: 100,
    totalCount: 100,
    fetchEvents,
    updateAttendance: vi.fn().mockResolvedValue({ error: null }),
  }),
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

/** The most recent query that REPLACED the list (page 1, `append: false`). */
function lastReplaceCall(): FetchArgs {
  const calls = fetchEvents.mock.calls as FetchArgs[];
  const call = [...calls].reverse().find((c) => !c[1]?.append);
  if (!call) throw new Error('no list-replacing query was issued');
  return call;
}

async function waitForFilteredPageOne() {
  await waitFor(() => {
    expect(lastReplaceCall()[0]).toMatchObject({ cities: ['Zürich'] });
  });
  return lastReplaceCall()[0];
}

describe('/events — every query carries the active filters', () => {
  beforeEach(() => {
    fetchEvents.mockReset();
    fetchEvents.mockResolvedValue({ fetched: 24, total: 100 });
    eventsState.events = [{ id: 'e1' }];
    eventsState.loading = false;
    eventsState.error = null;
    eventsState.hasMore = true;
    eventsState.loadingTimedOut = false;
  });

  it('"Load more" fetches page 2 with the same filters as page 1', async () => {
    renderAt(CITY_LINK);
    const pageOneFilters = await waitForFilteredPageOne();

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    const appendCalls = (fetchEvents.mock.calls as FetchArgs[]).filter((c) => c[1]?.append);
    expect(appendCalls).toHaveLength(1);
    const [pageTwoFilters, pageTwoOpts] = appendCalls[0];

    expect(pageTwoOpts).toMatchObject({ page: 2, append: true });
    // The property, not a pinned value: whatever page 1 asked for, page 2 must
    // ask for too. Appending rows from a different query is the defect.
    expect(pageTwoFilters).toEqual(pageOneFilters);
  });

  it('retrying after an error re-runs the filtered query, not an unfiltered one', async () => {
    renderAt(CITY_LINK);
    const pageOneFilters = await waitForFilteredPageOne();

    eventsState.error = 'Network error';
    eventsState.events = [];
    renderAt(CITY_LINK);
    await waitForFilteredPageOne();

    const before = fetchEvents.mock.calls.length;
    await userEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]);
    await waitFor(() => expect(fetchEvents.mock.calls.length).toBeGreaterThan(before));

    expect(lastReplaceCall()[0]).toEqual(pageOneFilters);
  });

  it('retrying a slow load re-runs the filtered query', async () => {
    renderAt(CITY_LINK);
    const pageOneFilters = await waitForFilteredPageOne();

    eventsState.loading = true;
    eventsState.loadingTimedOut = true;
    renderAt(CITY_LINK);
    await waitForFilteredPageOne();

    const before = fetchEvents.mock.calls.length;
    await userEvent.click(screen.getAllByRole('button', { name: /try again|retry/i })[0]);
    await waitFor(() => expect(fetchEvents.mock.calls.length).toBeGreaterThan(before));

    expect(lastReplaceCall()[0]).toEqual(pageOneFilters);
  });

  it('an unfiltered /events still queries unfiltered (control for the assertions above)', async () => {
    // Without this, "page 2 equals page 1" would also be satisfied by a page
    // that had quietly stopped applying filters altogether.
    renderAt('/events');
    await waitFor(() => expect(fetchEvents).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    const appendCalls = (fetchEvents.mock.calls as FetchArgs[]).filter((c) => c[1]?.append);
    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0][0]?.cities).toBeUndefined();
  });
});
