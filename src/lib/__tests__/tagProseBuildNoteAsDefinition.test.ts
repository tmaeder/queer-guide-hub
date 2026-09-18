import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99910101100000 — an internal build note published as the definition on
 * 68 indexable glossary pages.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `seo_indexable` IS NEVER WRITTEN. The whole design is that nulling the note
 *    makes `tag_has_prose` false and `trg_tag_thin_page_gate` — which is BEFORE
 *    UPDATE **OF description**, so it fires on this statement — sets the flag and
 *    stamps `seo_deindex_reason='thin'` itself. A later pass that "helpfully"
 *    added `seo_indexable = false` to the SET clause would still pass a naive
 *    end-state check while silently taking ownership of a flag the gate owns,
 *    and would be free to stamp a different reason (see 2).
 *
 * 2. THE REASON MUST REMAIN 'thin', AND THIS FILE MUST NOT SET IT. 'thin' is the
 *    one value the hardened re-index arm of `run_tag_thin_page_reindex` will
 *    reverse, so a real definition written later republishes the page on its own.
 *    Any other reason makes this a one-way door — the exact failure that arm's
 *    own comment exists to prevent.
 *
 * 3. NO PROSE IS AUTHORED. The repair nulls; it never writes replacement text.
 *    Writing 68 definitions is the LLM rewrite both auto-apply paths were retired
 *    for. If this file ever grows a `description = '...'` it has become the
 *    retired experiment wearing a fix's clothes.
 *
 * 4. THE UPDATE IS CONTENT-GUARDED AND SCOPED TO ACTIVE. Without the guard on the
 *    note's own text this is a blanket null of `description`; the guard is what
 *    makes it no-op row-by-row under a concurrent repair.
 *
 * 5. THE POSTCONDITIONS STAY POSITIVE AND UNNEUTERED. PC2 counts rows in the
 *    REACHED state and compares to the cohort total; the tempting inverse (count
 *    rows in a bad state, assert 0) returns zero for a cohort that has vanished
 *    entirely. `where false`, a pre-seeded counter, or a loosened comparison
 *    leaves every string-anchored assertion green while the check has stopped
 *    checking.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99910101100000_tag_prose_build_note_as_definition.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

// Comments quote the defect verbatim and would satisfy several assertions below.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verifyAt = bare.indexOf('do $verify$');
const statements = bare.slice(0, verifyAt);
const verify = bare.slice(verifyAt);

// Every UPDATE's SET clause, isolated from its WHERE guard — a "must not write X"
// assertion belongs on what is WRITTEN, and every guard quotes the defect.
const setClauses = statements
  .split(/\bupdate\s+public\./i)
  .slice(1)
  .map((s) => s.slice(0, s.search(/\bwhere\b/i)))
  .join('\n');

describe('99910101100000 — build note published as a definition', () => {
  it('nulls the description and writes nothing else', () => {
    expect(setClauses).toMatch(/\bdescription\s*=\s*null\b/i);
    // No replacement prose, ever.
    expect(setClauses).not.toMatch(/\bdescription\s*=\s*'/i);
  });

  it('never writes seo_indexable or seo_deindex_reason — the gate owns both', () => {
    expect(setClauses).not.toMatch(/\bseo_indexable\b/i);
    expect(setClauses).not.toMatch(/\bseo_deindex_reason\b/i);
  });

  it('never writes short_description or long_description', () => {
    expect(setClauses).not.toMatch(/\bshort_description\b/i);
    expect(setClauses).not.toMatch(/\blong_description\b/i);
  });

  it('guards the UPDATE on the note itself and scopes it to active rows', () => {
    const update = statements.slice(statements.search(/\bupdate\s+public\./i));
    expect(update).toMatch(/Vocabulary concept folded from the .\* catalog/);
    expect(update).toMatch(/status\s*=\s*'active'/i);
  });

  it('declares an actor — all 68 rows are human_reviewed', () => {
    expect(statements).toMatch(
      /set_config\(\s*'app\.actor'\s*,\s*'admin:tag-prose-build-note-as-definition'\s*,\s*true\s*\)/i,
    );
  });

  it('touches exactly one table and one statement', () => {
    const updates = statements.match(/\bupdate\s+public\./gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(statements).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('asserts the defect is gone corpus-wide, not on a slug list', () => {
    expect(verify).toMatch(/Vocabulary concept folded from the .\* catalog/);
    // A slug list would make the check blind to rows another producer adds.
    expect(verify).not.toMatch(/slug\s+in\s*\([^)]*'musician'/i);
  });

  it('keeps PC2 positive — reached state compared to the cohort total', () => {
    expect(verify).toMatch(/v_bad\s*<>\s*v_total/);
    expect(verify).toMatch(/seo_deindex_reason\s*=\s*'thin'/);
    expect(verify).toMatch(/tag_has_prose\s*\(/);
  });

  it('calls the real thin-page predicate rather than restating it', () => {
    // BOTH PC2 and PC3 must call it. Asserting merely that the string appears
    // somewhere is satisfied by either one alone, so a mutation that restates
    // the predicate in PC2 survives on PC3's call — which is exactly what the
    // first mutation round found.
    const calls = verify.match(/public\.tag_has_prose\s*\(/g) ?? [];
    expect(calls).toHaveLength(2);
    // Restating it as an AND silently changes the meaning: tag_has_prose is an
    // OR over non-emptiness. The alias is optional — the hand-rolled form is
    // written `t.description ...` inside the joined query.
    expect(verify).not.toMatch(
      /\b(?:\w+\.)?description\s+is\s+not\s+null\s+and\s+(?:\w+\.)?short_description\s+is\s+not\s+null/i,
    );
  });

  it('re-asserts the gate invariant corpus-wide', () => {
    expect(verify).toMatch(/merged_into_id\s+is\s+null\s+and\s+seo_indexable/i);
  });

  it('keeps a mirror assertion on rows outside the pass', () => {
    for (const slug of ['aftercare', 'chosen-family', 'consent']) {
      expect(verify).toContain(`'${slug}'`);
    }
  });

  it('cannot be neutered: four live checks, none loosened', () => {
    const comparisons = verify.match(/if v_bad [<>=]+ /g) ?? [];
    expect(comparisons).toHaveLength(4);
    for (const c of comparisons) expect(c).toBe('if v_bad <> ');

    const reads = verify.match(/select count\(\*\) into v_bad/g) ?? [];
    expect(reads).toHaveLength(4);

    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/); // no pre-seeded counter

    // Every check must actually read the table it is about.
    const scans = verify.match(/from public\.(unified_tags|silo_fold_audit)/g) ?? [];
    expect(scans.length).toBeGreaterThanOrEqual(4);
  });
});
