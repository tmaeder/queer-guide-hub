import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';

/**
 * The brand renditions that must not drift apart.
 *
 * Until 2026-08-19 this pinned three copies of the "Cupid's transit" master
 * symbol — the component, the OG script and the favicon. That mark is retired:
 * the design project's brand rules say the logo "carries no symbol, no
 * container and no colour", and the mark "survives only on the Logo Options
 * sheet as history".
 *
 * What replaced it is not a redraw but a REUSE, so the pinning changes shape:
 *
 *  - the app icon (`public/favicon.svg`, the input every `icon-*.png` and the
 *    .ico are resized from) is the Icon System's "Rainbow" glyph, and its path
 *    must be `TRANSIT_ICON_PATHS.rainbow` verbatim — the icon set stays the
 *    single source, so there is no second copy to drift.
 *  - the OG image (`scripts/generate-brand-assets.mjs`) and the header/footer
 *    lockup are the wordmark ALONE.
 *
 * The colour rule survives unchanged, and it is the one that has actually
 * broken before: every rendition is ink-only.
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

const script = read('scripts/generate-brand-assets.mjs');
const favicon = read('public/favicon.svg');
const wordmark = read('src/components/brand/Wordmark.tsx');

describe('brand asset sync', () => {
  it('the app icon is the Rainbow icon from the set, not a redraw', () => {
    expect(paths(favicon)).toEqual([TRANSIT_ICON_PATHS.rainbow.replace(/\s+/g, ' ').trim()]);
  });

  it('the app icon stroke keeps the two arcs apart', () => {
    // This glyph's failure mode at small sizes is the arcs MERGING, not thin
    // strokes vanishing, so it takes the lighter weight. The gap between the
    // arcs is 16 units; a stroke of 16 or more would close it.
    const sw = Number(strokeWidth(favicon));
    expect(sw).toBe(9);
    expect(sw).toBeLessThan(16);
  });

  it('the app icon box is square, so the resize cannot distort it', () => {
    const [, , w, h] = viewBox(favicon).split(/\s+/).map(Number);
    expect(w).toBe(h);
    // The icon set is authored in a 100-unit box; anything else means the
    // favicon re-framed the glyph and the two will read differently.
    expect(viewBox(favicon)).toBe('0 0 100 100');
  });

  it('the OG image is the wordmark alone — no symbol came back', () => {
    // Brand Guidelines §03. The OG composition used to stack the master symbol
    // above the wordmark; a <path> reappearing here is that regression.
    expect(paths(script)).toEqual([]);
    expect(script).not.toMatch(/MASTER_SYMBOL/);
  });

  it('the mark carries no colour, in any rendition', () => {
    // The wordmark used to nest a pink heart at the g's descender. It was
    // removed on purpose — the mark is ink-only — and these renditions have
    // already drifted apart once, so pin it: a hue reappearing in ANY of them
    // is the regression.
    for (const src of [wordmark, script, favicon]) {
      expect(src).not.toMatch(/track-pink|#FF1F8F/i);
    }
    // Paper and ink are the only literals the non-TSX copies may name.
    for (const src of [script, favicon]) {
      for (const hex of src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []) {
        expect(hex.toUpperCase()).toMatch(/^#(FAFAF5|111|111111)$/);
      }
    }
    // The heart was a <path>; the wordmark is plain text and must stay so.
    expect(paths(wordmark)).toEqual([]);
  });

  it('the icon bends — hard rule #1 of the subway map', () => {
    // "Illustrative transit/subway lines are NEVER drawn straight." Both arcs
    // on the app icon are curves, and neither may contain a straight run.
    const [line] = paths(favicon);
    expect(line).toMatch(/C/);
    expect(line).not.toMatch(/[HV]/);
  });
});
