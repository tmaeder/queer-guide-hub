/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { insertMock, getUserMock } = vi.hoisted(() => ({
  insertMock: vi.fn(() => Promise.resolve({ data: null, error: null })),
  getUserMock: vi.fn(() =>
    Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: insertMock }),
    auth: { getUser: getUserMock },
  },
}));

import {
  trackTripEvent,
  recordSuggestionImpression,
  recordSuggestionClick,
} from '../tripTracking';

interface UmamiWindow extends Window {
  umami?: { track: (event: string, data: Record<string, string>) => void };
}

describe('trackTripEvent', () => {
  let trackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    trackSpy = vi.fn();
    (window as UmamiWindow).umami = { track: trackSpy };
  });

  it('forwards event name to window.umami.track', () => {
    trackTripEvent('trip_created');
    expect(trackSpy).toHaveBeenCalledWith('trip_created', {});
  });

  it('stringifies data values', () => {
    trackTripEvent('trip_geo_set', { lat: 52.5, count: 3, ok: true });
    expect(trackSpy).toHaveBeenCalledWith('trip_geo_set', {
      lat: '52.5',
      count: '3',
      ok: 'true',
    });
  });

  it('drops null/undefined values', () => {
    trackTripEvent('trip_geo_set', { a: 'x', b: null, c: undefined });
    expect(trackSpy).toHaveBeenCalledWith('trip_geo_set', { a: 'x' });
  });

  it('is a no-op when window.umami is missing', () => {
    delete (window as UmamiWindow).umami;
    expect(() => trackTripEvent('trip_created')).not.toThrow();
  });

  it('never throws on tracker errors', () => {
    (window as UmamiWindow).umami = {
      track: () => {
        throw new Error('boom');
      },
    };
    expect(() => trackTripEvent('trip_created')).not.toThrow();
  });
});

describe('recordSuggestionImpression', () => {
  beforeEach(() => {
    insertMock.mockClear();
    getUserMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('inserts an impression row for authenticated users', async () => {
    await recordSuggestionImpression({
      tripId: 'trip-1',
      type: 'accommodation',
      partnerId: 'p1',
      listingId: 'l1',
      externalUrl: 'https://example.com',
      rankPosition: 2,
    });

    expect(insertMock).toHaveBeenCalledWith({
      trip_id: 'trip-1',
      user_id: 'user-1',
      suggestion_type: 'accommodation',
      partner_id: 'p1',
      listing_id: 'l1',
      external_url: 'https://example.com',
      rank_position: 2,
    });
  });

  it('skips the insert when no user is signed in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    await recordSuggestionImpression({
      tripId: 'trip-1',
      type: 'flight',
    });

    expect(insertMock).not.toHaveBeenCalled();
  });

  it('never throws on supabase failure', async () => {
    getUserMock.mockRejectedValueOnce(new Error('network'));
    await expect(
      recordSuggestionImpression({ tripId: 'trip-1', type: 'rail' }),
    ).resolves.toBeUndefined();
  });
});

describe('recordSuggestionClick', () => {
  beforeEach(() => {
    insertMock.mockClear();
    getUserMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('inserts a booking-click row with user id when signed in', async () => {
    await recordSuggestionClick({
      tripId: 'trip-1',
      provider: 'Booking.com',
      type: 'accommodation',
      externalUrl: 'https://booking.com/x',
      listingId: 'l1',
      rankPosition: 0,
    });

    expect(insertMock).toHaveBeenCalledWith({
      trip_id: 'trip-1',
      user_id: 'user-1',
      provider: 'Booking.com',
      vertical: 'accommodation',
      destination_url: 'https://booking.com/x',
    });
  });

  it('inserts with null user_id when signed out', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    await recordSuggestionClick({
      tripId: 'trip-1',
      provider: 'Trainline',
      type: 'rail',
      externalUrl: 'https://thetrainline.com/x',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null, provider: 'Trainline', vertical: 'rail' }),
    );
  });

  it('never throws on supabase failure', async () => {
    getUserMock.mockRejectedValueOnce(new Error('network'));
    await expect(
      recordSuggestionClick({
        tripId: 'trip-1',
        provider: 'Omio',
        type: 'bus',
        externalUrl: 'https://omio.com/x',
      }),
    ).resolves.toBeUndefined();
  });
});
