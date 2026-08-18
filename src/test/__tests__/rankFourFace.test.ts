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

describe('rank 4 is Space Grotesk, never Anton', () => {
  const files = walk(SRC);

  it('scans a plausible number of components (guards against an empty sweep)', () => {
    // A zero-file walk would make every assertion below vacuously true — the
    // exact failure mode this suite is meant to prevent elsewhere.
    expect(files.length).toBeGreaterThan(300);
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
