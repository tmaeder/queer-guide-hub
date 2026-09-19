import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99960101100000 — the 2026-08-30 flip residue: a misfiled summary on
 * `queening`, and the eight-row surname-stub class that `kerle` led to.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `seo_indexable` IS NEVER WRITTEN, by either UPDATE. The design is that
 *    nulling the prose makes `tag_has_prose` false and `trg_tag_thin_page_gate`
 *    — BEFORE UPDATE **OF description** — sets the flag and stamps
 *    `seo_deindex_reason='thin'` itself. 'thin' is the ONLY reason value
 *    `run_tag_thin_page_reindex` will reverse, so a file that sets the column
 *    takes ownership of a flag the gate owns and is free to stamp a reason that
 *    makes the deindexing a one-way door. A naive end-state check passes either
 *    way, which is why this is asserted on what is WRITTEN.
 *
 * 2. NO PROSE IS AUTHORED. Both repairs null; neither writes replacement text.
 *    Writing a glossary definition of "painter" or "teacher" is minting
 *    vocabulary to fill a hole left by a bad lookup — the guess this whole class
 *    came from. A `description = '...'` here means the file has become the
 *    retired rewrite experiment wearing a fix's clothes.
 *
 * 3. EACH UPDATE TOUCHES ONLY ITS OWN FIELD. `queening` keeps a correct
 *    description and a correct 400-char body; the stubs keep nothing but their
 *    (null) summary. Crossing the two fields over is the mirror defect — the
 *    casting/watersports rule, repair only the wrong FIELDS.
 *
 * 4. THE STUB UPDATE'S "NO OTHER PROSE" GUARD IS LOAD-BEARING, NOT TIDINESS.
 *    Without `short_description is null` and an empty `long_description`, the
 *    statement would null the lead on a row that still has a real body, leaving
 *    the body standing while tag_has_prose() goes false — deindexing a page that
 *    still has genuine content.
 *
 * 5. THE SENTINEL RESTATEMENT KEEPS EVERY PRE-EXISTING KEY AND THE LOAD-BEARING
 *    ANCHOR. This is a `create or replace` of a function that already had five
 *    keys; silently dropping one turns a live check off while the new key makes
 *    the diff look purely additive. The `unresolved_disambiguation` anchor in
 *    particular exists because a bare "(may|could) refer to" matches
 *    pansexuality's perfectly correct prose.
 *
 * 6. THE POSTCONDITIONS STAY UNNEUTERED. `where false`, a pre-seeded counter, or
 *    a loosened comparison leaves every string-anchored assertion green while the
 *    check has stopped checking — and P1 is keyed on the DEFECT corpus-wide, so
 *    narrowing it to this file's own slug list would let a ninth row through.
 *
 * 7. THE NEW SENTINEL KEY IS READ BY CI. A sentinel nothing consumes is the
 *    "shipped and wired to nothing" failure; the health script must both REQUIRE
 *    the key and hard-fail on a non-zero count.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99960101100000_tag_prose_surname_stubs_and_queening.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

// Comments quote the defect verbatim — including the literal 'Drag culture
// performance art' and the surname-stub text — and would satisfy most of the
// assertions below against a file whose statements had been gutted.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verifyAt = bare.indexOf('do $verify$');
const statements = bare.slice(0, verifyAt);
const verify = bare.slice(verifyAt);

const fnAt = statements.indexOf('create or replace function');
const updates = statements.slice(0, fnAt);
const sentinel = statements.slice(fnAt);

// The two UPDATEs, each split into what it WRITES and what it GUARDS ON. A
// "must not write X" assertion belongs on the SET clause: every WHERE quotes the
// defect it is removing, so asserting over a whole statement is satisfied by the
// guard and stays green when the SET clause changes.
const updateBlocks = updates
  .split(/\bupdate\s+public\./i)
  .slice(1)
  .map((block) => {
    const w = block.search(/\bwhere\b/i);
    return { set: block.slice(0, w), where: block.slice(w), all: block };
  });

const queening = updateBlocks.find((b) => /'queening'/.test(b.where));
const stubs = updateBlocks.find((b) => /Notable people with the/.test(b.where));

const HEALTH = join(process.cwd(), 'scripts/check-pipeline-health.mjs');
const health = readFileSync(HEALTH, 'utf8');

describe('99960101100000 — surname stubs and the queening summary', () => {
  it('has exactly the two UPDATEs, each identifiable by its own guard', () => {
    expect(updateBlocks).toHaveLength(2);
    expect(queening).toBeDefined();
    expect(stubs).toBeDefined();
  });

  it('declares an actor — load-bearing for queening, which is human_reviewed', () => {
    // Probed live with a REAL value change: the undeclared write is refused with
    // "human_reviewed tag ... cannot be modified by system:trigger". A
    // self-assignment fires no trigger, so that probe must never be the evidence.
    expect(statements).toMatch(
      /set_config\(\s*'app\.actor'\s*,\s*'migration:99960101100000[^']*'\s*,\s*true\s*\)/i,
    );
  });

  describe('queening — the misfiled summary', () => {
    it('nulls short_description and writes nothing else', () => {
      expect(queening!.set).toMatch(/\bshort_description\s*=\s*null\b/i);
      expect(queening!.set).not.toMatch(/\bshort_description\s*=\s*'/i);
      // The description and the 400-char body are CORRECT and must survive.
      expect(queening!.set).not.toMatch(/(^|[^_])\bdescription\s*=/i);
      expect(queening!.set).not.toMatch(/\blong_description\b/i);
    });

    it('is content-guarded on the drag text and scoped to active', () => {
      expect(queening!.where).toMatch(/'Drag culture performance art'/);
      expect(queening!.where).toMatch(/status\s*=\s*'active'/i);
    });

    it('never writes the index flag or its reason', () => {
      expect(queening!.set).not.toMatch(/\bseo_indexable\b/i);
      expect(queening!.set).not.toMatch(/\bseo_deindex_reason\b/i);
    });
  });

  describe('the surname stubs', () => {
    it('nulls description and authors no replacement prose', () => {
      expect(stubs!.set).toMatch(/\bdescription\s*=\s*null\b/i);
      expect(stubs!.set).not.toMatch(/\bdescription\s*=\s*'/i);
    });

    it('never writes the index flag or its reason — the gate owns both', () => {
      expect(stubs!.set).not.toMatch(/\bseo_indexable\b/i);
      expect(stubs!.set).not.toMatch(/\bseo_deindex_reason\b/i);
    });

    it('never writes short_description, long_description or human_reviewed', () => {
      // human_reviewed=true is the documented escape hatch for a deliberate
      // revive; stamping it here would assert a review that never happened.
      expect(stubs!.set).not.toMatch(/\bshort_description\b/i);
      expect(stubs!.set).not.toMatch(/\blong_description\b/i);
      expect(stubs!.set).not.toMatch(/\bhuman_reviewed\b/i);
    });

    it('is guarded on the stub SHAPE, both arms', () => {
      expect(stubs!.where).toMatch(/Notable people with the \(surname\|given name\|name\)/);
      expect(stubs!.where).toMatch(/is a surname/);
      expect(stubs!.where).toMatch(/status\s*=\s*'active'/i);
    });

    it('refuses any row that carries other prose — this is what makes nulling safe', () => {
      expect(stubs!.where).toMatch(/short_description\s+is\s+null/i);
      expect(stubs!.where).toMatch(/btrim\(\s*long_description[^)]*\)\s*,\s*''\s*\)\s*=\s*''/i);
    });
  });

  describe('the sentinel restatement', () => {
    it('adds surname_stub with both measured arms', () => {
      expect(sentinel).toMatch(/'surname_stub'/);
      const arm = sentinel.slice(sentinel.indexOf("'surname_stub'"));
      expect(arm).toMatch(/Notable people with the \(surname\|given name\|name\)/);
      expect(arm).toMatch(/is a surname/);
    });

    it('keeps every pre-existing key — a replace that drops one turns a live check off', () => {
      for (const key of [
        'probe_ok',
        'rows_scanned',
        'truncated_description',
        'stamp_as_definition',
        'unresolved_disambiguation',
        'whitespace_dirty',
      ]) {
        expect(sentinel).toMatch(new RegExp(`'${key}'`));
      }
    });

    it('keeps the anchor on unresolved_disambiguation', () => {
      // A bare "(may|could) refer to" matches pansexuality's correct prose.
      const arm = sentinel.slice(sentinel.indexOf("'unresolved_disambiguation'"));
      expect(arm.slice(0, 200)).toMatch(/\^\[\^\.!\?\]\{0,60\}\(may\|could\) refer to/);
    });

    it('keeps the exception handler that makes a broken probe say so', () => {
      expect(sentinel).toMatch(/exception when others then/i);
      expect(sentinel).toMatch(/'probe_ok'\s*,\s*false/i);
    });
  });

  describe('the postconditions', () => {
    it('has all six and every one reads unified_tags or the sentinel', () => {
      for (const p of [
        'P1 FAILED',
        'P2 FAILED',
        'P3 FAILED',
        'P4 FAILED',
        'P5 FAILED',
        'P6 FAILED',
      ]) {
        expect(verify).toMatch(new RegExp(p));
      }
      const reads = verify.match(/from\s+public\.unified_tags/gi) ?? [];
      expect(reads.length).toBeGreaterThanOrEqual(4);
      expect(verify).toMatch(/tag_prose_standard_signals\(\)/);
    });

    it("keys P1 on the defect corpus-wide, not on this file's slug list", () => {
      const p1 = verify.slice(0, verify.indexOf('P1 FAILED'));
      expect(p1).toMatch(/Notable people with the/);
      expect(p1).not.toMatch(/\bslug\s+in\s*\(/i);
    });

    it('asserts the GATE deindexed the stubs as thin', () => {
      const p2 = verify.slice(verify.indexOf('P2 FAILED') - 600, verify.indexOf('P2 FAILED'));
      expect(p2).toMatch(/seo_indexable\s+is\s+false/i);
      expect(p2).toMatch(/seo_deindex_reason\s*=\s*'thin'/i);
    });

    it("asserts queening's correct prose SURVIVES, not just that the defect is gone", () => {
      expect(verify).toMatch(/Sitting on a partner''s face for oral sex/);
      expect(verify).toMatch(/\^Queening is facesitting/);
      expect(verify).toMatch(/queening lost or altered its correct description/);
      expect(verify).toMatch(/queening lost or altered its correct long_description/);
    });

    it('calls tag_has_prose rather than restating its OR', () => {
      expect(verify).toMatch(/public\.tag_has_prose\(\s*description\s*,\s*short_description\s*\)/i);
    });

    it('keeps the mirror controls — a sweep that took everything must fail', () => {
      const p5 = verify.slice(verify.indexOf('P5 FAILED') - 600, verify.indexOf('P5 FAILED'));
      for (const slug of ['sober', 'white-knight', 'safe-call', 'docking']) {
        expect(p5).toMatch(new RegExp(`'${slug}'`));
      }
      expect(p5).toMatch(/seo_indexable/i);
    });

    it('checks the new sentinel key is PRESENT separately from its value', () => {
      expect(verify).toMatch(/\?\s*'surname_stub'/);
      expect(verify).toMatch(/->>'surname_stub'\)::int\s*<>\s*0/);
    });

    it('is not neutered', () => {
      // A short-circuited predicate leaves the slug lists, the regexes and the
      // comparison all intact while the check has stopped counting.
      expect(verify).not.toMatch(/\bwhere\s+false\b/i);
      expect(verify).not.toMatch(/\bv_bad\s*:?=\s*0\s*;/);
      const conditions = verify.match(/if\s+v_bad\s*<>\s*0\s+then/gi) ?? [];
      expect(conditions.length).toBe(4);
      // No loosened comparison anywhere in the block.
      expect(verify).not.toMatch(/if\s+v_bad\s*[<>]\s*0\s+then/i);
    });
  });

  describe('CI wiring — a sentinel nothing reads is not a sentinel', () => {
    it('requires the surname_stub key', () => {
      const keyList = health.slice(health.indexOf("for (const key of ['truncated_description'"));
      expect(keyList.slice(0, 200)).toMatch(/'surname_stub'/);
    });

    it('hard-fails on a non-zero count rather than warning', () => {
      const at = health.indexOf('const surname = Number(ts.surname_stub');
      expect(at).toBeGreaterThan(-1);
      const block = health.slice(at, at + 3200);
      expect(block).toMatch(/if\s*\(surname\s*>\s*0\)\s*\{/);
      const branch = block.slice(block.indexOf('if (surname > 0)'));
      expect(branch.slice(0, 900)).toMatch(/FAILED\s*=\s*true/);
    });

    it('includes surname_stub in the all-clear condition', () => {
      expect(health).toMatch(/surname\s*===\s*0[^)]*\)\s*\{/);
    });
  });
});
