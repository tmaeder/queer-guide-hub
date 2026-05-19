/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { TripListItem } from '@/hooks/useTrips';

const { useTripsMock, useAuthMock, useActiveTripMock } = vi.hoisted(() => ({
  useTripsMock: vi.fn(),
  useAuthMock: vi.fn(),
  useActiveTripMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      if (typeof d === 'string') {
        const interp = opts ?? {};
        return d.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(interp[k] ?? ''));
      }
      return _k;
    },
  }),
}));
vi.mock('@/hooks/useTrips', () => ({ useTrips: () => useTripsMock() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => useActiveTripMock() }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { ResumeTripStrip, useHasMeaningfulActiveTrip } from '../ResumeTripStrip';

const baseTrip = (overrides: Partial<TripListItem>): TripListItem => ({
  id: 't1',
  owner_id: 'u1',
  title: 'Trip',
  description: null,
  cover_image_url: null,
  start_date: null,
  end_date: null,
  currency: 'EUR',
  status: 'planning',
  is_public: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  primary_city_id: null,
  primary_country_id: null,
  primary_city_name: null,
  primary_country_code: null,
  timezone: null,
  member_count: 1,
  place_count: 0,
  day_count: 0,
  min_equality_score: null,
  ...overrides,
});

function renderStrip() {
  return render(<MemoryRouter><ResumeTripStrip /></MemoryRouter>);
}

describe('ResumeTripStrip', () => {
  beforeEach(() => {
    useTripsMock.mockReset();
    useAuthMock.mockReset();
    useActiveTripMock.mockReset();
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useActiveTripMock.mockReturnValue({ activeTrip: null, setActiveTripId: vi.fn() });
  });

  it('renders nothing for signed-out users', () => {
    useAuthMock.mockReturnValue({ user: null });
    useTripsMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = renderStrip();
    expect(container.firstChild).toBeNull();
  });

  it('hides empty stub trips (no places, no dates, default-style title)', () => {
    useTripsMock.mockReturnValue({
      data: [
        baseTrip({ id: 'empty1', title: 'Trip to Berlin', primary_city_name: 'Berlin' }),
        baseTrip({ id: 'empty2', title: 'Berlin trip', primary_city_name: 'Berlin' }),
      ],
      isLoading: false,
    });
    const { container } = renderStrip();
    expect(container.firstChild).toBeNull();
  });

  it('renders the active trip card when at least one meaningful trip exists', () => {
    useTripsMock.mockReturnValue({
      data: [
        baseTrip({
          id: 'real',
          title: 'Berlin getaway',
          place_count: 4,
          primary_city_name: 'Berlin',
        }),
      ],
      isLoading: false,
    });
    renderStrip();
    expect(screen.getByText('Berlin getaway')).toBeInTheDocument();
    expect(screen.getByText(/Open trip/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Switch active trip/i)).toBeNull();
  });

  it('shows the trip switcher when more than one meaningful trip exists', () => {
    useTripsMock.mockReturnValue({
      data: [
        baseTrip({ id: 'a', title: 'Berlin getaway', place_count: 3 }),
        baseTrip({ id: 'b', title: 'Paris week', place_count: 2 }),
      ],
      isLoading: false,
    });
    renderStrip();
    expect(screen.getByLabelText(/Switch active trip/i)).toBeInTheDocument();
  });
});

describe('useHasMeaningfulActiveTrip', () => {
  beforeEach(() => {
    useTripsMock.mockReset();
    useAuthMock.mockReset();
  });

  function Probe() {
    return <span data-testid="probe">{String(useHasMeaningfulActiveTrip())}</span>;
  }

  it('returns false when no meaningful trips', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [baseTrip({ title: 'Trip to Berlin', primary_city_name: 'Berlin' })],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });

  it('returns true when there is at least one meaningful trip', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [baseTrip({ place_count: 1 })],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });
});
