/**
 * Where the /events awareness-day chips (ObservanceFacet) render.
 *
 * Their options come from their own query (observances_index). Rendered at
 * the top of the page they arrived while the loading skeleton was up and
 * pushed the whole page down 60px (phone CLS 0.034 on prod, 2026-11-27).
 * They now render only once the first page of results has replaced the
 * skeleton, directly above the results, and stay while a later refetch runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('@/components/events/EventsHeroSpotlight', () => ({
  EventsHeroSpotlight: () => <div data-testid="spotlight" />,
}));
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));
vi.mock('@/components/guides/GuidesRail', () => ({ GuidesRail: () => null }));
vi.mock('@/components/events/EventsFilterSheet', () => ({ EventsFilterSheet: () => null }));
const obsIndex = vi.hoisted(() => vi.fn(() => ({ data: [] })));
vi.mock('@/hooks/useObservanceIndex', () => ({ useObservancesIndex: obsIndex }));
vi.mock('@/components/events/ObservanceFacet', () => ({
  ObservanceFacet: () => <div data-testid="facet" />,
}));

import Events from '../Events';

function renderEvents() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/events']}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<Events />, { wrapper });
}

describe('/events awareness-day facet placement', () => {
  beforeEach(() => {
    requests.length = 0;
    viewport.mobile = true;
    eventsState.error = null;
    eventsState.events = [
      { id: 'e1', start_date: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    ];
  });

  it('is not rendered while the first page is still loading', () => {
    eventsState.loading = true;
    renderEvents();
    expect(screen.queryByTestId('facet')).toBeNull();
  });

  it('starts its query with the page, before the list has loaded', () => {
    // Otherwise the query only starts when the facet mounts, after the list,
    // and its answer always lands late and pushes the results down.
    obsIndex.mockClear();
    eventsState.loading = true;
    renderEvents();
    expect(obsIndex).toHaveBeenCalled();
  });

  it('renders just above the results once they have loaded', () => {
    eventsState.loading = false;
    const { container } = renderEvents();
    const facet = screen.getByTestId('facet');
    expect(container.querySelector('header')?.contains(facet)).toBe(false);
    const grid = screen.getByTestId('grid');
    expect(facet.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // After the result count/sort row, so its arrival cannot move it.
    const status = container.querySelector('[role="status"]')!;
    expect(status.compareDocumentPosition(facet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('stays rendered while a later refetch shows the skeleton again', () => {
    eventsState.loading = false;
    const { rerender } = renderEvents();
    expect(screen.getByTestId('facet')).toBeTruthy();
    eventsState.loading = true;
    rerender(<Events />);
    expect(screen.getByTestId('facet')).toBeTruthy();
  });
});
