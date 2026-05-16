import { describe, it, expect } from 'vitest';
import { CITY_TAB_DEFS } from '../CityTabDefs';

describe('CITY_TAB_DEFS', () => {
  it('is a non-empty array', () => {
    expect(CITY_TAB_DEFS.length).toBeGreaterThan(0);
  });
});
