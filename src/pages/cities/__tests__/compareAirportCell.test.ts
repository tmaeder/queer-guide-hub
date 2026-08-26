import { describe, it, expect } from 'vitest';

import { cityAirportCell } from '@/pages/city-detail/cityAirports';

/**
 * The `/cities/compare` table header reads "Airport", so a flat
 * `major_airport_code` told the reader Brighton owns Gatwick — the same claim
 * the city single was publishing until 2026-08-26. Cases are live prod rows.
 */
describe('city compare — airport cell', () => {
  it('BRIGHTON: marks a booking airport in another city as nearby', () => {
    expect(cityAirportCell({ local_airport_codes: null }, 'LGW')).toBe('~LGW');
  });

  it('BERLIN: names the airport the city actually has', () => {
    expect(cityAirportCell({ local_airport_codes: ['BER'] }, 'BER')).toBe('BER');
  });

  it('COLOGNE: prefers the local airport over the booking one', () => {
    // major_airport_code is DUS (41 km away); Cologne's own airport is CGN.
    expect(cityAirportCell({ local_airport_codes: ['CGN'] }, 'DUS')).toBe('CGN');
  });

  it('renders the em dash rather than inventing an airport', () => {
    expect(cityAirportCell({ local_airport_codes: null }, null)).toBe('—');
    expect(cityAirportCell({}, undefined)).toBe('—');
    expect(cityAirportCell(null, null)).toBe('—');
  });

  it('ignores the [null] junk shape a legacy row can still hold', () => {
    expect(cityAirportCell({ local_airport_codes: [null] }, 'SSA')).toBe('~SSA');
  });
});
