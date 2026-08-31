import { describe, it, expect } from 'vitest';

import { readCityAirports, resolveCityAirports } from '../cityAirports';

/**
 * The cases here are the live prod rows the fix was measured against
 * (2026-08-26), not invented shapes: 3,669 of the 4,669 cities carrying an
 * airport code named an airport that is not theirs.
 */
describe('readCityAirports', () => {
  it('reads numeric(6,1) km back from the string PostgREST sends', () => {
    expect(readCityAirports({ nearest_airport_km: '36.4' }).dbNearestKm).toBe(36);
    expect(readCityAirports({ nearest_airport_km: 23.6 }).dbNearestKm).toBe(24);
  });

  it('treats a missing, empty or unparseable distance as absent', () => {
    expect(readCityAirports({}).dbNearestKm).toBeNull();
    expect(readCityAirports({ nearest_airport_km: null }).dbNearestKm).toBeNull();
    expect(readCityAirports({ nearest_airport_km: '' }).dbNearestKm).toBeNull();
    expect(readCityAirports({ nearest_airport_km: 'n/a' }).dbNearestKm).toBeNull();
  });

  it('skips the [null] junk shape rather than returning it as a code', () => {
    const row = { local_airport_codes: [null, 'CGN'] } as unknown;
    expect(readCityAirports(row).localIata).toBe('CGN');
    expect(readCityAirports({ local_airport_codes: [] }).localIata).toBeNull();
    expect(readCityAirports({ local_airport_codes: null }).localIata).toBeNull();
  });

  it('survives a null city', () => {
    expect(readCityAirports(null)).toEqual({
      localIata: null,
      dbNearestIata: null,
      dbNearestKm: null,
    });
  });
});

describe('resolveCityAirports', () => {
  it('BRIGHTON: does not claim an airport 36 km away', () => {
    // Live row: major LGW, airport_codes {LGW}, local NULL, nearest {LGW} 36.4km.
    // The old gate read airport_codes and published "AIRPORT LGW".
    const view = resolveCityAirports(
      {
        airport_codes: ['LGW'],
        local_airport_codes: null,
        nearest_airport_codes: ['LGW'],
        nearest_airport_km: '36.4',
      },
      null,
      'LGW',
    );

    expect(view.hasAirport).toBe(false);
    expect(view.displayIata).toBe('LGW');
    expect(view.nearestAirport).toEqual({ iata_code: 'LGW', distanceKm: 36 });
    // Booking is unaffected — LGW is still where you fly for Brighton.
    expect(view.bookingIata).toBe('LGW');
  });

  it('BERLIN: a city with its own airport still claims it outright', () => {
    const view = resolveCityAirports(
      { local_airport_codes: ['BER'], nearest_airport_codes: null, nearest_airport_km: null },
      null,
      'BER',
    );

    expect(view.hasAirport).toBe(true);
    expect(view.displayIata).toBe('BER');
    expect(view.nearestAirport).toBeNull();
    expect(view.bookingIata).toBe('BER');
  });

  it('COLOGNE: shows its OWN airport but still books the major one', () => {
    // The migration measured and rejected re-pointing major_airport_code at the
    // local airport, so display and booking legitimately disagree here.
    const view = resolveCityAirports(
      {
        local_airport_codes: ['CGN'],
        nearest_airport_codes: ['DUS'],
        nearest_airport_km: '41.4',
      },
      null,
      'DUS',
    );

    expect(view.hasAirport).toBe(true);
    expect(view.displayIata).toBe('CGN');
    expect(view.bookingIata).toBe('DUS');
    // No "nearest airport" fact — the city has one of its own.
    expect(view.nearestAirport).toBeNull();
  });

  it('prefers the vetted DB answer over the ungated client-side fallback', () => {
    const view = resolveCityAirports(
      { nearest_airport_codes: ['BCN'], nearest_airport_km: '23.6' },
      { iata_code: 'QQQ', distanceKm: 4 },
      null,
    );

    expect(view.displayIata).toBe('BCN');
    expect(view.nearestAirport).toEqual({ iata_code: 'BCN', distanceKm: 24 });
  });

  it('falls back to the hook only when the linker resolved nothing', () => {
    const view = resolveCityAirports({}, { iata_code: 'XXX', distanceKm: 88 }, null);

    expect(view.hasAirport).toBe(false);
    expect(view.displayIata).toBe('XXX');
    expect(view.nearestAirport).toEqual({ iata_code: 'XXX', distanceKm: 88 });
  });

  it('reports no airport at all rather than inventing one', () => {
    const view = resolveCityAirports({}, null, null);

    expect(view.hasAirport).toBe(false);
    expect(view.displayIata).toBeNull();
    expect(view.bookingIata).toBeNull();
    expect(view.nearestAirport).toBeNull();
  });

  it('carries a nearby code with no known distance without fabricating one', () => {
    const view = resolveCityAirports(
      { nearest_airport_codes: ['SSA'], nearest_airport_km: null },
      null,
      null,
    );

    expect(view.nearestAirport).toEqual({ iata_code: 'SSA', distanceKm: null });
  });
});
