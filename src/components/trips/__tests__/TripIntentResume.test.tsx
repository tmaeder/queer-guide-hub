/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storeTripCapture } from '@/lib/trips/tripCaptureIntent';

const mocks = vi.hoisted(() => ({
  pathname: '/events/pride',
  navigate: vi.fn(),
  openDock: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({ openDock: mocks.openDock }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => mocks.navigate,
}));
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: mocks.pathname }) }));
vi.mock('@/utils/tripTracking', () => ({ trackTripEvent: mocks.track }));
vi.mock('@/components/trips/AddToTripDialog', () => ({
  AddToTripDialog: ({ entity }: { entity: { name: string } }) => (
    <div>Resume add {entity.name}</div>
  ),
}));
vi.mock('@/components/trips/CreateTripDialog', () => ({
  CreateTripDialog: () => <div>Resume trip creation</div>,
}));

import { TripIntentResume } from '../TripIntentResume';

describe('TripIntentResume', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.pathname = '/events/pride';
  });

  it('returns to the originating surface and resumes the exact entity action', async () => {
    storeTripCapture(
      { kind: 'add_entity', entity: { type: 'event', id: 'event-1', name: 'Zurich Pride' } },
      { source: 'pride-spotlight', returnTo: '/events/pride?week=1', now: Date.now() },
    );

    render(<TripIntentResume />);

    expect(await screen.findByText('Resume add Zurich Pride')).toBeInTheDocument();
    expect(mocks.navigate).toHaveBeenCalledWith('/events/pride?week=1', { replace: true });
    expect(mocks.track).toHaveBeenCalledWith(
      'trip_intent_resumed',
      expect.objectContaining({ kind: 'add_entity', auth_state: 'signed_in' }),
    );
  });

  it('does not consume the pending intent while authentication is still active', async () => {
    mocks.pathname = '/auth';
    storeTripCapture(
      {
        kind: 'start_destination',
        destination: {
          cityId: 'city-1',
          cityName: 'Berlin',
          countryId: 'country-1',
          countryName: 'Germany',
          countryCode: 'DE',
          timezone: 'Europe/Berlin',
        },
      },
      { source: 'city-detail', returnTo: '/city/berlin', now: Date.now() },
    );

    render(<TripIntentResume />);
    await waitFor(() => expect(mocks.navigate).not.toHaveBeenCalled());
    expect(screen.queryByText('Resume trip creation')).not.toBeInTheDocument();
  });
});
