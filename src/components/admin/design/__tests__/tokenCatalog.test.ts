import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COLOR_TOKENS,
  GLOBAL_TOKENS,
  CONTRAST_PAIRS,
  resolveColor,
  countOverrides,
  pruneDoc,
} from '../tokenCatalog';

const css = readFileSync(resolve(__dirname, '../../../../index.css'), 'utf8');

const normalize = (v: string) => v.replace(/\s+/g, ' ').trim();

/** All values for `--key:` in document order. Light-only since the subway-map
 * rebrand removed dark mode: occurrence 1 = :root; there is no .dark block.
 * The catalog keeps a `dark` field for BrandingDoc shape-compat — it must
 * simply mirror `light`. */
function cssValues(key: string): string[] {
  const re = new RegExp(
    `(?<![\\w-])--${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^;]+);`,
    'g',
  );
  return [...css.matchAll(re)].map((m) => normalize(m[1]));
}

describe('tokenCatalog drift guard (defaults must match src/index.css)', () => {
  it.each(COLOR_TOKENS.map((t) => [t.key, t] as const))('color token %s', (_key, t) => {
    const values = cssValues(t.key);
    expect(values.length, `--${t.key} must appear in :root`).toBeGreaterThanOrEqual(1);
    expect(values[0], `--${t.key} light default drifted`).toBe(t.light);
    expect(t.dark, `--${t.key} dark must mirror light (dark mode removed)`).toBe(t.light);
  });

  it.each(GLOBAL_TOKENS.map((t) => [t.key, t] as const))('global token %s', (_key, t) => {
    const values = cssValues(t.key);
    expect(values.length, `--${t.key} must exist in index.css`).toBeGreaterThanOrEqual(1);
    expect(values[0], `--${t.key} default drifted`).toBe(normalize(t.default));
  });

  it('contrast pairs reference cataloged tokens only', () => {
    const keys = new Set(COLOR_TOKENS.map((t) => t.key));
    for (const pair of CONTRAST_PAIRS) {
      expect(keys.has(pair.fg), `unknown fg token ${pair.fg}`).toBe(true);
      expect(keys.has(pair.bg), `unknown bg token ${pair.bg}`).toBe(true);
    }
  });
});

describe('sparse doc helpers', () => {
  it('resolveColor prefers the override and falls back to the default', () => {
    expect(resolveColor({}, 'background', 'light')).toBe('60 16.3% 91.6%');
    expect(
      resolveColor({ tokens: { light: { background: '0 0% 90%' } } }, 'background', 'light'),
    ).toBe('0 0% 90%');
    expect(
      resolveColor({ tokens: { light: { background: '0 0% 90%' } } }, 'background', 'dark'),
    ).toBe('60 16.3% 91.6%');
  });

  it('countOverrides counts every section', () => {
    expect(countOverrides({})).toBe(0);
    expect(
      countOverrides({
        tokens: { light: { background: '0 0% 90%' }, global: { 'radius-element': '0.75rem' } },
        meta: { site_name: 'X' },
        email: { from_name: 'Y' },
      }),
    ).toBe(4);
  });

  it('pruneDoc drops empty sections', () => {
    expect(pruneDoc({ tokens: { light: {}, dark: {} }, meta: {} })).toEqual({});
    expect(pruneDoc({ tokens: { light: { background: '0 0% 90%' }, dark: {} } })).toEqual({
      tokens: { light: { background: '0 0% 90%' } },
    });
  });
});
