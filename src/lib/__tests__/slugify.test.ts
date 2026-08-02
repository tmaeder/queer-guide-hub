import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('folds combining accents', () => {
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('Jalapeños')).toBe('jalapenos');
    expect(slugify('Crème-Brûlée')).toBe('creme-brulee');
    expect(slugify('Müllerian')).toBe('mullerian');
    expect(slugify('Beyoncé')).toBe('beyonce');
  });

  // NFKD leaves these alone — they are distinct letters, not base + mark.
  // Before this was handled, `Straße` became "stra-e" and `Łódź` became "odz".
  it('folds letters NFKD does not decompose', () => {
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Ærø')).toBe('aero');
    expect(slugify('Œuvre')).toBe('oeuvre');
    expect(slugify('Łódź')).toBe('lodz');
  });

  it('leaves plain ASCII and namespaced slugs untouched', () => {
    expect(slugify('mat-vegan-leather')).toBe('mat-vegan-leather');
    expect(slugify('gay-bar')).toBe('gay-bar');
  });

  it('collapses punctuation runs and trims hyphens', () => {
    expect(slugify('Café & Bar!')).toBe('cafe-bar');
    expect(slugify("Don't Ask Don't Tell")).toBe('don-t-ask-don-t-tell');
    expect(slugify('  --Hello--  ')).toBe('hello');
  });

  // Every expectation above is also asserted in Postgres by
  // normalize_tag_slug(); the two implementations must not drift.
  it('matches the Postgres normalize_tag_slug fixtures', () => {
    const fixtures: Array<[string, string]> = [
      ['Café', 'cafe'],
      ['Jalapeño-Poppers', 'jalapeno-poppers'],
      ['München', 'munchen'],
      ['Jägermeister', 'jagermeister'],
      ['Cachaça', 'cachaca'],
      ['mat-vegan-leather', 'mat-vegan-leather'],
    ];
    for (const [input, expected] of fixtures) expect(slugify(input)).toBe(expected);
  });
});
