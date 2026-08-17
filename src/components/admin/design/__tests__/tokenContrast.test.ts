import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrastVerdict } from '@/lib/wcagContrast';
import { COLOR_TOKENS, CONTRAST_PAIRS } from '../tokenCatalog';

/**
 * `--track-ring` is declared in src/index.css but deliberately NOT cataloged
 * (compile-time only, like --radius-panel and --radius-full), so it is read
 * straight from the stylesheet rather than from COLOR_TOKENS. Reading it —
 * instead of hardcoding ink here — keeps the border-gate guard honest if the
 * ring value ever moves.
 */
const TRACK_RING = (() => {
  const css = readFileSync(resolve(__dirname, '../../../../index.css'), 'utf8');
  const m = css.match(/(?<![\w-])--track-ring:\s*([^;]+);/);
  if (!m) throw new Error('--track-ring is not declared in src/index.css');
  return m[1].replace(/\s+/g, ' ').trim();
})();

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
 * 2. Non-text contrast (WCAG 1.4.11) was measured by nothing at all, and had
 *    drifted to 1.32:1. CONTROL_BOUNDARIES covers that.
 * 3. Track colors (subway-map rebrand) are FILL-ONLY and mostly sit below
 *    3:1 against any light surface on their own (blue 2.25, green 1.64,
 *    yellow 1.34). They are BORDER-GATED: every track-coloured MARK carries
 *    an ink ring, and 1.4.11 is satisfied by fill-vs-ring.
 *
 * Revised 2026-08-17 (soft re-skin), and the revision is the interesting part:
 *
 * - `--border` LEFT the 3:1 guard. The old guard's stated premise was that
 *   "since shadows are disabled these 1px borders carry every structural
 *   boundary in the app". That premise is now false: containers have no
 *   border at all, and a card separates from the page by surface tint plus
 *   --shadow-soft. Under WCAG 1.4.11 a card frame is neither a component
 *   boundary nor a graphic required to understand content — it is decoration,
 *   which the SC explicitly exempts. So `border`, `border-hairline` and
 *   `sidebar-border` are no longer held to 3:1. What IS still held there is
 *   the set of real control boundaries and the focus ring.
 * - SURFACE_SEPARATION replaces the deleted coverage. It is a house rule, not
 *   a WCAG one, and it exists because deleting the border guard would
 *   otherwise leave nothing to notice if a future token nudge flattened card
 *   into page — which in this system is an invisible card, not a subtle one.
 * - BORDER_GATED_FILLS is anchored to `--track-ring` rather than to
 *   `--foreground`. The ring belongs to the MARK, not to the theme (every
 *   station circle in the design mocks is `fill:paper; stroke:#111`), so it
 *   stays ink in both modes and this guard is mode-independent by
 *   construction. Anchoring to --foreground would silently invert the moment
 *   dark mode lands and paper became the "border".
 *
 * WCAG 1.4.1 (use of colour) is NOT satisfiable by any of this and is a
 * separate obligation: a track-coloured mark that encodes a state must also
 * carry a glyph or a text label. That is enforced in the components
 * (RouteBullet requires a letter and a label; AccessGrid pairs every dot with
 * its written value), not here — arithmetic on tokens cannot see it.
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
 * Real WCAG 1.4.11 obligations: the boundary of a form control, and the focus
 * indicator. Both are measured against BOTH surfaces they can sit on — inputs
 * and buttons live inside cards at least as often as on the page, and a guard
 * that only knew about the page would miss the tighter of the two.
 *
 * Container borders are deliberately absent — see the header. `spot` and
 * `track-pink` are here because pink is the one track that draws borderless
 * marks (focus ring, ::selection, the active-nav underline).
 */
const CONTROL_BOUNDARIES = ['input', 'ring', 'spot', 'track-pink'];
const CONTROL_SURFACES = ['background', 'card'] as const;

/**
 * House rule replacing the deleted border guard: adjacent surfaces must stay
 * told apart by their own luminance. These are LUMINANCE-RATIO floors, far
 * below any WCAG threshold — the point is not legibility, it is that a card
 * with no frame and no tint is not a card at all. Measured today: 1.12 / 1.09
 * / 1.12.
 */
const SURFACE_SEPARATION: Array<[string, string, number]> = [
  ['card', 'background', 1.06],
  ['muted', 'card', 1.04],
  ['popover', 'background', 1.1],
];

/**
 * BORDER-GATED fills: blue/green/yellow track fills measure under 3:1 against
 * any light surface on their own (2.25 / 1.64 / 1.34), so every track-coloured
 * MARK carries the ink `--track-ring` — 1.4.11 is satisfied by fill-vs-ring,
 * which is what this asserts. RouteBullet, StationRing and TrackSwatch all
 * follow the rule; a borderless blue/green/yellow mark is a design-system
 * violation. (A borderless track-coloured *line* on a diagram is a different
 * case: it is sized well past the 3:1-exempt threshold and reads as
 * illustration, which is why the mocks draw route lines with no casing.)
 */
const BORDER_GATED_FILLS = ['track-blue', 'track-green', 'track-yellow', 'ink-blue', 'ink-over'];

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

  it.each(
    CONTROL_BOUNDARIES.flatMap((key) =>
      CONTROL_SURFACES.flatMap((surface) => MODES.map((mode) => [key, surface, mode] as const)),
    ),
  )('--%s meets the 3:1 non-text bar on --%s (WCAG 1.4.11) in %s mode', (key, surface, mode) => {
    const v = contrastVerdict(value(key, mode), value(surface, mode));
    expect(v).not.toBeNull();
    expect(
      v!.ratio,
      `--${key} vs --${surface} (${mode}) is ${v!.ratio}:1, needs >= 3. ` +
        'Control boundaries and the focus ring are the marks 1.4.11 actually covers; ' +
        'container frames were removed and are exempt as decoration.',
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(SURFACE_SEPARATION.flatMap((s) => MODES.map((mode) => [...s, mode] as const)))(
    '--%s stays distinguishable from --%s (>= %s:1) in %s mode',
    (fg, bg, floor, mode) => {
      const v = contrastVerdict(value(fg, mode), value(bg, mode));
      expect(v).not.toBeNull();
      expect(
        v!.ratio,
        `--${fg} vs --${bg} (${mode}) is ${v!.ratio}:1, needs >= ${floor}. ` +
          'Nothing draws a frame around a card any more, so this tonal step IS the ' +
          'card edge. Flatten it and the card stops existing rather than getting subtle.',
      ).toBeGreaterThanOrEqual(floor);
    },
  );

  it.each(BORDER_GATED_FILLS.flatMap((key) => MODES.map((mode) => [key, mode] as const)))(
    '--%s clears 3:1 against the ink ring that gates it (WCAG 1.4.11) in %s mode',
    (key, mode) => {
      const v = contrastVerdict(value(key, mode), TRACK_RING);
      expect(v).not.toBeNull();
      expect(
        v!.ratio,
        `--${key} vs --track-ring is ${v!.ratio}:1, needs >= 3. ` +
          "Border-gated fills are perceivable via the mark's own ink ring.",
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

  it('locks the text-on-track rule: INK on every track fill', () => {
    // The source design mock puts PAPER type on the pink and cyan fills.
    // Measured, paper-on-cyan is 2.32:1 and paper-on-pink 3.43:1 — the first
    // fails even the 3:1 graphical-object bar, and the second fails AA for
    // anything below 18.66px bold, which the accent button (14px bold), the
    // ink badge (11px) and the route bullet (17px) all are. So the whole set
    // takes ink, which clears 4.5:1 on all four. Deviation from the mock is
    // deliberate and this test is where it is recorded.
    for (const track of ['track-pink', 'track-blue', 'track-green', 'track-yellow']) {
      const inkOn = contrastVerdict(value('foreground', 'light'), value(track, 'light'));
      expect(inkOn!.ratio, `ink on --${track}`).toBeGreaterThanOrEqual(4.5);
    }
    // And the inverse must NOT be used: paper on pink is the tempting one.
    const paperOnPink = contrastVerdict(value('background', 'light'), value('track-pink', 'light'));
    expect(
      paperOnPink!.ratio,
      'paper-on-pink is below AA — if this ever clears 4.5:1 the rule above can relax',
    ).toBeLessThan(4.5);
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
