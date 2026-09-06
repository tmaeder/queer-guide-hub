import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHslChannels } from '@/lib/wcagContrast';
import { DRAG_OUTCOMES } from '@/lib/dragOutcome';
import { PLACEMENT_ORDER, isDragOutcome, placementVisual } from '@/lib/dragPlacement';

/** Page background, and the ink every filled cell is bordered with. */
const PAPER = '60 33% 97%';
const INK = '0 0% 7%';
/**
 * The one token reserved for real harm — `--destructive` is `0 70% 38%` in
 * light and `0 80% 66%` in dark, so hue 0 in both. A placement must never sit
 * on it: a queen going home is a story beat, not a safety warning.
 */
const DESTRUCTIVE_HUE = 0;

/** parseHslChannels returns a [h, s, l] TUPLE, not an object. */
function hue(triple: string): number {
  const parsed = parseHslChannels(triple);
  if (!parsed) throw new Error(`unparseable channel triple: ${triple}`);
  return parsed[0];
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe('drag placement palette', () => {
  it('covers exactly the outcome vocabulary, with no extras and no gaps', () => {
    expect([...PLACEMENT_ORDER].sort()).toEqual([...DRAG_OUTCOMES].sort());
  });

  it('parses every channel triple', () => {
    for (const o of PLACEMENT_ORDER) {
      const v = placementVisual(o);
      expect(parseHslChannels(v.tint), `${o} tint`).not.toBeNull();
      expect(parseHslChannels(v.ink), `${o} ink`).not.toBeNull();
    }
  });

  it('clears AA for the code and glyph on their own tint', () => {
    // The number a reader depends on: the code sits ON the fill.
    for (const o of PLACEMENT_ORDER) {
      const v = placementVisual(o);
      const ratio = contrastRatio(v.ink, v.tint);
      expect(ratio, `${o} text-on-tint`).not.toBeNull();
      expect(ratio!, `${o} text-on-tint = ${ratio?.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 1.4.11 against the ink border, which is why the border is required', () => {
    // Both halves are asserted so the rationale cannot rot into a comment nobody
    // re-checks: the tints ARE readable against ink, and are NOT readable
    // against paper — so a borderless cell would fail accessibility.
    for (const o of PLACEMENT_ORDER) {
      const v = placementVisual(o);
      expect(contrastRatio(INK, v.tint)!, `${o} tint-vs-ink`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v.tint, PAPER)!, `${o} tint-vs-paper`).toBeLessThan(3);
    }
  });

  it('never relies on colour alone — distinct icon, code and label per outcome', () => {
    const icons = new Set(PLACEMENT_ORDER.map((o) => placementVisual(o).Icon));
    const codes = new Set(PLACEMENT_ORDER.map((o) => placementVisual(o).code));
    const labels = new Set(PLACEMENT_ORDER.map((o) => placementVisual(o).label));
    expect(icons.size, 'every outcome needs its own glyph').toBe(PLACEMENT_ORDER.length);
    expect(codes.size).toBe(PLACEMENT_ORDER.length);
    expect(labels.size).toBe(PLACEMENT_ORDER.length);
  });

  it('keeps every placement off the destructive hue', () => {
    // A queen going home is a story beat, not a safety warning. Borrowing the
    // alarm colour would cheapen the one token reserved for real harm, so every
    // tint stays at least 25 degrees off it — the same distance rule the track
    // colours are held to.
    for (const o of PLACEMENT_ORDER) {
      const v = placementVisual(o);
      const d = hueDistance(hue(v.tint), DESTRUCTIVE_HUE);
      expect(d, `${o} tint hue ${hue(v.tint)} is too close to destructive`).toBeGreaterThanOrEqual(
        25,
      );
    }
  });

  it('gives the ladder a visible progression rather than six near-identical tints', () => {
    // The whole justification for a chromatic scale over a mono opacity ramp is
    // that adjacent steps are separable at an 18px cell. Assert adjacent ladder
    // hues actually differ, so a future "tidy-up" cannot quietly collapse them.
    const ladder = PLACEMENT_ORDER.filter((o) => o !== 'guest');
    for (let i = 1; i < ladder.length; i++) {
      const d = hueDistance(
        hue(placementVisual(ladder[i - 1]).tint),
        hue(placementVisual(ladder[i]).tint),
      );
      expect(d, `${ladder[i - 1]} and ${ladder[i]} are the same hue`).toBeGreaterThan(10);
    }
  });

  it('recognises only real outcomes', () => {
    expect(isDragOutcome('win')).toBe(true);
    expect(isDragOutcome('guest')).toBe(true);
    expect(isDragOutcome('BDT')).toBe(false);
    expect(isDragOutcome('')).toBe(false);
  });
});
