import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HYGIENE_METRICS } from '@/lib/tagHygieneMetrics';

/**
 * Three-way pin on the tag hygiene metric set: the SQL that produces it, the
 * CI baseline that ratchets it, and the admin panel that renders it.
 *
 * `scripts/check-tag-hygiene.mjs` already refuses to treat a counter with no
 * baseline entry as passing — "that is how a new gate silently does nothing".
 * The panel has the same failure mode and no equivalent guard: a counter added
 * to the SQL simply would not render, and nobody would notice, which is the
 * exact way the whole surface went missing for a month in the first place.
 *
 * Text checks against the repo, so this runs in CI without credentials — same
 * pattern as `src/lib/__tests__/citySafetyBackfill.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const BASELINE = join(ROOT, 'scripts', 'tag-hygiene-baseline.json');

/** Keys of the jsonb the live function returns, minus the `totals` context block. */
function sqlMetricKeys(): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const defining = files.filter((f) =>
    readFileSync(join(MIGRATIONS, f), 'utf8').includes(
      'create or replace function public.tag_hygiene_stats',
    ),
  );
  expect(defining.length, 'no migration defines tag_hygiene_stats').toBeGreaterThan(0);

  const sql = readFileSync(join(MIGRATIONS, defining[defining.length - 1]), 'utf8');
  const body = sql.slice(sql.lastIndexOf('create or replace function public.tag_hygiene_stats'));

  // Top-level keys of the jsonb_build_object sit at four spaces; the members of
  // the nested `totals` object are indented further and are deliberately missed.
  const keys = [...body.matchAll(/^ {4}'([a-z_]+)',/gm)].map((m) => m[1]);
  expect(keys, 'indentation-based key scan found nothing — the SQL was reformatted').toContain(
    'totals',
  );
  return keys.filter((k) => k !== 'totals');
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, unknown>;
const baselineMetricKeys = Object.keys(baseline).filter((k) => typeof baseline[k] === 'number');
const panelKeys = HYGIENE_METRICS.map((m) => m.key as string);

describe('tag hygiene metric set', () => {
  it('the panel renders exactly the counters the SQL returns', () => {
    expect([...panelKeys].sort()).toEqual([...sqlMetricKeys()].sort());
  });

  it('the CI baseline covers exactly the same counters', () => {
    expect([...baselineMetricKeys].sort()).toEqual([...sqlMetricKeys()].sort());
  });

  it('the panel lists no counter twice', () => {
    expect(new Set(panelKeys).size).toBe(panelKeys.length);
  });

  it("the panel's advisory set is the baseline's _advisory set", () => {
    // Advisory metrics only warn in CI. If one is reclassified as a hard gate
    // in the baseline but still labelled "CI only warns" here, the panel is
    // telling an admin to ignore a number that now fails the build.
    const fromBaseline = [...((baseline._advisory as string[]) ?? [])].sort();
    const fromPanel = HYGIENE_METRICS.filter((m) => m.advisory)
      .map((m) => m.key as string)
      .sort();
    expect(fromPanel).toEqual(fromBaseline);
  });

  it('never marks an advisory counter as a hard zero', () => {
    // `zero: true` paints the figure destructive. A counter CI will not fail on
    // must not read as a build-breaking defect on the panel.
    expect(HYGIENE_METRICS.filter((m) => m.advisory && m.zero)).toEqual([]);
  });

  it('marks a counter as a hard zero exactly when its committed baseline is zero', () => {
    // Both directions matter. A `zero` flag on a counter whose accepted level is
    // non-zero renders permanently red, which trains admins to ignore red; a
    // missing flag on a counter that has since been ratcheted to 0 lets a real
    // regression render as an ordinary grey number.
    const shouldBeZero = HYGIENE_METRICS.filter((m) => baseline[m.key] === 0).map((m) => m.key);
    const areZero = HYGIENE_METRICS.filter((m) => m.zero).map((m) => m.key);
    expect([...areZero].sort()).toEqual([...shouldBeZero].sort());
  });
});
