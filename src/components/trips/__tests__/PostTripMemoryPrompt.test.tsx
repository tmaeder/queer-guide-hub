/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TripWithDetails } from '@/hooks/useTrips';

const {
  useAuthMock,
  useToastMock,
  useMyPlaceMarksMock,
  useTripReservationsMock,
  useQueryClientMock,
  untypedFromMock,
  upsertMock,
  toastFn,
  invalidateMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useToastMock: vi.fn(),
  useMyPlaceMarksMock: vi.fn(),
  useTripReservationsMock: vi.fn(),
  useQueryClientMock: vi.fn(),
  untypedFromMock: vi.fn(),
  upsertMock: vi.fn(),
  toastFn: vi.fn(),
  invalidateMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/usePlaceMarks', () => ({ useMyPlaceMarks: useMyPlaceMarksMock }));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: useTripReservationsMock,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: useQueryClientMock };
});
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: (...args: unknown[]) => untypedFromMock(...args),
}));

import { PostTripMemoryPrompt } from '../PostTripMemoryPrompt';

function makeTrip(overrides: Partial<TripWithDetails> = {}): TripWithDetails {
  return {
    id: 'trip-1',
    owner_id: 'u-1',
    title: 'Trip',
    description: null,
    cover_image_url: null,
    start_date: '2026-04-01',
    end_date: '2026-04-10',
    currency: 'EUR',
    status: 'completed',
    is_public: false,
    created_at: '2026-04-01',
    updated_at: '2026-04-01',
    primary_city_id: null,
    primary_country_id: null,
    primary_city_name: null,
    primary_country_code: null,
    timezone: null,
    trip_members: [],
    trip_days: [],
    trip_places: [
      {
        id: 'p1',
        trip_id: 'trip-1',
        day_id: null,
        venue_id: 'v1',
        event_id: null,
        hotel_id: null,
        custom_name: null,
        custom_address: null,
        latitude: null,
        longitude: null,
        city_id: null,
        country_id: null,
        start_time: null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: null,
        sort_order: 0,
        created_by: null,
        created_at: '2026-04-02',
        booking_status: 'booked',
        reservation_id: null,
        venues: { id: 'v1', name: 'Cool Bar', category: null, images: null, address: null },
        events: null,
        hotels: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useMyPlaceMarksMock.mockReset();
  useTripReservationsMock.mockReset();
  useQueryClientMock.mockReset();
  untypedFromMock.mockReset();
  upsertMock.mockReset();
  toastFn.mockReset();
  invalidateMock.mockReset();

  useAuthMock.mockReturnValue({ user: { id: 'u-1' } });
  useToastMock.mockReturnValue({ toast: toastFn });
  useMyPlaceMarksMock.mockReturnValue({ data: [] });
  useTripReservationsMock.mockReturnValue({ data: [] });
  useQueryClientMock.mockReturnValue({ invalidateQueries: invalidateMock });
  upsertMock.mockResolvedValue({ error: null });
  untypedFromMock.mockReturnValue({ upsert: upsertMock });
});

describe('PostTripMemoryPrompt', () => {
  it('does not render when trip end_date is in the future', () => {
    const future = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const { container } = render(
      <PostTripMemoryPrompt trip={makeTrip({ end_date: future })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render when all places already marked visited', () => {
    useMyPlaceMarksMock.mockReturnValue({
      data: [{ entity_type: 'venue', entity_id: 'v1', mark_type: 'visited' }],
    });
    const { container } = render(<PostTripMemoryPrompt trip={makeTrip()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders and bulk-inserts on confirm when past end_date', async () => {
    render(<PostTripMemoryPrompt trip={makeTrip()} />);
    expect(screen.getByText(/Cool Bar/)).toBeInTheDocument();
    // Tick the candidate
    fireEvent.click(screen.getByLabelText(/Mark Cool Bar visited/));
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(untypedFromMock).toHaveBeenCalledWith('user_place_marks');
    const rows = upsertMock.mock.calls[0][0];
    expect(rows).toEqual([
      expect.objectContaining({
        user_id: 'u-1',
        entity_type: 'venue',
        entity_id: 'v1',
        mark_type: 'visited',
        trip_id: 'trip-1',
      }),
    ]);
  });
});
