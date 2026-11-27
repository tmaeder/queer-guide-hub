import { describe, expect, it } from 'vitest';
import { eventAddressLine } from '../eventAddress';

describe('eventAddressLine', () => {
  it('PiepShow: venue name and city are not repeated', () => {
    expect(
      eventAddressLine({
        venueName: 'KitKatClub',
        address: 'KitKatClub, Köpenicker Str. 76, 10179 Berlin',
        city: 'Berlin',
        country: 'Germany',
      }),
    ).toBe('Köpenicker Str. 76, 10179 Berlin, Germany');
  });
  it('adds the city when the address lacks it (Regenbogenhaus)', () => {
    expect(
      eventAddressLine({ address: 'Zollstrasse 117', city: 'Zürich', country: 'Switzerland' }),
    ).toBe('Zollstrasse 117, Zürich, Switzerland');
  });
  it('matches whole words, accent-insensitively', () => {
    expect(eventAddressLine({ address: 'Langstrasse 1, 8004 Zurich', city: 'Zürich' })).toBe(
      'Langstrasse 1, 8004 Zurich',
    );
    // "Bern" inside "Berner Strasse" is not the city.
    expect(eventAddressLine({ address: 'Berner Strasse 2', city: 'Bern' })).toBe(
      'Berner Strasse 2, Bern',
    );
  });
  it('keeps a lone venue-name address rather than emptying it', () => {
    expect(eventAddressLine({ venueName: 'SO36', address: 'SO36', city: 'Berlin' })).toBe(
      'SO36, Berlin',
    );
  });
  it('nothing known is null', () => {
    expect(eventAddressLine({})).toBeNull();
  });
});
