import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { resolveTripTitle } from '../tripTitle';

// Mimic react-i18next's t(): resolve known keys with interpolation, otherwise
// return the provided default or the key itself — never a "raw key leakage".
const makeT = (): TFunction => {
  const dict: Record<string, string> = {
    'trips.dialog.create.defaultTitle': 'Trip to {{city}}',
    'trips.card.untitled': 'Untitled trip',
  };
  const t = ((key: string, opts?: unknown) => {
    const template = dict[key];
    if (!template) {
      if (typeof opts === 'string') return opts;
      return key;
    }
    const city = (opts as { city?: string } | undefined)?.city;
    return city ? template.replace('{{city}}', city) : template;
  }) as unknown as TFunction;
  return t;
};

describe('resolveTripTitle', () => {
  const t = makeT();

  it('returns the user-entered title when present', () => {
    expect(
      resolveTripTitle(
        { title: 'Berlin Pride 2026', primary_city_name: 'Berlin' },
        t,
      ),
    ).toBe('Berlin Pride 2026');
  });

  it('localizes a fallback when title is empty and a city exists', () => {
    expect(
      resolveTripTitle({ title: '', primary_city_name: 'Berlin' }, t),
    ).toBe('Trip to Berlin');
  });

  it('localizes a fallback when title is whitespace only', () => {
    expect(
      resolveTripTitle({ title: '   ', primary_city_name: 'Paris' }, t),
    ).toBe('Trip to Paris');
  });

  it('never renders the raw i18n key even if persisted in the DB', () => {
    // Regression: earlier versions could persist the literal key
    const result = resolveTripTitle(
      {
        title: 'trips.dialog.create.defaultTitle',
        primary_city_name: 'Berlin',
      },
      t,
    );
    expect(result).toBe('Trip to Berlin');
    expect(result).not.toContain('trips.dialog.create.defaultTitle');
  });

  it('falls back to an untitled label when no city is known', () => {
    expect(
      resolveTripTitle({ title: '', primary_city_name: null }, t),
    ).toBe('Untitled trip');
  });

  it('legacy null-title trip with no city still returns a human label', () => {
    // Regression: legacy rows where title is NULL and no city is set
    // previously leaked the raw key via a find()-?. chain.
    const result = resolveTripTitle(
      { title: null as unknown as string, primary_city_name: null },
      t,
    );
    expect(result).toBe('Untitled trip');
    expect(result).not.toMatch(/trips\.[a-z.]+/);
  });

  it('legacy null-title trip with primary_city_name localizes', () => {
    const result = resolveTripTitle(
      { title: null as unknown as string, primary_city_name: 'Lisbon' },
      t,
    );
    expect(result).toBe('Trip to Lisbon');
    expect(result).not.toMatch(/trips\.[a-z.]+/);
  });
});
