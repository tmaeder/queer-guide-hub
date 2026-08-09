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

/**
 * The PASTE-UP drums, DERIVED from the catalog's `ink` flag.
 *
 * This was three separate hardcoded `['spot','ink-blue','ink-over']` arrays —
 * one in NON_TEXT_ON_PAGE, one in the body-text ban, one in the danger-hue
 * check. Adding a fourth drum meant remembering all three, and the one that is
 * easiest to forget is the safety-critical one, which fails OPEN: an ink absent
 * from that loop is simply never checked against `--destructive`. Deriving it
 * means flagging the token in tokenCatalog.ts is sufficient and sole.
 */
const INKS = COLOR_TOKENS.filter((t) => t.ink).map((t) => t.key);

/** Hue of a token's "H S% L%" channel triple. */
const hueOf = (v: string) => Number(v.split(' ')[0]);

/** Shortest angular distance between two hues, in degrees. */
const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

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
  // PASTE-UP inks. These tint plates; they are never letterforms. With borders
  // removed, a plate's own fill IS its boundary, so 1.4.11 applies to the ink
  // exactly as it did to the hairline it replaced. Derived, so a new drum is
  // enrolled by flagging it in the catalog and nothing else.
  ...INKS,
];

describe('design tokens: contrast guards', () => {
  it.each(CONTRAST_PAIRS.flatMap((p) => MODES.map((mode) => [p.label, p.fg, p.bg, mode] as const)))(
    'pair "%s" (%s on %s) meets AA in %s mode',
    (_label, fg, bg, mode) => {
      const v = contrastVerdict(value(fg, mode), value(bg, mode));
      expect(v, `unparseable token value for ${fg}/${bg}`).not.toBeNull();
      expect(
        v!.ratio,
        `${fg} on ${bg} (${mode}) is ${v!.ratio}:1, needs >= 4.5`,
      ).toBeGreaterThanOrEqual(4.5);
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

  it('has at least one ink to guard', () => {
    // The three checks below iterate INKS. If the `ink` flag were ever dropped
    // from the catalog they would all iterate nothing and pass vacuously —
    // which is exactly how a safety guard dies quietly.
    expect(
      INKS.length,
      'no COLOR_TOKENS carry `ink: true`; the ink guards below are vacuous',
    ).toBeGreaterThan(0);
  });

  it('keeps every PASTE-UP ink off the small-text path', () => {
    // Same contract as --spot, extended to every drum. An ink is a plate fill;
    // type on a plate uses the paired *-foreground, which CONTRAST_PAIRS gates
    // at 4.5:1. If an ink ever appears here as text, the axe route sweep fails
    // first and this test explains why it should.
    for (const ink of INKS) {
      expect(TEXT_ON_PAGE, `--${ink} must never be body text`).not.toContain(ink);
      expect(NON_TEXT_ON_PAGE, `--${ink} must still clear the 3:1 fill bar`).toContain(ink);
    }
  });

  it('never lets an ink impersonate the danger signal', () => {
    // The safety contract in src/index.css: red means danger, ink means
    // nothing. If a brand ink ever drifts into the red hue band, a risk badge
    // and a decorative plate become indistinguishable on a product used in
    // criminalising countries. Guard the hue directly.
    //
    // Measured against --destructive's ACTUAL hue per mode, not against 0. The
    // old form was `Math.min(hue, 360 - hue)`, i.e. distance from red-as-zero,
    // which is only correct while --destructive happens to sit at hue 0. It is
    // runtime-overridable via /admin/design, so that was luck, not a fact.
    for (const ink of INKS) {
      for (const mode of MODES) {
        const hue = hueOf(value(ink, mode));
        const danger = hueOf(value('destructive', mode));
        const distance = hueDistance(hue, danger);
        expect(
          distance,
          `--${ink} (${mode}) sits at hue ${hue}, only ${distance}° from --destructive ` +
            `(hue ${danger}). Brand ink must never be mistakable for the danger signal.`,
        ).toBeGreaterThan(25);
      }
    }
  });

  it('keeps the drums distinguishable from each other', () => {
    // Five drums that all read as "pinkish" are one drum with extra steps, and
    // under a widened palette this is the constraint that actually keeps a
    // multi-ink page legible. 25° is the same separation the danger check uses.
    for (const mode of MODES) {
      for (let i = 0; i < INKS.length; i++) {
        for (let j = i + 1; j < INKS.length; j++) {
          const a = hueOf(value(INKS[i], mode));
          const b = hueOf(value(INKS[j], mode));
          expect(
            hueDistance(a, b),
            `--${INKS[i]} (${a}) and --${INKS[j]} (${b}) are within 25° in ${mode} mode; ` +
              'two drums that close read as one ink.',
          ).toBeGreaterThan(25);
        }
      }
    }
  });

  it('audits every token that CONTRAST_PAIRS references', () => {
    for (const p of CONTRAST_PAIRS) {
      expect(
        COLOR_TOKENS.some((t) => t.key === p.fg),
        `unknown fg --${p.fg}`,
      ).toBe(true);
      expect(
        COLOR_TOKENS.some((t) => t.key === p.bg),
        `unknown bg --${p.bg}`,
      ).toBe(true);
    }
  });
});
