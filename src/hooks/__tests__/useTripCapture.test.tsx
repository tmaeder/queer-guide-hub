import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTripCapture } from '@/lib/trips/tripCaptureIntent';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  activeTrip: null as {
    id: string;
    title: string;
    owner_id: string;
    membership_role?: 'owner' | 'editor' | 'viewer';
  } | null,
  navigate: vi.fn(),
  openDock: vi.fn(),
  setActiveTripId: vi.fn(),
  addPlace: vi.fn(),
  removePlace: vi.fn(),
  toast: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({
    activeTrip: mocks.activeTrip,
    openDock: mocks.openDock,
    setActiveTripId: mocks.setActiveTripId,
  }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => mocks.navigate,
}));
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/events', search: '?city=Berlin', hash: '#weekend' }),
}));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    addPlace: { mutateAsync: mocks.addPlace, isPending: false },
    removePlace: { mutateAsync: mocks.removePlace, isPending: false },
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/trips/resolveEntityGeo', () => ({
  resolveEntityGeo: vi.fn(async () => new Map()),
}));
vi.mock('@/utils/tripTracking', () => ({ trackTripEvent: mocks.track }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string' ? fallback : (fallback?.defaultValue ?? _key),
  }),
}));

import { useTripCapture } from '../useTripCapture';

const entityIntent = {
  kind: 'add_entity' as const,
  entity: { type: 'venue' as const, id: 'venue-1', name: 'The Club' },
};

describe('useTripCapture', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.user = { id: 'user-1' };
    mocks.activeTrip = { id: 'trip-1', title: 'Berlin weekend', owner_id: 'user-1' };
    mocks.addPlace.mockResolvedValue({ id: 'place-1' });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('preserves signed-out intent and returns through auth', async () => {
    mocks.user = null;
    const { result } = renderHook(() => useTripCapture());

    await act(() => result.current.capture(entityIntent, { source: 'event-card' }));

    expect(readTripCapture()).toMatchObject({
      intent: entityIntent,
      source: 'event-card',
      returnTo: '/events?city=Berlin#weekend',
    });
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/auth?redirect=%2Fevents%3Fcity%3DBerlin%23weekend',
    );
  });

  it('adds directly to the active trip as unscheduled and offers Undo', async () => {
    const { result } = renderHook(() => useTripCapture());

    await act(() => result.current.capture(entityIntent, { source: 'event-card' }));

    expect(mocks.addPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        trip_id: 'trip-1',
        day_id: null,
        venue_id: 'venue-1',
        event_id: null,
      }),
    );
    const toast = mocks.toast.mock.calls.at(-1)?.[0];
    expect(toast.action.label).toBe('Undo');
    await act(() => toast.action.onClick());
    expect(mocks.removePlace).toHaveBeenCalledWith({ id: 'place-1', tripId: 'trip-1' });
  });

  it('opens the dock instead of adding a duplicate to the active trip', async () => {
    const { result } = renderHook(() => useTripCapture());

    await act(() =>
      result.current.capture(entityIntent, {
        source: 'search-result',
        alreadyInActiveTrip: true,
      }),
    );

    expect(mocks.openDock).toHaveBeenCalledOnce();
    expect(mocks.addPlace).not.toHaveBeenCalled();
  });

  it('falls back to trip selection when the active trip is view-only', async () => {
    mocks.activeTrip = {
      id: 'trip-1',
      title: 'Shared weekend',
      owner_id: 'someone-else',
      membership_role: 'viewer',
    };
    const { result } = renderHook(() => useTripCapture());

    await act(() => result.current.capture(entityIntent, { source: 'venue-card' }));

    expect(result.current.dialogIntent).toEqual(entityIntent);
    expect(mocks.addPlace).not.toHaveBeenCalled();
  });

  it('blocks new additions while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useTripCapture());

    await act(() => result.current.capture(entityIntent, { source: 'map' }));

    expect(mocks.addPlace).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
