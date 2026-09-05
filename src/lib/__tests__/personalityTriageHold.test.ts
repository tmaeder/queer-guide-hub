import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `personalities.enrichment_status->>'triage' = 'insufficient_data'` IS NOT A
 * DATA-QUALITY VERDICT. On at least part of the cohort it is an OUTING-SAFETY
 * HOLD, and the name actively hides that.
 *
 * This test exists because the mistake was nearly made. The reasoning that leads
 * to it is short, correct-sounding, and wrong:
 *
 *   1. 4,403 personalities carry the sentinel, ALL with the identical
 *      `triage_at` of 2026-06-07 11:11:47.37957+00 — one bulk stamp, not 4,403
 *      individual judgements.
 *   2. Nothing in supabase/migrations or supabase/functions writes it. It was
 *      applied out-of-band, so there is no code stating its purpose.
 *   3. 1,092 of them hold a resolved `wikidata_qid` — Aaron Carter, Abdellah
 *      Taïa, Adam Silvera, Adolf Brand. A QID is the opposite of "insufficient
 *      data"; the facts are one API call away.
 *   4. The sentinel is what excludes them from `personality_data_health`, which
 *      is the ONLY work list `personality-refresh` reads. So it permanently
 *      removes 27.6% of the corpus from enrichment.
 *
 * Every one of those four statements is true, and the conclusion "therefore
 * clear the sentinel and let the refresher fill their images" is dangerous.
 *
 * Reading an actual row's `enrichment_status` is what settles it. They carry a
 * human review under `import_arbeitsliste_2026_06`:
 *
 *   "[zu prüfen: Queerness nicht belegt (lebende Person)]; Queerness nicht
 *    verifizierbar: keine oeffentliche Selbstauskunft auffindbar; lebende
 *    Person -> kein Outing; Eintrag Ralf zur Pruefung/ggf. Entfernung vorlegen."
 *
 *   ("queerness not documented (living person); not verifiable: no public
 *    self-disclosure findable; LIVING PERSON -> NO OUTING; present entry to Ralf
 *    for review / possible removal.")
 *
 * So the hold keeps living, non-self-disclosed people OUT of an LGBTQ+
 * platform's enrichment pipeline. Clearing it would fetch their photographs and
 * biographical detail and build them a richer public profile on a queer
 * directory. That is the harm, not a missing thumbnail.
 *
 * MEASURED ON PROD 2026-09-04, the 1,092 QID-bearing rows:
 *   309 carry a review note, 783 carry NO RECORDED REASON AT ALL
 *   652 are living
 *   2 say "kein Outing" verbatim; 37 say queerness is unverified
 *
 * The rationale is therefore explicit on a MINORITY. That is exactly why the
 * cohort must not be cleared in bulk: per row, it is not knowable from the data
 * whether the verdict meant "thin" or "do not out this person", and the two
 * errors are not symmetric. Being wrong in one direction leaves a page without a
 * photo. Being wrong in the other is irreversible and lands on a real person.
 *
 * WHAT A LEGITIMATE CHANGE LOOKS LIKE: per-row, human, with the reason recorded
 * — not a predicate over the cohort. The 783 reasonless rows are a real defect,
 * but the fix is for someone who knows the review's intent to write the reasons
 * down, not for an automated pass to infer them from the absence.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const FUNCTIONS = join(__dirname, '..', '..', '..', 'supabase', 'functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/**
 * Statements that would release the hold across many rows at once.
 *
 * Deliberately index-based rather than one big regex: a lazy `[\s\S]{0,1200}?`
 * over 899 migration files backtracks hard enough to blow the 15s test timeout,
 * which is a failure that looks exactly like a real finding.
 */
function bulkTriageReleases(sql: string): string[] {
  const hits: string[] = [];
  const lower = sql.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf('update', from);
    if (at === -1) break;
    from = at + 6;
    // Bound the statement: to the next ';' or 1,200 chars, whichever is first.
    const end = lower.indexOf(';', at);
    const stmt = sql.slice(at, end === -1 ? at + 1200 : Math.min(end + 1, at + 1200));
    const s = stmt.toLowerCase();
    if (!/^update\s+(public\.)?personalities\b/.test(s)) continue;
    const touchesTriage =
      /enrichment_status\s*-\s*'triage'/.test(s) ||
      (s.includes("'triage'") && s.includes('jsonb_set')) ||
      s.includes("- 'triage'");
    if (!touchesTriage) continue;
    // A single-row, explicitly-identified change is a human decision and is fine.
    if (/\bid\s*=\s*'[0-9a-f-]{36}'/.test(s)) continue;
    hits.push(stmt.slice(0, 200));
  }
  return hits;
}

const sqlFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));

/**
 * Read every migration ONCE at module scope. Doing it per test blew the default
 * 15s timeout: ~900 files in an iCloud-synced checkout is genuinely slow I/O,
 * and a timeout here is indistinguishable from a real finding — which is the
 * worst failure mode a guard can have.
 */
const migrations = sqlFiles.map((f) => ({ f, sql: readFileSync(join(MIGRATIONS, f), 'utf8') }));

describe('the personality triage hold is never released in bulk', () => {
  it('the migration scan is actually reading files', () => {
    // Positive control: without this, a broken path makes every assertion below
    // pass by finding nothing.
    expect(migrations.length).toBeGreaterThan(800);
    expect(
      migrations.some(({ sql }) => /personalities/i.test(sql)),
      'no migration mentions personalities — scan is broken',
    ).toBe(true);
  });

  it('no migration clears insufficient_data across a predicate', () => {
    const offenders: string[] = [];
    for (const { f, sql } of migrations) {
      if (!sql.includes('insufficient_data') && !sql.includes("'triage'")) continue;
      for (const stmt of bulkTriageReleases(sql)) offenders.push(`${f}: ${stmt}`);
    }
    expect(
      offenders,
      'A migration releases the personality triage hold in bulk. On at least part of this\n' +
        'cohort that hold is an OUTING-SAFETY decision for LIVING people with no public\n' +
        'self-disclosure — 652 of the 1,092 QID-bearing rows are living, and 783 carry no\n' +
        'recorded reason at all, so the intent is NOT recoverable from the row. Release it\n' +
        'per row, with a human, recording the reason. Read the docblock in this file.',
    ).toEqual([]);
  });

  it('no edge function writes or clears the triage key on personalities', () => {
    // The refresher is allowed to READ the exclusion (it does so via the
    // personality_data_health view). Nothing should be mutating the hold.
    const offenders: string[] = [];
    for (const file of walk(FUNCTIONS)) {
      const src = readFileSync(file, 'utf8');
      if (!/insufficient_data/.test(src)) continue;
      // source-reliability uses the same string for an unrelated weight verdict.
      if (/source_reliability|weight/i.test(src)) continue;
      if (/from\(['"]personalities['"]\)/.test(src)) offenders.push(file);
    }
    expect(offenders, 'an edge function mutates the personality triage hold').toEqual([]);
  });
});
