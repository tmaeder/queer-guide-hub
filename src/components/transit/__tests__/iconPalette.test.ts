import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { C, G, M, Y, ink, paper } from '../iconDefs';

/**
 * Drift test: the icon system's hex literals against the tokens in
 * `src/index.css`.
 *
 * `iconDefs.ts` is the one place in `src/` outside the sanctioned functional
 * palettes that writes brand colour as a hex literal, and it has to: the map's
 * pin rasteriser serialises an icon standalone into a data-URI, where there is
 * no document for `hsl(var(--track-pink))` to resolve against. The literal is
 * unavoidable; a SECOND, SILENTLY DIVERGING copy of the palette is not, and
 * this is what stops the exemption becoming one.
 *
 * It reads the stylesheet rather than a copied table for the same reason —
 * a hand-maintained expected-value list here would be a third copy.
 */

const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

/**
 * `--track-pink: 330 100% 56%;` → `#FF1F8F`.
 *
 * The `hsl(` wrapper is optional because the stylesheet uses BOTH forms: the
 * track tokens are bare channel triples (they are composed into `hsl()` at the
 * `--color-*` layer), while the mode-independent neutrals are written as whole
 * `hsl(...)` colours. A regex that assumed one form silently matched nothing
 * for the other and failed as a value mismatch rather than a parse failure.
 */
function tokenHex(name: string): string {
  const m = css.match(
    new RegExp(`--${name}:\\s*(?:hsl\\()?([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`),
  );
  if (!m) throw new Error(`--${name} not found in src/index.css`);
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n: number) =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(0)}${hex(8)}${hex(4)}`.toUpperCase();
}

describe('icon palette', () => {
  // A positive control. Every assertion below reads the stylesheet, and a
  // stylesheet that failed to load, or a regex that stopped matching, would
  // make the whole file vacuous rather than red.
  it('can read the track tokens out of the stylesheet', () => {
    expect(css.length).toBeGreaterThan(1000);
    expect(tokenHex('track-pink')).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('matches the four track tokens', () => {
    expect(M, 'M vs --track-pink').toBe(tokenHex('track-pink'));
    expect(C, 'C vs --track-blue').toBe(tokenHex('track-blue'));
    expect(G, 'G vs --track-green').toBe(tokenHex('track-green'));
    expect(Y, 'Y vs --track-yellow').toBe(tokenHex('track-yellow'));
  });

  it('matches the two mode-independent neutrals', () => {
    // Deliberately checked against `--color-logo-plate` / `-ink` rather than
    // `--card` / `--foreground`: those flip in dark mode, and an icon's ink and
    // paper may not. Polarity belongs to the artwork, not the theme — the same
    // rule that keeps a merchant logo on a paper plate in both modes.
    expect(paper, 'paper vs --color-logo-plate').toBe(tokenHex('color-logo-plate'));
    expect(ink, 'ink vs --color-logo-plate-ink').toBe(tokenHex('color-logo-plate-ink'));
  });
});
