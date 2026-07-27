import { describe, it, expect } from 'vitest';
import { contrastVerdict } from '@/lib/wcagContrast';
import { COLOR_TOKENS, CONTRAST_PAIRS } from '../tokenCatalog';

/**
 * Accessibility guard on the compiled-in token values.
 *
 * Why this exists as a UNIT test rather than leaving it to the axe sweep:
 * `axe full route sweep` is the only thing that measured token contrast, it
 * lives in a path-filtered workflow, and it is NOT one of main's required
 * checks — so on 2026-07-27 auto-merge landed two PRs while it was failing and
 * main sat red. This runs inside `test`, which IS required, and it is pure
 * arithmetic on the token table: fast, deterministic, no browser.
 *
 * It encodes three lessons from that incident:
 *
 * 1. A token used as BOTH a foreground and a background has two contrast
 *    constraints that pull in opposite directions. `CONTRAST_PAIRS` only
 *    describes the *pairing* (e.g. destructive-foreground on destructive), so
 *    the far more common TEXT role (`text-destructive`, 236 usages vs 16 button
 *    fills) was invisible to every check. Darkening `--destructive` to fix the
 *    button dropped red-on-dark-page text to 4.06:1. TEXT_ON_PAGE covers that.
 * 2. Non-text contrast (WCAG 1.4.11) was measured by nothing at all, and since
 *    shadows are disabled these 1px borders carry every structural boundary in
 *    the app — they had drifted to 1.32:1. NON_TEXT_ON_PAGE covers that.
 * 3. `--spot` is deliberately BELOW the 4.5:1 text bar in light mode (3.74:1).
 *    That is not a bug: the Riso spot ink is never text, only a mark
 *    (::selection fill, focus ring, underlines). It is asserted against the
 *    3:1 non-text bar and deliberately excluded from TEXT_ON_PAGE — if someone
 *    ever styles small text with it, axe will fail and this comment explains why.
 */

const value = (key: string, mode: 'light' | 'dark'): string => {
  const t = COLOR_TOKENS.find((x) => x.key === key);
  if (!t) throw new Error(`token --${key} is not in COLOR_TOKENS`);
  return mode === 'light' ? t.light : t.dark;
};

const MODES = ['light', 'dark'] as const;

/** Tokens rendered as body-sized TEXT directly on the page background. */
const TEXT_ON_PAGE = [
  'foreground',
  'muted-foreground',
  'destructive',
  'warning',
  'success',
  'text-primary',
  'text-secondary',
  'text-muted',
];

/**
 * Tokens that only ever draw non-text marks — borders, rings, the spot ink.
 * WCAG 1.4.11 bar is 3:1. Shadows are disabled app-wide, so these ARE the
 * structural boundaries; letting them drift makes the UI unreadable.
 */
const NON_TEXT_ON_PAGE = [
  'border',
  'input',
  'border-hairline',
  'sidebar-border',
  'ring',
  'spot',
];

describe('design tokens: contrast guards', () => {
  it.each(CONTRAST_PAIRS.flatMap((p) => MODES.map((mode) => [p.label, p.fg, p.bg, mode] as const)))(
    'pair "%s" (%s on %s) meets AA in %s mode',
    (_label, fg, bg, mode) => {
      const v = contrastVerdict(value(fg, mode), value(bg, mode));
      expect(v, `unparseable token value for ${fg}/${bg}`).not.toBeNull();
      expect(v!.ratio, `${fg} on ${bg} (${mode}) is ${v!.ratio}:1, needs >= 4.5`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(TEXT_ON_PAGE.flatMap((key) => MODES.map((mode) => [key, mode] as const)))(
    '--%s as text on the page background meets AA in %s mode',
    (key, mode) => {
      const v = contrastVerdict(value(key, mode), value('background', mode));
      expect(v).not.toBeNull();
      expect(
        v!.ratio,
        `--${key} as text on --background (${mode}) is ${v!.ratio}:1, needs >= 4.5. ` +
          'If this token is only ever a fill, move it to NON_TEXT_ON_PAGE and say why.',
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(NON_TEXT_ON_PAGE.flatMap((key) => MODES.map((mode) => [key, mode] as const)))(
    '--%s meets the 3:1 non-text bar (WCAG 1.4.11) in %s mode',
    (key, mode) => {
      const v = contrastVerdict(value(key, mode), value('background', mode));
      expect(v).not.toBeNull();
      expect(
        v!.ratio,
        `--${key} vs --background (${mode}) is ${v!.ratio}:1, needs >= 3. ` +
          'Borders carry all depth in this system (shadows are disabled).',
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('keeps --spot off the small-text path', () => {
    // Documents the intent rather than the number: spot may sit under 4.5:1,
    // which is precisely why it is barred from small text.
    expect(TEXT_ON_PAGE).not.toContain('spot');
    expect(NON_TEXT_ON_PAGE).toContain('spot');
  });

  it('audits every token that CONTRAST_PAIRS references', () => {
    for (const p of CONTRAST_PAIRS) {
      expect(COLOR_TOKENS.some((t) => t.key === p.fg), `unknown fg --${p.fg}`).toBe(true);
      expect(COLOR_TOKENS.some((t) => t.key === p.bg), `unknown bg --${p.bg}`).toBe(true);
    }
  });
});
