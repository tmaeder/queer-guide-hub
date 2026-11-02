import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import de from '../de.json';
import en from '../en.json';
import { pickLanguage } from '../index';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

function leaf(obj: unknown, path: string): string {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj) as string;
}

describe('catalogs', () => {
  it('de has exactly the keys en has', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('every translation keeps the same {{placeholders}}', () => {
    for (const k of keys(en)) expect(placeholders(leaf(de, k))).toEqual(placeholders(leaf(en, k)));
  });

  it('has a label for every venue category the web vocabulary defines', () => {
    const src = readFileSync(join(__dirname, '../../../../src/lib/venueCategories.ts'), 'utf8');
    const block = src.match(/export const VENUE_CATEGORIES = \[([\s\S]*?)\]/)?.[1] ?? '';
    const categories = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(categories.length).toBeGreaterThan(10); // positive control
    expect(Object.keys(en.category).sort()).toEqual([...categories].sort());
  });
});

describe('pickLanguage', () => {
  it('takes the first supported device language', () => {
    expect(pickLanguage(['fr', 'de-CH', 'en'])).toBe('de');
  });
  it('falls back to English', () => {
    expect(pickLanguage(['ja', null, undefined])).toBe('en');
  });
});
