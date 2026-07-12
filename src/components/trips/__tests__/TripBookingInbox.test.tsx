/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';

// TripBookingInbox renders a LocalizedLink ("Review in chat") — needs a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const {
  useTripInboxMock,
  useToastMock,
  useProfileMock,
  slotMutate,
  dismissMutate,
  pasteMutate,
} = vi.hoisted(() => ({
  useTripInboxMock: vi.fn(),
  useToastMock: vi.fn(),
  useProfileMock: vi.fn(),
  slotMutate: vi.fn(),
  dismissMutate: vi.fn(),
  pasteMutate: vi.fn(),
}));

vi.mock('@/hooks/useTripInbox', () => ({ useTripInbox: useTripInboxMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: useProfileMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      if (fallback && typeof fallback === 'object' && 'defaultValue' in fallback) {
        let s = String((fallback as { defaultValue: string }).defaultValue);
        for (const [key, val] of Object.entries(fallback)) {
          if (key === 'defaultValue') continue;
          s = s.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(val));
        }
        return s;
      }
      return _k;
    },
  }),
}));

import { TripBookingInbox } from '../TripBookingInbox';

const baseHook = () => ({
  inbox: null as null | { id: string; short_id: string; revoked_at: string | null; created_at: string },
  inboxLoading: false,
  items: [] as Array<Record<string, unknown>>,
  itemsLoading: false,
  slotItem: { mutate: slotMutate, isPending: false },
  dismissItem: { mutate: dismissMutate, isPending: false },
  pasteConfirmation: { mutate: pasteMutate, mutateAsync: pasteMutate, isPending: false },
});

beforeEach(() => {
  slotMutate.mockReset();
  dismissMutate.mockReset();
  pasteMutate.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: vi.fn() });
  useProfileMock.mockReset();
  useProfileMock.mockReturnValue({ profile: { username: 'tobias' } });
});

describe('TripBookingInbox', () => {
  it('points to the user queer.guide address (no separate per-trip address)', () => {
    useTripInboxMock.mockReturnValue(baseHook());
    render(<TripBookingInbox tripId="t1" />);
    expect(screen.getByText(/Forward booking emails/i)).toBeTruthy();
    // The forward hint interpolates the user's own address.
    expect(screen.getByText(/tobias@queer\.guide/i)).toBeTruthy();
    // The retired dead-address controls are gone.
    expect(screen.queryByRole('button', { name: /Enable email forwarding/i })).toBeNull();
    expect(screen.queryByText(/inbox\.queer\.guide/i)).toBeNull();
  });

  it('offers the paste-confirmation path', () => {
    useTripInboxMock.mockReturnValue(baseHook());
    render(<TripBookingInbox tripId="t1" />);
    expect(screen.getByRole('button', { name: /Paste confirmation instead/i })).toBeTruthy();
  });

  it('renders parsed items without advertising a per-trip address', () => {
    useTripInboxMock.mockReturnValue({
      ...baseHook(),
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
    // Item title is unique; vendor appears both in the item and the hint copy.
    expect(screen.getByText(/Hotel Lutetia/i)).toBeTruthy();
    expect(screen.getAllByText(/Booking\.com/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/inbox\.queer\.guide/i)).toBeNull();
  });

  it('slots when "Slot it" button is clicked', () => {
    useTripInboxMock.mockReturnValue({
      ...baseHook(),
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
