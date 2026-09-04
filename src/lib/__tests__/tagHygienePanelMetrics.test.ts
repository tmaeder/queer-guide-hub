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

/**
 * Keys of the jsonb the live function returns, minus the `totals` context block.
 *
 * Computed ONCE and memoised, and found by scanning NEWEST-FIRST with an early
 * exit. Both halves are load-bearing for the runtime, not tidiness.
 *
 * This used to read every file in `supabase/migrations` on every call, and it is
 * called from more than one test. Measured 2026-09-04 at 1,478 files / 12 MB:
 *
 *     full scan, cold    36,143 ms      full scan, warm   10,569 ms
 *     newest-first        12 ms (cold)  /  1 ms (warm), 7 files read
 *
 * The cost is per-file syscall overhead on an iCloud-synced checkout, not
 * bandwidth, so it scales with the FILE COUNT and grows every time anyone adds a
 * migration. Two calls at ~10.5 s each against vitest's 15 s per-test timeout is
 * why this suite failed on repo size rather than on the invariant it guards —
 * the same failure its sibling `tagHygieneStats.test.ts` documents from when the
 * directory held 1,322 files.
 *
 * Newest-first is not merely an optimisation, it is the definition: `create or
 * replace` means the LAST migration to define the function is the one in effect,
 * so the first match scanning backwards IS the answer. Reading the other ~1,471
 * files could only ever confirm what is already known.
 */
let cachedKeys: string[] | null = null;

function sqlMetricKeys(): string[] {
  if (cachedKeys) return cachedKeys;

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // CASE-INSENSITIVE, deliberately. This matched the lowercase literal until
  // 2026-09-03, when a migration spelled it `CREATE OR REPLACE FUNCTION`. That
  // file became invisible here, the scan silently fell back to the PREVIOUS
  // definition, and the mismatch was reported as "the baseline has extra
  // counters" — blaming the baseline for keys the newest migration had in fact
  // added. A scan that can read the wrong file must not fail quietly elsewhere.
  const DEFINES = /create\s+or\s+replace\s+function\s+public\.tag_hygiene_stats/i;

  let sql: string | null = null;
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const body = readFileSync(join(MIGRATIONS, files[i]), 'utf8');
    if (DEFINES.test(body)) {
      sql = body;
      break;
    }
  }
  expect(sql, 'no migration defines tag_hygiene_stats').not.toBeNull();
  const at = sql!.search(new RegExp(DEFINES.source, 'gi'));
  expect(at, 'the defining migration matched the filter but not the body scan').toBeGreaterThan(-1);
  const body = sql!.slice(at);

  // Top-level keys of the jsonb_build_object sit at four spaces; the members of
  // the nested `totals` object are indented further and are deliberately missed.
  const keys = [...body.matchAll(/^ {4}'([a-z_]+)',/gm)].map((m) => m[1]);
  expect(keys, 'indentation-based key scan found nothing — the SQL was reformatted').toContain(
    'totals',
  );
  cachedKeys = keys.filter((k) => k !== 'totals');
  return cachedKeys;
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
