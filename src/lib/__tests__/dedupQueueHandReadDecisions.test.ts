import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards 99991791028368, which decides the 14 open dedup-review pairs.
//
// EVERY ASSERTION HERE RUNS OVER COMMENT-STRIPPED SQL. That migration's header is ~120
// lines and quotes, verbatim: every uuid it touches, the phrase "misfiled city", the
// Cardiff website and phone, and the reasoning for the pair it deliberately leaves open.
// A `toContain` over the raw file is therefore satisfied by the PROSE while the statement
// it describes is gone -- the vacuous-assertion class CLAUDE.md records repeatedly, most
// recently on the queerness and rope passes.
const MIGRATION = '99991791028368_dedup_review_queue_hand_read_decisions.sql';
const RAW = readFileSync(resolve(__dirname, '../../../supabase/migrations', MIGRATION), 'utf8');

/** Comments only at line start, matching the convention the other guards use. */
const SQL = RAW.split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The executable half, excluding the postcondition block. */
const STATEMENTS = SQL.slice(0, SQL.indexOf('do $verify$'));
/** The postcondition block only. */
const VERIFY = SQL.slice(SQL.indexOf('do $verify$'));

// The pair this file refuses to decide, and the two venues it is about.
const SEOUL_QUEUE_ROW = '36db651b-99b6-44fa-b308-7c0c768842b0';
const SEOUL_SHELL = '8cb9ea00-ac65-4cc4-ae3e-c153da6ec6f5';
const SEOUL_REAL = 'd8efd466-06da-48e2-9bf8-0a7aa2193759';

// The row carrying Cardiff's identity while filed in Auckland.
const CARDIFF_ROW = 'db458e61-138e-4b44-9b11-939abf8dc584';

const REJECTED = [
  '71a525a3-b2d6-47d2-abb0-0cf73bd91d2e', // Labor Club / Labor Bar
  'b932e402-4b5d-461b-a789-594ebd597ebc', // Sultana / Sultana Lounge Bar
  '5df803ac-d494-4537-b4f0-618588508f07', // The Eagle / Eagle (Cardiff row)
  'f6006885-f50b-43c2-9b8e-6dfcef72645d', // Eagle (Cardiff row) / The Eagle Bar
];

const APPROVED_VENUES = [
  'bf594cd4-bf13-40b8-8587-550d275e88ea',
  '12e93a51-9f12-48b2-b4d3-6d05f5a23521',
  '67804bd1-11b4-4aa3-a347-d1cd018ea290',
  '8eef4396-6c87-4404-bfb7-c0a9017adfff',
  'f5fc761c-10a3-4b5f-a475-fba8cb980d13',
  '29f42a88-5ca1-4138-98b7-1b5be5262722',
  '2fd904d9-e3e8-4cdb-a706-3d230324c265',
];

describe('dedup queue hand-read decisions', () => {
  it('positive control: the migration body is non-trivial after stripping comments', () => {
    // Without this, every assertion below is satisfiable by an empty string if the
    // stripper or the filename ever drifts.
    expect(STATEMENTS.length).toBeGreaterThan(400);
    expect(VERIFY.length).toBeGreaterThan(1200);
    expect(STATEMENTS.indexOf('do $verify$')).toBe(-1);
  });

  describe('the pair left open is left ALONE', () => {
    it('the Seoul queue row is never approved or rejected', () => {
      // It is named in the header as deliberately undecided. If it reaches either
      // decision RPC the file has silently done what its own prose refuses to do.
      expect(STATEMENTS).not.toContain(SEOUL_QUEUE_ROW);
    });

    it('neither Seoul venue is merged', () => {
      expect(STATEMENTS).not.toContain(SEOUL_SHELL);
      expect(STATEMENTS).not.toContain(SEOUL_REAL);
    });

    it('a postcondition asserts exactly ONE pair stays open, and that it is that pair', () => {
      // "no open pairs" and "one open pair" are different claims, and the second is the
      // one this file makes. Asserting only the count would pass if some OTHER pair were
      // the survivor and the Seoul pair had been decided.
      expect(VERIFY).toMatch(/v_open\s*<>\s*1/);
      expect(VERIFY).toContain(SEOUL_QUEUE_ROW);
    });

    it('scopes the one-open assertion to this hand-read batch', () => {
      // The producer may legitimately enqueue another pair between authoring and
      // deployment. That must not abort db push for an unrelated new queue row.
      const count = VERIFY.slice(
        VERIFY.indexOf('select count(*) into v_open'),
        VERIFY.indexOf("if v_open <> 1"),
      );
      expect(count).toContain('and id in (');
      expect(count).toContain(SEOUL_QUEUE_ROW);
      expect(count).toContain('71a525a3-b2d6-47d2-abb0-0cf73bd91d2e');
    });

    it('a postcondition asserts the Seoul rows are still canonical', () => {
      // ANCHORED ON CODE, NOT ON THE "P8" LABEL. After comment-stripping, `P8` survives
      // only inside its own RAISE string, which sits AFTER the ids it is about -- so
      // slicing from the label yields a span that cannot contain them, and the
      // assertion fails on correct code. CLAUDE.md records this exact trap twice
      // (`verify.indexOf('P3')` finding `'P3 failed'`). Window around the id instead.
      const at = VERIFY.indexOf(SEOUL_SHELL);
      expect(at).toBeGreaterThan(-1);
      const window = VERIFY.slice(at - 200, at + 400);
      expect(window).toContain(SEOUL_REAL);
      expect(window).toMatch(/duplicate_of_id is not null/);
    });
  });

  describe('the Cardiff-identity row is rejected, never merged', () => {
    it('it is never an argument to approve_dedup_review or merge_venues', () => {
      // Merging it in either direction fuses a Welsh bar's identity into a New Zealand
      // venue. The only statements that may name it are the two rejections.
      const approves = STATEMENTS.slice(STATEMENTS.indexOf('$venues$'));
      expect(approves).not.toContain(CARDIFF_ROW);
    });

    it('both Eagle pairs are rejected with a note that says WHY', () => {
      const rejectBlock = STATEMENTS.slice(
        STATEMENTS.indexOf('do $reject$'),
        STATEMENTS.indexOf('$reject$;') + 9,
      );
      expect(rejectBlock).toContain('5df803ac-d494-4537-b4f0-618588508f07');
      expect(rejectBlock).toContain('f6006885-f50b-43c2-9b8e-6dfcef72645d');
      // The note must name the mechanism, not merely say "distinct" -- the next reader
      // needs to know the row is misfiled rather than that a pair was declined.
      expect(rejectBlock).toMatch(/eaglecardiff\.com/);
      expect(rejectBlock).toMatch(/misfiled/i);
    });

    it('a postcondition asserts it stayed live', () => {
      // P5 on its own ("the Auckland duplicate is closed") is satisfied by a sweep that
      // merged all three Eagles. P5b is the half that refuses that.
      const p5b = VERIFY.slice(VERIFY.indexOf('P5b'));
      expect(p5b).toContain(CARDIFF_ROW);
      expect(p5b).toMatch(/must stay live/i);
    });
  });

  describe('every rejection is re-readable', () => {
    it('all four rejections pass a non-empty note', () => {
      for (const id of REJECTED) {
        // SCOPED TO THE ONE CALL. A slice that merely starts at the id reaches forward
        // into the NEXT rejection's note, so an emptied note still matches -- the
        // reach-forward trap this repo has recorded on several guards. Each call ends
        // with `');`, which closes the note literal and the call together, and no note
        // contains that sequence.
        const from = STATEMENTS.indexOf(id);
        expect(from).toBeGreaterThan(-1);
        const end = STATEMENTS.indexOf("');", from);
        expect(end).toBeGreaterThan(from);
        const call = STATEMENTS.slice(from, end);
        // A rejection with no note is a decision nobody can re-read.
        expect(call).toMatch(/'[^']{20,}/);
      }
    });

    it('a postcondition requires the note to be present in the DATA, not just the call', () => {
      // Anchored on the predicate, not the "P2" label -- see the note on the Seoul
      // canonical assertion for why a label anchor is empty here.
      expect(VERIFY).toMatch(/coalesce\(btrim\(reviewer_note\)/);
      expect(VERIFY).toMatch(/status = 'rejected'/);
      expect(VERIFY).toMatch(/v_n\s*<>\s*4/);
    });
  });

  describe('the event flip', () => {
    it('the Matteo Lane pair passes an explicit keep id, not null', () => {
      const events = STATEMENTS.slice(STATEMENTS.indexOf('do $events$'));
      // Approving as queued would publish "Paramount Theatre Club Seating: ..." as the
      // title a reader meets. The flip is the whole point of that call.
      expect(events).toMatch(
        /approve_dedup_review\('6cdba7da-fec3-498e-ab66-d7c09df82ce5'::uuid,\s*\n?\s*'fe18132a-e454-4049-8398-ccbce7abf0c8'::uuid\)/,
      );
    });

    it('the Texas pair does NOT flip', () => {
      const events = STATEMENTS.slice(STATEMENTS.indexOf('do $events$'));
      expect(events).toMatch(
        /approve_dedup_review\('70081002-5404-4fb4-9d9e-28e974c075fb'::uuid,\s*null\)/,
      );
    });

    it('a postcondition asserts the flip by TITLE, not by status', () => {
      // "approved" is equally true of the unflipped direction. The title comparison is
      // the only thing that distinguishes them, and it IS code -- so assert it on the
      // whole verify block rather than slicing from the "P4" label, which after
      // comment-stripping survives only in the RAISE text below it.
      expect(VERIFY).toMatch(/v_name is distinct from 'Matteo Lane & Bob The Drag Queen'/);
      expect(VERIFY).toContain('2592aba3-fe68-4106-94fd-aaaeab09e54b');
    });
  });

  describe('the off-queue Auckland merge', () => {
    it('merges the Eagle Bar INTO The Eagle, not the reverse', () => {
      const eagle = STATEMENTS.slice(STATEMENTS.indexOf('do $eagle$'));
      expect(eagle).toMatch(
        /merge_venues\('943513fb-7449-4297-a26a-a6311312285f'::uuid,\s*\n?\s*'83cb5fdd-b85d-4d55-9ce0-0f1c8f885aaa'::uuid\)/,
      );
    });

    it('is guarded so a re-run is a no-op rather than an error', () => {
      const eagle = STATEMENTS.slice(STATEMENTS.indexOf('do $eagle$'));
      expect(eagle).toMatch(/if exists[\s\S]{0,200}duplicate_of_id is null/);
    });
  });

  describe('postcondition discipline', () => {
    it('counts the reached state positively, never rows-in-a-bad-state', () => {
      // A count of rows in a bad state returns zero for a row that has gone missing from
      // the corpus entirely, which is exactly what a wrong merge would produce.
      expect(VERIFY).toMatch(/v_n\s*<>\s*9/); // approvals
      expect(VERIFY).toMatch(/v_n\s*<>\s*8/); // live canonical keeps
      expect(VERIFY).toMatch(/v_n\s*<>\s*5/); // rejected pairs still canonical
    });

    it('carries no loosened comparison and no short-circuit', () => {
      // Neutering a postcondition to `< 0`, or its predicate to `where false`, leaves
      // every string-anchored assertion above green while the check has stopped checking.
      expect(VERIFY).not.toMatch(/v_(n|open)\s*<\s*0/);
      expect(VERIFY).not.toMatch(/where\s+false/i);
      expect(VERIFY).not.toMatch(/v_(n|open)\s+int\s*:=\s*[1-9]/);
    });

    it('every postcondition reads a real table', () => {
      const reads = (VERIFY.match(/from public\.(dedup_review_queue|venues|events)/g) ?? []).length;
      expect(reads).toBeGreaterThanOrEqual(7);
    });

    it('asserts merges are reversible by requiring an audit id', () => {
      // Without merge_audit_id the merge cannot be undone by unmerge_venues /
      // unmerge_entities, which is the only reason to route through approve_dedup_review
      // instead of writing duplicate_of_id by hand.
      expect(VERIFY).toMatch(/merge_audit_id is not null/);
    });
  });

  describe('the approve set is exactly what the header claims', () => {
    it('all 7 venue queue rows are approved', () => {
      const venues = STATEMENTS.slice(
        STATEMENTS.indexOf('do $venues$'),
        STATEMENTS.indexOf('$venues$;') + 9,
      );
      for (const id of APPROVED_VENUES) expect(venues).toContain(id);
    });

    it('no rejected pair is also approved', () => {
      const approves = STATEMENTS.slice(STATEMENTS.indexOf('do $venues$'));
      for (const id of REJECTED) expect(approves).not.toContain(id);
    });
  });
});
