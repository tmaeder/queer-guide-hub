import { describe, it, expect, beforeEach } from 'vitest';
import { bookingRegistry } from '../registry';
import type { BookingProvider, BookingResult } from '../types';

function makeProvider(
  name: string,
  vertical: 'hotel' | 'activity' | 'flight',
  results: BookingResult[],
): BookingProvider {
  return {
    name,
    vertical,
    supportsInApp: false,
    search: async () => results,
  };
}

const PROVIDERS_TO_CLEAN = [
  'hotel:p1', 'hotel:p2', 'hotel:broken',
  'activity:tours',
];

describe('bookingRegistry', () => {
  beforeEach(() => {
    // The registry is a singleton — clean up any providers we registered.
    for (const key of PROVIDERS_TO_CLEAN) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (bookingRegistry as any).providers.delete(key);
    }
  });

  it('returns empty array when no providers are registered for a vertical', async () => {
    const result = await bookingRegistry.search({ vertical: 'hotel' });
    expect(result).toEqual([]);
  });

  it('registers a provider keyed by vertical:name', () => {
    const p = makeProvider('p1', 'hotel', []);
    bookingRegistry.register(p);
    expect(bookingRegistry.getProvider('hotel', 'p1')).toBe(p);
  });

  it('filters getProviders by vertical', () => {
    bookingRegistry.register(makeProvider('p1', 'hotel', []));
    bookingRegistry.register(makeProvider('tours', 'activity', []));

    const hotels = bookingRegistry.getProviders('hotel');
    expect(hotels.map(p => p.name)).toContain('p1');
    expect(hotels.every(p => p.vertical === 'hotel')).toBe(true);
  });

  it('aggregates and sorts results from all matching providers by price', async () => {
    bookingRegistry.register(
      makeProvider('p1', 'hotel', [
        {
          id: 'a',
          provider: 'p1',
          vertical: 'hotel',
          title: 'Expensive',
          price: 300,
          currency: 'EUR',
          supportsInApp: false,
        },
      ]),
    );
    bookingRegistry.register(
      makeProvider('p2', 'hotel', [
        {
          id: 'b',
          provider: 'p2',
          vertical: 'hotel',
          title: 'Cheap',
          price: 80,
          currency: 'EUR',
          supportsInApp: false,
        },
      ]),
    );

    const results = await bookingRegistry.search({ vertical: 'hotel' });
    expect(results.map(r => r.title)).toEqual(['Cheap', 'Expensive']);
  });

  it('ignores rejected providers (Promise.allSettled)', async () => {
    bookingRegistry.register(makeProvider('p1', 'hotel', [
      {
        id: 'a',
        provider: 'p1',
        vertical: 'hotel',
        title: 'OK',
        price: 100,
        currency: 'EUR',
        supportsInApp: false,
      },
    ]));
    bookingRegistry.register({
      name: 'broken',
      vertical: 'hotel',
      supportsInApp: false,
      search: async () => {
        throw new Error('provider died');
      },
    });

    const results = await bookingRegistry.search({ vertical: 'hotel' });
    expect(results.map(r => r.title)).toEqual(['OK']);
  });
});
