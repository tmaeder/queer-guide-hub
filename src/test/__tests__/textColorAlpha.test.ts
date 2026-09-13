import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Text colour may not be an alpha-composited `--foreground`.
 *
 * An ad-hoc dimmed-text ramp (`--foreground` at 0.4 / 0.55 / 0.7) was spread
 * across 22 sites, and the lower rungs FAIL WCAG 1.4.3 in light mode — measured
 * with this repo's own `contrastRatio()`: 0.55 gives 4.11:1 on `--card` and
 * 3.95:1 on `--muted` against a 4.5:1 floor, and 0.4 is worse still. axe
 * reported 3.81:1 on the live `/admin/feedback` board. **0.55 PASSES in dark
 * mode (5.53 / 5.75), which is exactly why it survived review** — a spot check in
 * one mode reads clean.
 *
 * Nothing could see it. `eslint.config.js` bans hex/rgb/hsl literals, but its
 * selector requires a digit after `hsl(` and this string starts with `var`, so it
 * was legal by construction.
 *
 * The replacement is `--muted-foreground`, which is NOT a new token: 9 files
 * already wrote `hsl(var(--muted-foreground))` before this pass, and it measures
 * 6.23–7.59:1 across card/page/muted in BOTH modes. Its own contrast is guarded
 * by `TEXT_ON_PAGE` in `tokenContrast.test.ts` — deliberately not restated here,
 * so retuning the token fails there once instead of in two places that can
 * disagree.
 *
 * A source scan rather than a `no-restricted-syntax` selector, for the reason
 * recorded in `rawTypeScale.test.ts`: flat config replaces that rule WHOLESALE
 * per file, so a new selector must be re-stated in every block and one miss
 * silently disables load-bearing ones.
 *
 * SCOPE: `color` only. Background, border and shadow uses of the same ramp are
 * deliberately untouched — 1.4.3 governs TEXT, a 4% ink wash is a legitimate
 * surface tint, and sweeping those would be a re-skin rather than a fix.
 *
 * KNOWN COST, stated rather than hidden: the feedback board's status ladder was
 * three tonal rungs (foreground / muted-foreground / 0.55) and is now two. The
 * lightest rung had no accessible replacement — there is no compliant token
 * lighter than `--muted-foreground` — so `new`/`planned`/`in_progress` and P1 now
 * match `under_review`. Every one of them already renders its own label, which is
 * what WCAG 1.4.1 requires; the lost distinction was decorative.
 */

const ROOTS = ['src'];

/**
 * `color:` in a JS/JSX style object.
 *
 * Lowercase-anchored, so it cannot match `backgroundColor:` / `borderColor:` /
 * `WebkitTextFillColor:` — those are capital-C and are NOT text. The lookbehind
 * is what makes that true rather than hoped.
 */
const TEXT_ALPHA_RE = /(?<![A-Za-z])color:\s*['"`]hsl\(var\(--foreground\)\s*\/\s*[\d.]+\)['"`]/g;

/**
 * Fixtures are CONCATENATED, never written as literals.
 *
 * A blanket sweep of this pattern across `src` already rewrote this file's own
 * fixtures once and inverted its positive control into an assertion that the
 * regex matches a compliant string. Building the needle at runtime means the
 * file cannot match itself, so the scan needs no self-exclusion — and no future
 * codemod can silently disarm the guard by "fixing" its test data.
 */
const OFFENDING = (alpha: string) => `hsl(var(--foreground) ${'/'} ${alpha})`;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

describe('text colour never composites --foreground over a surface', () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it('scans a non-trivial number of files (positive control)', () => {
    // A walk that silently returned nothing makes every assertion below
    // vacuously pass, which is the failure mode this file exists to prevent.
    expect(files.length).toBeGreaterThan(500);
  });

  it('matches every rung of the ramp (positive control)', () => {
    for (const alpha of ['0.4', '0.55', '0.7']) {
      const sample = `<p style={{ color: '${OFFENDING(alpha)}' }}>x</p>`;
      expect([...sample.matchAll(TEXT_ALPHA_RE)], alpha).toHaveLength(1);
    }
  });

  it('does not mistake a background, border or shadow for text', () => {
    const sample = [
      `backgroundColor: '${OFFENDING('0.04')}'`,
      `borderColor: '${OFFENDING('0.1')}'`,
      `boxShadow: '0 0 0 1px ${OFFENDING('0.08')}'`,
    ].join('\n');
    expect([...sample.matchAll(TEXT_ALPHA_RE)]).toHaveLength(0);
  });

  it('leaves a compliant token alone', () => {
    const sample = `color: 'hsl(var(--muted-foreground))'`;
    expect([...sample.matchAll(TEXT_ALPHA_RE)]).toHaveLength(0);
  });

  it('has no alpha-composited text colour anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(TEXT_ALPHA_RE)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file}:${line} → ${m[0]}`);
      }
    }
    expect(
      offenders,
      `Alpha-composited text colour fails WCAG 1.4.3 in light mode (0.55 = 4.11:1 on --card, 3.95:1 on --muted; floor 4.5:1).\nUse hsl(var(--muted-foreground)) — 6.23–7.59:1 in both modes.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
