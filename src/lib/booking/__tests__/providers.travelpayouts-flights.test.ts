import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());
const buildAviasalesUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock('@/utils/aviasalesUrl', () => ({
  buildAviasalesUrl: buildAviasalesUrlMock,
}));

import { travelpayoutsFlights } from '../providers/travelpayouts-flights';

beforeEach(() => {
  invokeMock.mockReset();
  buildAviasalesUrlMock.mockReset();
  buildAviasalesUrlMock.mockReturnValue({ url: 'https://av.example/x', valid: true });
});

describe('travelpayoutsFlights identity', () => {
  it('declares name, vertical, in-app=false', () => {
    expect(travelpayoutsFlights.name).toBe('travelpayouts');
    expect(travelpayoutsFlights.vertical).toBe('flight');
    expect(travelpayoutsFlights.supportsInApp).toBe(false);
  });
});

describe('travelpayoutsFlights.search', () => {
  it('returns empty array when originIata is missing', async () => {
    const r = await travelpayoutsFlights.search({ vertical: 'flight' });
    expect(r).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("calls edge function with type='popular_routes' when no destination", async () => {
    invokeMock.mockResolvedValueOnce({ data: { deals: [] }, error: null });
    await travelpayoutsFlights.search({ vertical: 'flight', originIata: 'BER' });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.type).toBe('popular_routes');
    expect(opts.body.origin).toBe('BER');
    expect(opts.body.destination).toBeUndefined();
  });

  it("calls edge function with type='flights' when destination provided", async () => {
    invokeMock.mockResolvedValueOnce({ data: { deals: [] }, error: null });
    await travelpayoutsFlights.search({
      vertical: 'flight',
      originIata: 'BER',
      destinationIata: 'JFK',
    });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.type).toBe('flights');
    expect(opts.body.destination).toBe('JFK');
  });

  it('returns empty array when edge function errors', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const r = await travelpayoutsFlights.search({ vertical: 'flight', originIata: 'BER' });
    expect(r).toEqual([]);
  });

  it('maps deals to BookingResult and uses buildAviasalesUrl', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        deals: [
          {
            origin: 'BER',
            destination: 'JFK',
            departure_date: '2026-07-01',
            return_date: '2026-07-15',
            price: 450,
            currency: 'eur',
            airline: 'LH',
            stops: 1,
            duration: 720,
          },
        ],
      },
      error: null,
    });

    const r = await travelpayoutsFlights.search({
      vertical: 'flight',
      originIata: 'BER',
      destinationIata: 'JFK',
    });

    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      provider: 'travelpayouts',
      vertical: 'flight',
      title: 'BER → JFK',
      price: 450,
      currency: 'eur',
      originIata: 'BER',
      destinationIata: 'JFK',
      airline: 'LH',
      stops: 1,
      duration: 720,
      bookingUrl: 'https://av.example/x',
      supportsInApp: false,
    });
    expect(buildAviasalesUrlMock).toHaveBeenCalledWith({
      origin: 'BER',
      destination: 'JFK',
      departDate: '2026-07-01',
      returnDate: '2026-07-15',
    });
  });

  it('falls back to deal.affiliate_url when aviasales URL is empty', async () => {
    buildAviasalesUrlMock.mockReturnValueOnce({ url: '', valid: false });
    invokeMock.mockResolvedValueOnce({
      data: {
        deals: [
          {
            origin: 'BER',
            destination: 'JFK',
            price: 200,
            affiliate_url: 'https://affiliate/fallback',
          },
        ],
      },
      error: null,
    });

    const r = await travelpayoutsFlights.search({ vertical: 'flight', originIata: 'BER' });
    expect(r[0].bookingUrl).toBe('https://affiliate/fallback');
  });
});

describe('travelpayoutsFlights.getBookingUrl', () => {
  it('returns the result bookingUrl when present', () => {
    const url = travelpayoutsFlights.getBookingUrl!({
      id: 'x',
      provider: 'travelpayouts',
      vertical: 'flight',
      title: 'x',
      price: 1,
      currency: 'eur',
      bookingUrl: 'https://av.example/y',
      supportsInApp: false,
    });
    expect(url).toBe('https://av.example/y');
  });

  it('falls back to the canonical Aviasales affiliate URL', () => {
    const url = travelpayoutsFlights.getBookingUrl!({
      id: 'x',
      provider: 'travelpayouts',
      vertical: 'flight',
      title: 'x',
      price: 1,
      currency: 'eur',
      supportsInApp: false,
    });
    expect(url).toBe('https://www.aviasales.com/?marker=452012');
  });
});
