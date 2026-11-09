import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useTripReservations';
import { TripAtAGlance } from '../TripAtAGlance';

const trip = {
  id: 'trip-42',
  trip_places: [
    { id: 'venue', venue_id: 'v1', event_id: null, hotel_id: null, arrive_mode: 'transit' },
    { id: 'event', venue_id: null, event_id: 'e1', hotel_id: null, arrive_mode: 'walk' },
    { id: 'hotel', venue_id: null, event_id: null, hotel_id: 'h1', arrive_mode: null },
  ],
} as TripWithDetails;

describe('TripAtAGlance', () => {
  it('keeps transport, stays, events, and venues distinct', () => {
    const reservations = [
      { id: 'r1', type: 'flight', status: 'confirmed' },
      { id: 'r2', type: 'hotel', status: 'confirmed' },
    ] as Reservation[];
    renderWithProviders(<TripAtAGlance trip={trip} reservations={reservations} />);
    expect(screen.getByText('3 routes')).toBeInTheDocument();
    expect(screen.getByText('2 stays')).toBeInTheDocument();
    expect(screen.getAllByText('1 saved')).toHaveLength(2);
    expect(screen.getByText('2 confirmed')).toBeInTheDocument();
  });

  it('turns missing planning pieces into suggestions', () => {
    renderWithProviders(<TripAtAGlance trip={{ ...trip, trip_places: [] }} reservations={[]} />);
    expect(screen.getByText('Add transport')).toBeInTheDocument();
    expect(screen.getByText('Choose a stay')).toBeInTheDocument();
    expect(screen.getByText('Find an event')).toBeInTheDocument();
    expect(screen.getByText('Add a place')).toBeInTheDocument();
  });
});
