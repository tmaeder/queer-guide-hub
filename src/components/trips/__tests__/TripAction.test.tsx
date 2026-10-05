/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeTrip: { id: 'trip-1', title: 'Berlin weekend' } as { id: string; title: string } | null,
  tripIds: [] as string[],
  capture: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, values?: Record<string, string>) =>
      fallback.replace('{{trip}}', values?.trip ?? '').replace('{{city}}', values?.city ?? ''),
  }),
}));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({ activeTrip: mocks.activeTrip }),
}));
vi.mock('@/hooks/useEntityTripStatus', () => ({
  useEntityTripStatus: () => ({ data: { tripIds: mocks.tripIds }, isLoading: false }),
}));
vi.mock('@/hooks/useTripCapture', () => ({
  useTripCapture: () => ({
    capture: mocks.capture,
    dialogIntent: null,
    closeDialog: vi.fn(),
    isPending: false,
  }),
}));

import { TripAction } from '../TripAction';

const intent = {
  kind: 'add_entity' as const,
  entity: { type: 'venue' as const, id: 'venue-1', name: 'SchwuZ' },
};

describe('TripAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeTrip = { id: 'trip-1', title: 'Berlin weekend' };
    mocks.tripIds = [];
  });

  it('names the active trip and captures the direct action', () => {
    render(<TripAction intent={intent} source="venue-detail" />);

    const action = screen.getByRole('button', { name: 'Add to Berlin weekend' });
    fireEvent.click(action);
    expect(mocks.capture).toHaveBeenCalledWith(intent, {
      source: 'venue-detail',
      alreadyInActiveTrip: false,
    });
  });

  it('shows the duplicate state and sends it through the dock path', () => {
    mocks.tripIds = ['trip-1'];
    render(<TripAction intent={intent} source="venue-detail" />);

    const action = screen.getByRole('button', { name: 'In Berlin weekend' });
    fireEvent.click(action);
    expect(mocks.capture).toHaveBeenCalledWith(intent, {
      source: 'venue-detail',
      alreadyInActiveTrip: true,
    });
  });

  it('falls back to trip selection language when there is no active trip', () => {
    mocks.activeTrip = null;
    render(<TripAction intent={intent} source="saved-item" />);
    expect(screen.getByRole('button', { name: 'Add to a trip' })).toBeInTheDocument();
  });
});
