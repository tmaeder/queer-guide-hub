/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    updatePlace: { mutate: vi.fn(), isPending: false },
    removePlace: { mutate: vi.fn(), isPending: false },
    updateDay: { mutate: vi.fn(), isPending: false },
  }),
}));

import { DraggableItinerary } from '../DraggableItinerary';

const trip = { id: 't1', title: 'X', start_date: '2026-06-01', end_date: '2026-06-05', trip_days: [], trip_places: [] } as never;

describe('DraggableItinerary', () => {
  it('renders without crashing', () => {
    const { container } = render(<DraggableItinerary trip={trip} onAddPlace={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
