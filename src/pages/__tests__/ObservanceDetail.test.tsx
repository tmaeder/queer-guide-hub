import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import ObservanceDetail from '@/pages/ObservanceDetail';

const hooks = vi.hoisted(() => ({
  useObservance: vi.fn(),
  useObservanceDates: vi.fn(),
  useObservanceEvents: vi.fn(),
  useObservanceGatedCount: vi.fn(),
}));
vi.mock('@/hooks/useObservances', () => hooks);
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/components/events/EventCard', () => ({
  EventCard: ({ event }: { event: { title: string } }) => (
    <div data-testid="event-card">{event.title}</div>
  ),
}));
// Real i18n is not initialised in unit tests; interpolate the default string like i18next does.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_key: string, def: string, vars?: Record<string, unknown>) =>
      def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars?.[k] ?? '')),
  }),
}));
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useParams: () => ({ slug: 'transgender-day-of-remembrance' }),
}));

const base = {
  id: 'o1',
  slug: 'transgender-day-of-remembrance',
  name: 'Transgender Day of Remembrance',
  kind: 'day',
  summary: 'Held every 20 November.',
  body: null,
  founded_year: 1999,
  window_days_before: 7,
  window_days_after: 1,
  founded_milestone: null,
};

beforeEach(() => {
  // Fixed "today" so the countdown is deterministic: 19 days before 20 Nov.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  auth.user = null;
  hooks.useObservanceDates.mockReturnValue({
    data: [{ country_id: null, country_name: null, starts: '2026-11-20', ends: '2026-11-20' }],
  });
  hooks.useObservanceEvents.mockReturnValue({ data: [], isLoading: false });
  hooks.useObservanceGatedCount.mockReturnValue({ data: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObservanceDetail', () => {
  it('awareness tone: countdown, no help link', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/in 19 days/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /support/i })).toBeNull();
  });

  it('memorial tone: help link, no countdown', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'memorial' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByRole('heading', { level: 1, name: base.name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/help'),
    );
    expect(screen.queryByText(/in \d+ days/i)).toBeNull();
  });

  it('h1 uses the detail-page heading size', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveClass('font-display', 'text-headline');
  });

  it('empty state is literal', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'memorial' }, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/No events listed for 2026 yet\./)).toBeInTheDocument();
  });

  it('groups events by country', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    const current = {
      isLoading: false,
      data: [
        {
          id: 'e1',
          title: 'Vigil Berlin',
          country: 'Germany',
          city: 'Berlin',
          start_date: '2026-11-20T18:00:00Z',
        },
        {
          id: 'e2',
          title: 'Vigil Zurich',
          country: 'Switzerland',
          city: 'Zurich',
          start_date: '2026-11-19T18:00:00Z',
        },
      ],
    };
    hooks.useObservanceEvents.mockImplementation((_id: string, w: { from: string } | null) =>
      w?.from.startsWith('2026') ? current : { isLoading: false, data: [] },
    );
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByRole('heading', { level: 3, name: 'Germany' })).toBeInTheDocument();
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
  });

  it('labels ISO country codes with the country name', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceEvents.mockImplementation((_id: string, w: { from: string } | null) => ({
      isLoading: false,
      data: w?.from.startsWith('2026')
        ? [{ id: 'e1', title: 'Vigil', country: 'US', start_date: '2026-11-20T18:00:00Z' }]
        : [],
    }));
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByRole('heading', { level: 3, name: 'United States' })).toBeInTheDocument();
  });

  it('shows last year events under their own heading when this year has none', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'memorial' }, isLoading: false });
    hooks.useObservanceEvents.mockImplementation((_id: string, w: { from: string } | null) =>
      w?.from.startsWith('2025')
        ? {
            isLoading: false,
            data: [
              {
                id: 'p1',
                title: 'Vigil 2025 A',
                country: 'Germany',
                start_date: '2025-11-20T18:00:00Z',
              },
              {
                id: 'p2',
                title: 'Vigil 2025 B',
                country: 'Germany',
                start_date: '2025-11-19T18:00:00Z',
              },
            ],
          }
        : { isLoading: false, data: [] },
    );
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/No events listed for 2026 yet\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '2025 events' })).toBeInTheDocument();
    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
  });

  it('gated notice shows a count only, no legal claim', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceGatedCount.mockImplementation((_id: string, w: { from: string } | null) => ({
      data: w?.from.startsWith('2026') ? 4 : 0,
    }));
    renderWithProviders(<ObservanceDetail />);
    // No visible events in the section: copy drops "more".
    expect(screen.getByText(/Sign in to see 4 events\./)).toBeInTheDocument();
    expect(screen.queryByText(/illegal|criminal/i)).toBeNull();
  });

  it('gated notice says "more" when some events are visible', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceEvents.mockImplementation((_id: string, w: { from: string } | null) => ({
      isLoading: false,
      data: w?.from.startsWith('2026')
        ? [{ id: 'e1', title: 'Vigil', country: 'Germany', start_date: '2026-11-20T18:00:00Z' }]
        : [],
    }));
    hooks.useObservanceGatedCount.mockReturnValue({ data: 4 });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getAllByText(/Sign in to see 4 more events\./).length).toBeGreaterThan(0);
  });

  it('signed-in users: no gated notice and the gated RPC gets no range', () => {
    auth.user = { id: 'u1' };
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceGatedCount.mockReturnValue({ data: 4 });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.queryByText(/Sign in to see/)).toBeNull();
    expect(hooks.useObservanceGatedCount).toHaveBeenCalledWith('o1', null);
  });

  it('does not flash the empty state while dates load', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceDates.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.queryByText(/No events listed/)).toBeNull();
  });

  it('shows an error line instead of the empty state when events fail', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceEvents.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText('Could not load events.')).toBeInTheDocument();
    expect(screen.queryByText(/No events listed/)).toBeNull();
  });

  it('uses the earliest date as the primary one when rows arrive unsorted', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    hooks.useObservanceDates.mockReturnValue({
      data: [
        {
          country_id: 'gb',
          country_name: 'United Kingdom',
          starts: '2027-02-01',
          ends: '2027-02-28',
        },
        { country_id: 'ca', country_name: 'Canada', starts: '2026-11-20', ends: '2026-11-20' },
      ],
    });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/No events listed for 2026 yet\./)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Canada');
  });

  it('hides previous-year events already shown for this year', () => {
    hooks.useObservance.mockReturnValue({ data: { ...base, tone: 'awareness' }, isLoading: false });
    const dup = { id: 'e1', title: 'Same', country: 'Germany', start_date: '2026-11-20T18:00:00Z' };
    hooks.useObservanceEvents.mockReturnValue({ isLoading: false, data: [dup] });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getAllByTestId('event-card')).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2, name: '2025 events' })).toBeNull();
  });

  it('unknown slug renders not found', () => {
    hooks.useObservance.mockReturnValue({ data: null, isLoading: false });
    renderWithProviders(<ObservanceDetail />);
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
