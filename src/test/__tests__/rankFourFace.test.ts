import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Rank 4 (`--text-title`) is Space Grotesk 700 — never Anton.
 *
 * This is a SOURCE SCAN rather than an ESLint rule on purpose. The design
 * rules in eslint.config.js live in `no-restricted-syntax` blocks that flat
 * config replaces WHOLESALE per file, so a new selector has to be re-stated in
 * every matching block and one miss silently disables load-bearing ones
 * (precedent: #2049). A test cannot be disabled by that mechanism.
 *
 * Why it exists: rank 4 was split for months — the docs' rank table and
 * CLAUDE.md both said Space Grotesk while ~70 sites used `font-display`, and
 * the token name predicts neither. /history was migrated onto the WRONG face
 * by following the transit components (#2718), corrected (#2732), unified
 * across 71 sites (#2744) — and then seven more Anton sites appeared from
 * unrelated PRs merged in the same window. Without a guard it simply regrows.
 *
 * Both class orders are checked: `font-display text-title` AND
 * `text-title font-display`. The first sweep matched only one and silently
 * left 21 sites behind.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__snapshots__') continue;
      walk(full, out);
    } else if (full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Anton paired with the rank-4 size token, in either class order. */
const ANTON_AT_RANK_4 = /font-display\s+text-title\b|text-title\s+font-display\b/;

/**
 * An `<h1>`/`<h2>` opening tag carrying `text-title` — i.e. rank 4 on an
 * element that `index.css` puts the DISPLAY FACE on via a bare element
 * selector. `font-sans` is the sanctioned opt-out and exempts the line.
 *
 * This arm exists because the class-pair regex above is blind to an INHERITED
 * face. `Footer.tsx`'s anti-discrimination heading was
 * `<h2 className="max-w-md text-title font-bold">` — no `font-display` class
 * anywhere on it, and it rendered in Anton 400 for months with `font-bold`
 * silently neutralised. The file's own comment asserted the opposite and cited
 * this suite as its guard. A test that cannot see the mechanism it is cited
 * for is worse than no test, because the comment stops anyone looking.
 */
const RANK_4_ON_DISPLAY_ELEMENT = /<h[12]\b[^>]*\btext-title\b[^>]*>/;
const HAS_SANS_OPT_OUT = /\bfont-sans\b/;

describe('rank 4 is Space Grotesk, never Anton', () => {
  const files = walk(SRC);

  it('scans a plausible number of components (guards against an empty sweep)', () => {
    // A zero-file walk would make every assertion below vacuously true — the
    // exact failure mode this suite is meant to prevent elsewhere.
    expect(files.length).toBeGreaterThan(300);
  });

  /**
   * SCOPED TO THE CHROME, and the scope is the finding.
   *
   * Run corpus-wide this arm returns **63** offenders (measured 2026-10-10) —
   * `TripPlannerPage`, section headings all over `src/pages/**`, and so on. So
   * the inherited-face condition is a corpus-wide state, not a chrome defect,
   * and gating on zero would ship a suite that is red on arrival. This repo
   * has removed a cry-wolf gate once already for exactly that reason; a rule
   * that is always failing is one people learn to scroll past, which is worse
   * than no rule.
   *
   * The 63 are recorded rather than swept because each one is a judgement:
   * some of those headings may legitimately want the display face and the
   * wrong thing about them is the SIZE token, which is an editorial call per
   * surface, not a mechanical substitution. Re-measure before planning against
   * that number — including this sentence.
   *
   * What IS gated is the chrome, where the condition was found and fixed. The
   * corpus-wide count below is printed, never asserted, so the number stays
   * visible and re-derivable without turning into a permanent red.
   */
  const CHROME = join(SRC, 'components', 'layout');

  function scan(predicateFiles: string[]): string[] {
    const offenders: string[] = [];
    for (const file of predicateFiles) {
      const body = readFileSync(file, 'utf8');
      body.split('\n').forEach((line, i) => {
        if (RANK_4_ON_DISPLAY_ELEMENT.test(line) && !HAS_SANS_OPT_OUT.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    return offenders;
  }

  it('finds chrome files to scan (guards against a vacuous scope)', () => {
    // If `src/components/layout/` is ever renamed, the assertion below would
    // pass over an empty list and report the chrome clean forever.
    expect(files.filter((f) => f.startsWith(CHROME)).length).toBeGreaterThan(8);
  });

  it('detects rank 4 on an h1/h2 without the sans opt-out, in the chrome', () => {
    const offenders = scan(files.filter((f) => f.startsWith(CHROME)));
    expect(
      offenders,
      `src/index.css puts the display face on the bare \`h1, h2\` ELEMENT, so a\n` +
        `rank-4 heading on one of those tags renders in Anton 400 — wrong face, and\n` +
        `\`font-bold\` is a no-op because Anton ships a single weight.\n\n` +
        `Add \`font-sans\` to the element (the selector carries \`:not(.font-sans)\`\n` +
        `so the opt-out actually wins — it is UNLAYERED, and a bare utility would\n` +
        `otherwise lose to it), or use a different element.\n\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('reports the corpus-wide count without gating on it', () => {
    const all = scan(files);
    // Advisory. The assertion is only that the scan still RUNS — a scan that
    // silently matched nothing would make the chrome arm above vacuous too.
    console.info(
      `[rankFourFace] rank-4 headings on h1/h2 without \`font-sans\`, corpus-wide: ${all.length} ` +
        `(63 at the time this arm was written; chrome is gated at 0 separately)`,
    );
    expect(Array.isArray(all)).toBe(true);
  });

  it('keeps the unlayered h1/h2 selector opt-out-able', () => {
    // The assertion above is only enforceable while `font-sans` actually beats
    // the element selector. If someone restores the plain `h1, h2` form, every
    // `font-sans` in the tree silently stops working and this suite starts
    // demanding a class that does nothing.
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toMatch(/h1:not\(\.font-sans\),\s*\n\s*h2:not\(\.font-sans\),/);
  });

  it('pairs --text-title with no display face anywhere in src/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      body.split('\n').forEach((line, i) => {
        if (ANTON_AT_RANK_4.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(
      offenders,
      `Rank 4 (text-title) is Space Grotesk 700 per docs/design-system/README.md.\n` +
        `Use \`text-title font-bold\`. Anton carries hero / display / headline only.\n\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * There is deliberately NO assertion here against `font-display` +
   * `font-bold`. ~100 such call sites exist and were left in place on purpose:
   * `index.css` sets `font-synthesis-weight: none` on h1/h2/.font-display, so
   * one declaration neutralises every one of them and any future one. CLAUDE.md
   * records that they were "NOT edited file by file" for exactly that reason.
   * A test banning them would reverse a documented decision and fail on ~100
   * pre-existing lines that render correctly.
   */
});
