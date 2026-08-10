import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The brand mark exists as THREE copies that must stay in sync:
 *
 *  - src/components/brand/MasterSymbol.tsx — what the app renders,
 *  - scripts/generate-brand-assets.mjs — the OG image (a node script; it
 *    cannot import the TSX component), and
 *  - public/favicon.svg — the app-icon crop, which is also the input every
 *    icon-*.png is resized from.
 *
 * Editing one and not the others is exactly how the site ended up shipping a
 * mark whose favicon, OG image and header disagreed on stroke weight. This
 * pins them together and pins the two hard rules the mark itself encodes.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

function paths(src: string): string[] {
  return [...src.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
}
function strokeWidth(src: string): string {
  const m = src.match(/strokeWidth=\{(\d+)\}/) ?? src.match(/stroke-width="(\d+)"/);
  if (!m) throw new Error('no stroke width found');
  return m[1];
}
function viewBox(src: string): string {
  const m = src.match(/viewBox="([^"]+)"/);
  if (!m) throw new Error('no viewBox found');
  return m[1];
}

const component = read('src/components/brand/MasterSymbol.tsx');
const script = read('scripts/generate-brand-assets.mjs');
const favicon = read('public/favicon.svg');
const wordmark = read('src/components/brand/Wordmark.tsx');

describe('brand asset sync', () => {
  it('the OG script draws the same mark as the component', () => {
    expect(paths(script).slice(0, 6)).toEqual(paths(component));
    expect(strokeWidth(script)).toBe(strokeWidth(component));
    expect(viewBox(script)).toBe(viewBox(component));
  });

  it('the favicon is a crop of the same mark, not a redraw', () => {
    const heartArm = paths(component).slice(2, 5); // heart + mars + venus
    expect(paths(favicon)).toEqual(heartArm);
    expect(strokeWidth(favicon)).toBe(strokeWidth(component));
    // Square, so the icon pipeline's resize(size, size) cannot distort it.
    const [, , w, h] = viewBox(favicon).split(/\s+/).map(Number);
    expect(w).toBe(h);
  });

  it('the OG wordmark carries the same heart, in the same place', () => {
    const heart = (src: string) => paths(src).find((d) => d.startsWith('M12 21'));
    expect(heart(script)).toBe(heart(wordmark));
    // Anchored on the declaration, never the prose: the component's comment
    // quotes the superseded offsets and would otherwise match too.
    const nums = (line: string) => [...line.matchAll(/(-?[\d.]+)em/g)].map((m) => m[1]);
    const classNames = wordmark.match(/className="absolute[^"]*"/)?.[0];
    const styleRule = script.match(/\.wm svg \{[^}]*\}/)?.[0];
    expect(classNames).toBeTruthy();
    expect(styleRule).toBeTruthy();
    expect(nums(styleRule!)).toEqual(nums(classNames!));
  });

  it('both transit tracks bend — hard rule #1 of the subway map', () => {
    const [entry, , , , , exit] = paths(component);
    expect(entry).toMatch(/C/);
    expect(exit).toMatch(/C/);
    // A straight run (H/V, or an L that is not part of an arrowhead/glyph)
    // is what the entry track used to be.
    expect(entry).not.toMatch(/[HV]/);
    expect(exit).not.toMatch(/[HV]/);
  });

  it('the viewBox is trimmed to the ink so the mark fills its box', () => {
    const [x, y, w, h] = viewBox(component).split(/\s+/).map(Number);
    const half = Number(strokeWidth(component)) / 2;
    // Ink extents of the six paths, measured once (geometry bbox + stroke).
    const ink = { left: 18 - half, right: 336 + half, top: 41 - half, bottom: 196 + half };
    const pad = [ink.left - x, x + w - ink.right, ink.top - y, y + h - ink.bottom];
    for (const p of pad) expect(p).toBeGreaterThan(8);
    for (const p of pad) expect(p).toBeLessThan(13);
  });
});
