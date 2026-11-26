import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const directory = new URL('../../i18n/locales/', import.meta.url);
const paths = [
  'pages.personalities.ui.letterFilter',
  'pages.personalities.ui.unmappedCount',
  'pages.personalities.view.mapLabel',
  'map.nav.zoomIn',
  'map.nav.zoomOut',
  'map.nav.resetNorth',
  'map.nav.geolocate',
];
const lookup = (resource: Record<string, unknown>, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      resource,
    );
const tokens = (value: string) => [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const english = JSON.parse(readFileSync(new URL('en.json', directory), 'utf8'));

describe('personality discovery translation publication', () => {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    it(`${file} contains real discovery translations and preserves interpolation tokens`, () => {
      const resource = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
      for (const path of paths) {
        const value = lookup(resource, path);
        expect(typeof value, `${file}:${path}`).toBe('string');
        expect((value as string).trim(), `${file}:${path}`).not.toBe('');
        expect(value, `${file}:${path} must not publish a tagged English placeholder`).not.toMatch(
          /^\[[A-Z]{2,3}\]/,
        );
        expect(tokens(value as string), `${file}:${path}`).toEqual(
          tokens(lookup(english, path) as string),
        );
      }
    });
  }
});
