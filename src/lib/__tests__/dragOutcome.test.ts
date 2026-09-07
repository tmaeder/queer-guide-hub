import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRAG_OUTCOMES,
  DRAG_OUTCOME_LADDER,
  knownOutcomeCodes,
  normalizeOutcome,
  outcomeRank,
  type DragOutcome,
} from '../dragOutcome';

/**
 * The TS vocabulary and the SQL CHECK constraint are two halves of one contract.
 * If they drift, the importer writes rows the database rejects — or worse, the
 * database accepts a value the UI has no legend entry for.
 *
 * The migration is resolved by filename suffix rather than hardcoded, because
 * this repo renumbers migrations routinely (see lifecycleCapability.test.ts for
 * the same idiom and the same reason).
 */
function latestMigration(suffixRe: RegExp): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const hits = readdirSync(dir)
    .filter((f) => suffixRe.test(f))
    .sort();
  if (hits.length === 0) throw new Error(`no migration matching ${suffixRe}`);
  return readFileSync(join(dir, hits[hits.length - 1]), 'utf8');
}

describe('drag outcome vocabulary', () => {
  const spine = latestMigration(/_competition_spine\.sql$/);

  it('matches the SQL CHECK constraint exactly, in both directions', () => {
    const m = spine.match(
      /competition_episode_results_outcome_check check \(outcome = any \(array\[([\s\S]*?)\]\)\)/,
    );
    expect(m, 'outcome CHECK constraint not found in the spine migration').toBeTruthy();

    const sqlValues = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
    expect(sqlValues).toEqual([...DRAG_OUTCOMES].sort());
  });

  it('agrees with the SQL ordinal ladder', () => {
    const m = spine.match(
      /create or replace function public\.competition_outcome_rank[\s\S]*?\$\$;/,
    );
    expect(m, 'competition_outcome_rank not found').toBeTruthy();

    const sqlRanks = new Map(
      [...m![0].matchAll(/when '([a-z]+)'\s*then (\d+)/g)].map((x) => [x[1], Number(x[2])]),
    );

    // Every laddered state has the same rank on both sides.
    for (const outcome of DRAG_OUTCOME_LADDER) {
      expect(sqlRanks.get(outcome), `rank mismatch for ${outcome}`).toBe(outcomeRank(outcome));
    }
    // And SQL does not rank anything TS leaves unranked.
    expect([...sqlRanks.keys()].sort()).toEqual([...DRAG_OUTCOME_LADDER].sort());
  });

  it('keeps guest off the ladder', () => {
    expect(DRAG_OUTCOMES).toContain('guest');
    expect(DRAG_OUTCOME_LADDER).not.toContain('guest' as DragOutcome);
    expect(outcomeRank('guest')).toBeNull();
    // The SQL twin must agree, or a guest cameo could be averaged into a
    // placement statistic on one side of the stack but not the other.
    expect(spine).toMatch(/else null end/);
  });

  it('orders the ladder best-first with no gaps', () => {
    const ranks = DRAG_OUTCOME_LADDER.map((o) => outcomeRank(o));
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('normalizeOutcome', () => {
  it('maps the codes the corpus actually uses', () => {
    expect(normalizeOutcome('WIN')).toBe('win');
    expect(normalizeOutcome('HIGH')).toBe('high');
    expect(normalizeOutcome('SAFE')).toBe('safe');
    expect(normalizeOutcome('LOW')).toBe('low');
    expect(normalizeOutcome('BTM')).toBe('bottom');
    expect(normalizeOutcome('ELIM')).toBe('elim');
    expect(normalizeOutcome('Guest')).toBe('guest');
  });

  it('resolves every code US seasons 17 and 18 actually emit', () => {
    // Measured off the live pages, not assumed: these are the exact distinct
    // cell values in both progress tables.
    const observed = [
      'WIN',
      'TOP2',
      'SAFE',
      'BDT',
      'BTM',
      'ELIM',
      'Eliminated',
      'LOSS',
      'Guest',
      'SDADHH',
      'Miss C',
      'Runner-up',
      'Winner',
    ];
    for (const code of observed) {
      expect(normalizeOutcome(code), `observed code ${code} did not resolve`).not.toBeNull();
    }
  });

  it('reads BDT and SDADHH the way the source legend defines them', () => {
    // Both were mapped by intuition first and both were WRONG. The season 17/18
    // legend says BDT means the queen was *saved from elimination* by the
    // Badonka Dunk Tank, and that SDADHH is awarded for *winning* the final
    // Smackdown lip sync. If someone "corrects" these back to the intuitive
    // reading, this test is the argument.
    expect(normalizeOutcome('BDT')).toBe('safe');
    expect(normalizeOutcome('SDADHH')).toBe('win');
    // LOSS is a competing loss by an already-eliminated queen — bottom, not guest.
    expect(normalizeOutcome('LOSS')).toBe('bottom');
  });

  it('does not promote a runner-up or a top-2 finish to a win', () => {
    // Both are "did well", neither is the win. Getting this wrong would inflate
    // every challenge-win count in the corpus.
    expect(normalizeOutcome('RUNNER-UP')).toBe('high');
    expect(normalizeOutcome('TOP2')).toBe('high');
    expect(normalizeOutcome('WIN')).toBe('win');
  });

  it('treats a departure as elim however it is spelled', () => {
    for (const code of ['ELIM', 'ELIMINATED', 'OUT', 'WDR', 'DISQ', 'DQ']) {
      expect(normalizeOutcome(code), code).toBe('elim');
    }
  });

  it('is insensitive to case, spacing, punctuation and footnote markers', () => {
    expect(normalizeOutcome('btm 2')).toBe('bottom');
    expect(normalizeOutcome('Btm-2')).toBe('bottom');
    expect(normalizeOutcome('BTM2[1]')).toBe('bottom');
    expect(normalizeOutcome(' elim. ')).toBe('elim');
    expect(normalizeOutcome('Runner Up')).toBe('high');
  });

  it('returns null for an unknown code rather than bucketing it as safe', () => {
    // This is the whole design. A new twist code must surface as a gap, not
    // masquerade as "nothing happened to her that week".
    expect(normalizeOutcome('SOMENEWTWIST')).toBeNull();
    expect(normalizeOutcome('???')).toBeNull();
    expect(normalizeOutcome('')).toBeNull();
    expect(normalizeOutcome(null)).toBeNull();
    expect(normalizeOutcome(undefined)).toBeNull();
    // Positive control: the function is capable of returning non-null, so the
    // assertions above are not passing on a function that always fails.
    expect(normalizeOutcome('SAFE')).toBe('safe');
  });

  it('never maps an alias to a value outside the CHECK vocabulary', () => {
    for (const code of knownOutcomeCodes()) {
      const mapped = normalizeOutcome(code);
      expect(mapped, `${code} mapped to nothing`).not.toBeNull();
      expect(DRAG_OUTCOMES, `${code} → ${mapped} is not in the vocabulary`).toContain(mapped!);
    }
  });
});
