/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  useTripInboxMock,
  useToastMock,
  enableMutate,
  revokeMutate,
  slotMutate,
  dismissMutate,
  pasteMutate,
} = vi.hoisted(() => ({
  useTripInboxMock: vi.fn(),
  useToastMock: vi.fn(),
  enableMutate: vi.fn(),
  revokeMutate: vi.fn(),
  slotMutate: vi.fn(),
  dismissMutate: vi.fn(),
  pasteMutate: vi.fn(),
}));

vi.mock('@/hooks/useTripInbox', () => ({ useTripInbox: useTripInboxMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : _k,
  }),
}));

import { TripBookingInbox } from '../TripBookingInbox';

const baseHook = () => ({
  address: null as string | null,
  inbox: null as null | { id: string; short_id: string; revoked_at: string | null; created_at: string },
  inboxLoading: false,
  items: [] as Array<Record<string, unknown>>,
  itemsLoading: false,
  enable: { mutate: enableMutate, isPending: false },
  revoke: { mutate: revokeMutate, isPending: false },
  regenerate: vi.fn(),
  slotItem: { mutate: slotMutate, isPending: false },
  dismissItem: { mutate: dismissMutate, isPending: false },
  pasteConfirmation: { mutate: pasteMutate, mutateAsync: pasteMutate, isPending: false },
});

beforeEach(() => {
  enableMutate.mockReset();
  revokeMutate.mockReset();
  slotMutate.mockReset();
  dismissMutate.mockReset();
  pasteMutate.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: vi.fn() });
});

describe('TripBookingInbox', () => {
  it('renders opt-in CTA when no inbox is enabled', () => {
    useTripInboxMock.mockReturnValue(baseHook());
    render(<TripBookingInbox tripId="t1" />);
    expect(screen.getByText(/Forward booking emails/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enable email forwarding/i })).toBeTruthy();
  });

  it('calls enable.mutate when CTA is clicked', () => {
    useTripInboxMock.mockReturnValue(baseHook());
    render(<TripBookingInbox tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Enable email forwarding/i }));
    expect(enableMutate).toHaveBeenCalledTimes(1);
  });

  it('shows the address and parsed items once enabled', () => {
    useTripInboxMock.mockReturnValue({
      ...baseHook(),
      address: 'trip-abc123@inbox.queer.guide',
      inbox: { id: 'i1', short_id: 'abc123', revoked_at: null, created_at: '2026-05-01' },
      items: [
        {
          id: 'item1',
          trip_id: 't1',
          raw_subject: 'Booking confirmed',
          raw_from: 'noreply@booking.com',
          parse_status: 'parsed',
          parse_confidence: 0.92,
          parsed_type: 'lodging',
          parsed_vendor: 'Booking.com',
          parsed_title: 'Hotel Lutetia',
          parsed_start_at: '2026-06-01T15:00:00Z',
          parsed_end_at: '2026-06-04T11:00:00Z',
          parsed_location: 'Paris',
          parsed_price: 482,
          parsed_currency: 'EUR',
          parsed_confirmation: 'ABC123',
          slotted_reservation_id: null,
          created_at: '2026-05-01',
        },
      ],
    });
    render(<TripBookingInbox tripId="t1" />);
    expect(screen.getByText('trip-abc123@inbox.queer.guide')).toBeTruthy();
    expect(screen.getByText(/Hotel Lutetia/i)).toBeTruthy();
    expect(screen.getByText(/Booking.com/i)).toBeTruthy();
  });

  it('slots when "Slot it" button is clicked', () => {
    useTripInboxMock.mockReturnValue({
      ...baseHook(),
      address: 'trip-abc@inbox.queer.guide',
      inbox: { id: 'i1', short_id: 'abc', revoked_at: null, created_at: '2026-05-01' },
      items: [
        {
          id: 'item1',
          trip_id: 't1',
          raw_subject: 'X',
          raw_from: 'x',
          parse_status: 'parsed',
          parse_confidence: 0.6,
          parsed_type: 'flight',
          parsed_vendor: 'Lufthansa',
          parsed_title: 'LH441 FRA → JFK',
          parsed_start_at: null,
          parsed_end_at: null,
          parsed_location: null,
          parsed_price: null,
          parsed_currency: null,
          parsed_confirmation: null,
          slotted_reservation_id: null,
          created_at: '2026-05-01',
        },
      ],
    });
    render(<TripBookingInbox tripId="t1" />);
    fireEvent.click(screen.getByRole('button', { name: /Slot it/i }));
    expect(slotMutate).toHaveBeenCalledWith('item1');
  });
});
