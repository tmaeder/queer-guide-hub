/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TripListItem } from '@/hooks/useTrips';

const { useTripsMock, useAuthMock } = vi.hoisted(() => ({
  useTripsMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/hooks/useTrips', () => ({ useTrips: () => useTripsMock() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

import {
  useHasMeaningfulActiveTrip,
  useMeaningfulTrips,
  usePrimaryMeaningfulTrip,
} from '../useMeaningfulTrips';

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

beforeEach(() => {
  useTripsMock.mockReset();
  useAuthMock.mockReset();
});

describe('useHasMeaningfulActiveTrip', () => {
  function Probe() {
    return <span data-testid="probe">{String(useHasMeaningfulActiveTrip())}</span>;
  }

  it('false when user is signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    useTripsMock.mockReturnValue({ data: [baseTrip({ place_count: 5 })], isLoading: false });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });

  it('false when only empty stub trips exist', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [baseTrip({ title: 'Trip to Berlin', primary_city_name: 'Berlin' })],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });

  it('true when at least one meaningful trip exists', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [baseTrip({ place_count: 1 })],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('true');
  });
});

describe('usePrimaryMeaningfulTrip', () => {
  function Probe() {
    const t = usePrimaryMeaningfulTrip();
    return <span data-testid="primary">{t?.id ?? 'none'}</span>;
  }

  it('returns null when there are only stub trips', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [baseTrip({ id: 'stub', title: 'Trip to Paris', primary_city_name: 'Paris' })],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('primary')).toHaveTextContent('none');
  });

  it('returns the first meaningful trip when one exists', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [
        baseTrip({ id: 'stub', title: 'Trip to Paris', primary_city_name: 'Paris' }),
        baseTrip({ id: 'real', start_date: '2026-06-01' }),
      ],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('primary')).toHaveTextContent('real');
  });
});

describe('useMeaningfulTrips', () => {
  function Probe() {
    const trips = useMeaningfulTrips();
    return <span data-testid="count">{trips.length}</span>;
  }

  it('filters out completed/archived trips even if meaningful', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    useTripsMock.mockReturnValue({
      data: [
        baseTrip({ id: 'done', status: 'completed', place_count: 10 }),
        baseTrip({ id: 'live', status: 'active', place_count: 3 }),
      ],
      isLoading: false,
    });
    render(<Probe />);
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
