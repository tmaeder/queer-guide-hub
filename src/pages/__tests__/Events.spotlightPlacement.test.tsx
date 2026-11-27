/**
 * Where the /events "next event" spotlight renders.
 *
 * It only exists once the events have loaded and one falls in the next 30
 * days, so wherever it lands, it lands late. In the page header that is fine
 * from md up (it sits beside the title), but on a phone the header is one
 * column and the card pushed the filters and results ~170px down (mobile CLS
 * 0.126). On a phone it therefore renders at the top of the results, in the
 * space the loading skeleton held, and never in the header.
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

describe('/events spotlight placement', () => {
  beforeEach(() => {
    requests.length = 0;
    eventsState.loading = false;
    eventsState.error = null;
    eventsState.events = [
      {
        id: 'e1',
        start_date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        liveness_status: 'live',
        age_restriction: null,
      },
    ];
  });

  it('sits beside the title, inside the header, from md up', () => {
    viewport.mobile = false;
    const { container } = renderEvents();
    const spot = screen.getByTestId('spotlight');
    expect(container.querySelector('header')?.contains(spot)).toBe(true);
  });

  it('renders at the top of the results on a phone, never in the header', () => {
    viewport.mobile = true;
    const { container } = renderEvents();
    const spots = screen.getAllByTestId('spotlight');
    expect(spots).toHaveLength(1);
    expect(container.querySelector('header')?.contains(spots[0])).toBe(false);
    // After the results it introduces, not before the filters.
    const grid = screen.getByTestId('grid');
    expect(spots[0].compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
