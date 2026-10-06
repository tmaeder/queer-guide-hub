import { describe, it, expect } from 'vitest';
import { formatPlaceLabel, regionAbbrev } from '../formatPlaceLabel';

describe('formatPlaceLabel', () => {
  it('tells same-name US cities apart', () => {
    expect(formatPlaceLabel({ city: 'Portland', regionCode: 'US-ME', country: 'United States' })).toBe(
      'Portland, ME · United States',
    );
    expect(formatPlaceLabel({ city: 'Portland', regionCode: 'US-OR', country: 'United States' })).toBe(
      'Portland, OR · United States',
    );
  });

  it('omits the region where addresses do not carry one', () => {
    expect(formatPlaceLabel({ city: 'Hamburg', regionCode: 'DE-HH', country: 'Germany' })).toBe(
      'Hamburg · Germany',
    );
  });

  it('degrades to city and country without a region code', () => {
    expect(formatPlaceLabel({ city: 'Burbank', regionCode: null, country: 'United States' })).toBe(
      'Burbank · United States',
    );
  });

  it('shows the country alone when there is no city', () => {
    expect(formatPlaceLabel({ city: null, regionCode: 'US-CA', country: 'United States' })).toBe(
      'United States',
    );
  });

  it('never shows a numeric subdivision code', () => {
    expect(regionAbbrev('BR-27')).toBeNull();
    expect(regionAbbrev('BR-SP')).toBe('SP');
    expect(regionAbbrev('MX-CMX')).toBe('CMX');
    expect(regionAbbrev('garbage')).toBeNull();
  });
});
