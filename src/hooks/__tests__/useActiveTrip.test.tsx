import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { TripListItem } from '@/hooks/useTrips';

const mockUseAuth = vi.fn();
const mockUseTrips = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/useTrips', () => ({ useTrips: () => mockUseTrips() }));

import { ActiveTripProvider, useActiveTrip, pickDefaultTrip } from '../useActiveTrip';

function makeTrip(overrides: Partial<TripListItem> = {}): TripListItem {
  return {
    id: 't',
    owner_id: 'u-1',
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
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ActiveTripProvider>{children}</ActiveTripProvider>
);

beforeEach(() => {
  localStorage.clear();
  mockUseAuth.mockReset();
  mockUseTrips.mockReset();
});

describe('pickDefaultTrip', () => {
  const now = new Date('2026-04-19T12:00:00Z');

  it('returns null for empty list', () => {
    expect(pickDefaultTrip([], now)).toBeNull();
  });

  it('picks the live trip when one exists', () => {
    const live = makeTrip({ id: 'live', start_date: '2026-04-15', end_date: '2026-04-25' });
    const future = makeTrip({ id: 'future', start_date: '2026-05-01', end_date: '2026-05-08' });
    expect(pickDefaultTrip([future, live], now)?.id).toBe('live');
  });

  it('does NOT auto-pick a planning-only trip', () => {
    const plan = makeTrip({ id: 'plan', start_date: '2099-01-01', end_date: '2099-01-08' });
    expect(pickDefaultTrip([plan], now)).toBeNull();
  });

  it('does NOT auto-pick a seed trip (no dates)', () => {
    expect(pickDefaultTrip([makeTrip({ id: 'seed' })], now)).toBeNull();
  });

  it('picks a countdown trip only when user has started planning', () => {
    const empty = makeTrip({ id: 'empty', start_date: '2026-04-25', end_date: '2026-04-30' });
    const planned = makeTrip({ id: 'planned', start_date: '2026-04-25', end_date: '2026-04-30', place_count: 3 });
    expect(pickDefaultTrip([empty], now)).toBeNull();
    expect(pickDefaultTrip([empty, planned], now)?.id).toBe('planned');
  });

  it('ignores memory/archived trips', () => {
    expect(pickDefaultTrip([makeTrip({ id: 'past', start_date: '2020-01-01', end_date: '2020-01-08' })], now)).toBeNull();
  });
});

describe('ActiveTripProvider', () => {
  it('returns null activeTrip when user is signed out', () => {
    mockUseAuth.mockReturnValue({ user: null });
    mockUseTrips.mockReturnValue({ data: [makeTrip({ id: 'x', status: 'active' })] });
    const { result } = renderHook(() => useActiveTrip(), { wrapper });
    expect(result.current.activeTrip).toBeNull();
  });

  it('returns null when signed-in user has no trips', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1' } });
    mockUseTrips.mockReturnValue({ data: [] });
    const { result } = renderHook(() => useActiveTrip(), { wrapper });
    expect(result.current.activeTrip).toBeNull();
  });

  it('auto-picks the single live trip', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1' } });
    const live = makeTrip({ id: 'live', status: 'active', start_date: '2026-04-15', end_date: '2099-04-25' });
    mockUseTrips.mockReturnValue({ data: [live] });
    const { result } = renderHook(() => useActiveTrip(), { wrapper });
    expect(result.current.activeTrip?.id).toBe('live');
  });

  it('dismiss() persists to localStorage and marks isDismissed', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1' } });
    const live = makeTrip({ id: 'live', status: 'active', start_date: '2026-04-15', end_date: '2099-04-25' });
    mockUseTrips.mockReturnValue({ data: [live] });
    const { result } = renderHook(() => useActiveTrip(), { wrapper });
    expect(result.current.isDismissed).toBe(false);
    act(() => result.current.dismiss());
    expect(localStorage.getItem('qg.activeTripDismissed')).toBe('live');
    expect(result.current.isDismissed).toBe(true);
  });

  it('clears stale dismiss id when the trip is no longer in the list', async () => {
    localStorage.setItem('qg.activeTripDismissed', 'gone-trip');
    mockUseAuth.mockReturnValue({ user: { id: 'u-1' } });
    mockUseTrips.mockReturnValue({ data: [makeTrip({ id: 'other' })] });
    renderHook(() => useActiveTrip(), { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem('qg.activeTripDismissed')).toBeNull();
    });
  });

  it('clears pin and dismiss keys from localStorage on sign out', async () => {
    localStorage.setItem('qg.activeTripId', 'pinned');
    localStorage.setItem('qg.activeTripDismissed', 'pinned');
    mockUseAuth.mockReturnValue({ user: null });
    mockUseTrips.mockReturnValue({ data: [] });
    renderHook(() => useActiveTrip(), { wrapper });
    await waitFor(() => {
      expect(localStorage.getItem('qg.activeTripId')).toBeNull();
      expect(localStorage.getItem('qg.activeTripDismissed')).toBeNull();
    });
  });
});
