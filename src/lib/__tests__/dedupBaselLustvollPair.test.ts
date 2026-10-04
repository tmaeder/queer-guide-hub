import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards 99991791108042, which decides the one dedup-review pair the sweep queued after
// 99991791028368 worked the queue.
//
// ASSERTIONS RUN OVER COMMENT-STRIPPED SQL. That migration's header quotes both event
// ids, both venue ids, the venue address and the rejected description signal, so a raw
// `toContain` is satisfied by the prose while the statement it describes is gone.
const MIGRATION = '99991791108042_dedup_basel_lustvoll_event_pair.sql';
const RAW = readFileSync(resolve(__dirname, '../../../supabase/migrations', MIGRATION), 'utf8');

const SQL = RAW.split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const STATEMENTS = SQL.slice(0, SQL.indexOf('do $verify$'));
const VERIFY = SQL.slice(SQL.indexOf('do $verify$'));

const QUEUE_ROW = '118967db-278e-4898-a90c-37bebb961db3';
const KEEP = '0f1a14f1-70a3-4b7a-bab8-d6793a0ba198'; // "Lust*voll Party"
const DROP = '6e74090c-ca84-439f-8b01-47c98ce86869'; // "Lust*voll"
// The venue duplicate underneath, deliberately left alone.
const VENUE_FULL = '4da5bd9a-c933-4aea-85de-ee0ecf14bb4f'; // Gannet - Holzpark Klybeck
const VENUE_SHORT = '90ecf805-4e3b-45ff-8a49-fd7eae033097'; // Gannet (holds the only website)
// The pair 99991791028368 left open by design.
const SEOUL_QUEUE_ROW = '36db651b-99b6-44fa-b308-7c0c768842b0';

describe('Basel Lust*voll dedup pair', () => {
  it('positive control: the body is non-trivial after stripping comments', () => {
    expect(STATEMENTS.length).toBeGreaterThan(200);
    expect(VERIFY.length).toBeGreaterThan(800);
    expect(STATEMENTS.indexOf('do $verify$')).toBe(-1);
  });

  describe('the decision', () => {
    it('approves the queued pair with NO flip', () => {
      // Unlike the Matteo Lane pair in 99991791028368, the sweep's keep here is the
      // complete title, so a second argument would silently reverse a correct direction.
      expect(STATEMENTS).toMatch(
        new RegExp(`approve_dedup_review\\('${QUEUE_ROW}'::uuid,\\s*null\\)`),
      );
    });

    it('asserts the canonical BY ID, not merely that the pair is approved', () => {
      // "approved" is equally true of the flipped direction.
      expect(VERIFY).toContain(KEEP);
      expect(VERIFY).toMatch(/direction flipped/i);
    });

    it('asserts the drop is a duplicate OF THE KEEP specifically', () => {
      // `duplicate_of_id is not null` would pass if the row had been merged into some
      // third event entirely.
      const at = VERIFY.indexOf(DROP);
      expect(at).toBeGreaterThan(-1);
      expect(VERIFY.slice(at, at + 220)).toMatch(
        new RegExp(`duplicate_of_id = '${KEEP}'`),
      );
    });

    it('requires a merge audit id, so the merge is reversible', () => {
      expect(VERIFY).toMatch(/merge_audit_id/);
      expect(VERIFY).toMatch(/v_audit is null/);
    });
  });

  describe('the precondition is SOFT', () => {
    it('a pair already decided elsewhere is a notice and a return, never a raise', () => {
      // 99991791028368's own corpus-wide P1 had to be narrowed before it could merge,
      // because an unrelated newly-queued row would have aborted db push REPO-WIDE.
      // An exact-match precondition here would reintroduce that.
      const pre = STATEMENTS.slice(
        STATEMENTS.indexOf('if not exists'),
        STATEMENTS.indexOf('approve_dedup_review'),
      );
      expect(pre).toMatch(/raise notice/);
      expect(pre).toMatch(/\breturn;/);
      expect(pre).not.toMatch(/raise exception/);
    });
  });

  describe('the venue duplicate underneath is left alone', () => {
    it('neither Gannet venue is merged', () => {
      // They share the address "Uferstrasse 40" and are one venue, but the direction is
      // a trade-off: _venue_merge_core never mentions `website`, and only the shorter
      // row has one. That is a decision, not a sweep.
      expect(STATEMENTS).not.toContain(VENUE_FULL);
      expect(STATEMENTS).not.toContain(VENUE_SHORT);
      expect(STATEMENTS).not.toMatch(/merge_venues/);
    });

    it('a postcondition asserts both venue rows stayed live', () => {
      // Reparenting an event could otherwise take a venue with it unnoticed.
      expect(VERIFY).toContain(VENUE_FULL);
      expect(VERIFY).toContain(VENUE_SHORT);
      expect(VERIFY).toMatch(/v_n\s*<>\s*2/);
    });
  });

  describe('it does not disturb the previous batch', () => {
    it('asserts the Seoul pair is still open', () => {
      // A later pass that decided everything would otherwise read as success here.
      expect(VERIFY).toContain(SEOUL_QUEUE_ROW);
      expect(VERIFY).toMatch(/was decided/i);
    });
  });

  describe('postcondition discipline', () => {
    it('carries no loosened comparison and no short-circuit', () => {
      expect(VERIFY).not.toMatch(/v_n\s*<\s*0/);
      expect(VERIFY).not.toMatch(/where\s+false/i);
      expect(VERIFY).not.toMatch(/v_n\s+int\s*:=\s*[1-9]/);
    });

    it('every postcondition reads a real table', () => {
      const reads = (VERIFY.match(/from public\.(dedup_review_queue|events|venues)/g) ?? []).length;
      expect(reads).toBeGreaterThanOrEqual(5);
    });
  });
});
