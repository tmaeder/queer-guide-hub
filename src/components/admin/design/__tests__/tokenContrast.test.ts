import { describe, it, expect } from 'vitest';
import { contrastVerdict } from '@/lib/wcagContrast';
import { COLOR_TOKENS, CONTRAST_PAIRS } from '../tokenCatalog';

/**
 * Derived, never hardcoded (adopted from #2659): the guards below used to read
 * a literal ['spot','ink-blue','ink-over'], so a FOURTH wayfinding colour added
 * everywhere else would simply never have been checked against --destructive.
 * Flagging `ink: true` on the catalog row is now sufficient and sole.
 */
const INKS = COLOR_TOKENS.filter((t) => t.ink).map((t) => t.key);
const hueOf = (v: string) => Number(v.split(' ')[0]);

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
 * 3. Track colors (subway-map rebrand) are FILL-ONLY and mostly sit below
 *    3:1 against paper on their own (blue 2.25, green 1.64, yellow 1.34).
 *    They are BORDER-GATED: every filled shape carries a 2-3px ink border,
 *    and 1.4.11 is satisfied by fill-vs-ink. Pink is the one track that also
 *    clears 3:1 against the page bare, which is why it alone may draw
 *    borderless marks (focus ring, active-nav underline, ::selection).
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
 * Tokens that only ever draw non-text marks — borders, rings, the pink track.
 * WCAG 1.4.11 bar is 3:1 against the page. Only fills that can appear WITHOUT
 * an ink border belong here (the focus ring, ::selection, the active-nav
 * underline — all pink).
 */
const NON_TEXT_ON_PAGE = ['border', 'input', 'border-hairline', 'sidebar-border', 'ring', 'spot', 'track-pink'];

/**
 * BORDER-GATED fills (subway-map rebrand): blue/green/yellow track fills
 * measure under 3:1 against paper on their own (2.25 / 1.64 / 1.34), so
 * every filled shape using them MUST carry a 2-3px ink border — and 1.4.11
 * is satisfied by fill-vs-ink, which is what this asserts. The route
 * bullet, station ring and swatch components all follow this rule; a
 * borderless blue/green/yellow fill is a design-system violation.
 */
const BORDER_GATED_FILLS = ['track-blue', 'track-green', 'track-yellow', 'ink-blue', 'ink-over'];

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

  it.each(BORDER_GATED_FILLS)(
    '--%s clears 3:1 against the ink border that gates it (WCAG 1.4.11)',
    (key) => {
      const v = contrastVerdict(value(key, 'light'), value('foreground', 'light'));
      expect(v).not.toBeNull();
      expect(
        v!.ratio,
        `--${key} vs --foreground is ${v!.ratio}:1, needs >= 3. ` +
          'Border-gated fills are perceivable via their mandatory ink border.',
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('has a non-empty derived ink list (the guards below iterate it)', () => {
    // If the `ink` flag were ever dropped from every row, the three checks
    // that iterate INKS would pass vacuously. Assert the list exists first.
    expect(INKS.length, 'no COLOR_TOKENS row carries `ink: true`').toBeGreaterThanOrEqual(4);
  });

  it('keeps every track color off the small-text path', () => {
    // Track colors are FILL-ONLY. Type on a fill uses ink (blue/green/yellow)
    // or paper (pink), gated at their own pairs; a track color as body text
    // fails AA and the axe route sweep would catch it — this documents why.
    for (const track of [...INKS, 'spot', 'ink-blue', 'ink-over']) {
      expect(TEXT_ON_PAGE, `--${track} must never be body text`).not.toContain(track);
    }
  });

  it('keeps the track colors mutually distinguishable', () => {
    // Four lines that a rider must tell apart at a glance. Two tracks within
    // 25° of each other is a wayfinding failure, not an aesthetic one.
    for (const mode of MODES) {
      for (let i = 0; i < INKS.length; i++) {
        for (let j = i + 1; j < INKS.length; j++) {
          const a = hueOf(value(INKS[i], mode));
          const b = hueOf(value(INKS[j], mode));
          const d = Math.abs(a - b);
          expect(
            Math.min(d, 360 - d),
            `--${INKS[i]} (${a}) and --${INKS[j]} (${b}) are within 25° in ${mode} mode; ` +
              'two lines that close read as one on the map.',
          ).toBeGreaterThan(25);
        }
      }
    }
  });

  it('locks the text-on-track rule: paper on pink, ink on blue/green/yellow', () => {
    // Deviation from the source design mock (which put paper text on the cyan
    // bullet, ~2.3:1): bullet/fill text is ink for blue/green/yellow and paper
    // for pink. These are graphical-object letters (the letter IS the mark),
    // so the 3:1 non-text bar applies; ink combos clear 4.5 with margin.
    const paperOnPink = contrastVerdict(value('background', 'light'), value('track-pink', 'light'));
    expect(paperOnPink!.ratio).toBeGreaterThanOrEqual(3);
    for (const track of ['track-blue', 'track-green', 'track-yellow']) {
      const inkOn = contrastVerdict(value('foreground', 'light'), value(track, 'light'));
      expect(inkOn!.ratio, `ink on --${track}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never lets a track color impersonate the danger signal', () => {
    // The safety contract in src/index.css: red means danger. If a track
    // colour drifts into the red hue band, a risk badge and a wayfinding mark
    // become indistinguishable on a product used in criminalising countries.
    //
    // Measured against --destructive's ACTUAL hue per mode, not against 0
    // (adopted from #2659): the old form assumed red sits at hue 0, which is
    // true today but is runtime-overridable via /admin/design.
    for (const track of [...INKS, 'spot', 'ink-blue', 'ink-over']) {
      for (const mode of MODES) {
        const hue = hueOf(value(track, mode));
        const danger = hueOf(value('destructive', mode));
        const raw = Math.abs(hue - danger);
        const distance = Math.min(raw, 360 - raw);
        expect(
          distance,
          `--${track} (${mode}) sits at hue ${hue}, only ${distance}° from --destructive ` +
            `(${danger}). A wayfinding colour must never be mistakable for the danger signal.`,
        ).toBeGreaterThan(25);
      }
    }
  });

  it('audits every token that CONTRAST_PAIRS references', () => {
    for (const p of CONTRAST_PAIRS) {
      expect(COLOR_TOKENS.some((t) => t.key === p.fg), `unknown fg --${p.fg}`).toBe(true);
      expect(COLOR_TOKENS.some((t) => t.key === p.bg), `unknown bg --${p.bg}`).toBe(true);
    }
  });
});
