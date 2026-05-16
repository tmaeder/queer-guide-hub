/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/utils/equalityScore', () => ({ getScoreRingColor: () => '#0f0' }));
vi.mock('../PlaceBookableLinks', () => ({ PlaceBookableLinks: () => <div data-testid="links" /> }));
vi.mock('../AddReservationDialog', () => ({ AddReservationDialog: () => null }));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: () => ({
    data: [
      { id: 'r1', confirmation_code: 'ABC123', title: 'My Venue' },
    ],
  }),
  useReservationMutations: () => ({ addReservation: { mutateAsync: vi.fn() } }),
}));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ updatePlace: { mutateAsync: vi.fn() } }),
}));

import { SortablePlaceCard } from '../SortablePlaceCard';

function wrap(ui: React.ReactNode, ids: string[]) {
  return (
    <DndContext>
      <SortableContext items={ids}>{ui}</SortableContext>
    </DndContext>
  );
}

const base = {
  id: 'p1',
  trip_id: 't1',
  venues: { name: 'My Venue' },
  countries: null,
} as never;

describe('SortablePlaceCard booking status badges', () => {
  it('renders "Not booked" badge + Mark booked button when status=intent', () => {
    const place = { ...base, booking_status: 'intent', reservation_id: null };
    render(wrap(<SortablePlaceCard place={place} onDelete={vi.fn()} />, ['p1']));
    expect(screen.getByTestId('booking-badge-intent')).toBeInTheDocument();
    expect(screen.getByTestId('mark-booked-btn')).toBeInTheDocument();
  });

  it('renders "Booked" badge with confirmation code when status=booked', () => {
    const place = { ...base, booking_status: 'booked', reservation_id: 'r1' };
    render(wrap(<SortablePlaceCard place={place} onDelete={vi.fn()} />, ['p1']));
    const badge = screen.getByTestId('booking-badge-booked');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Booked');
    expect(badge.textContent).toContain('ABC123');
    expect(screen.queryByTestId('mark-booked-btn')).not.toBeInTheDocument();
  });

  it('renders "Visited" badge when status=completed', () => {
    const place = { ...base, booking_status: 'completed', reservation_id: null };
    render(wrap(<SortablePlaceCard place={place} onDelete={vi.fn()} />, ['p1']));
    expect(screen.getByTestId('booking-badge-completed')).toBeInTheDocument();
  });

  it('falls back to intent badge when booking_status is missing', () => {
    const place = { ...base } as never;
    render(wrap(<SortablePlaceCard place={place} onDelete={vi.fn()} />, ['p1']));
    expect(screen.getByTestId('booking-badge-intent')).toBeInTheDocument();
  });
});
