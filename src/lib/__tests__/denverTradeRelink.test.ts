import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790796466_denver_trade_relink_and_false_claim.sql.
//
// 99991790537156 detached an event from the Washington DC "Trade" -- correctly, at
// 2,398 km -- and stamped onto the row that "no Denver venue exists to move it to".
// That was false: there are THREE Trade rows, only one is DC's, and Denver's own is an
// open bar 0.01 km from the event. So this migration relinks and corrects the claim.
//
// What must not drift:
//   1. the relink rests on THREE signals, not proximity alone
//   2. the original stamp is PRESERVED under `corrected_from`, not erased
//   3. the other two Trade rows are never merged or moved -- merging 7146a3a9 away
//      would destroy Denver's own venue, which is what the earlier entry implied
//   4. P2 does not assert the false phrase is absent from the NEW detail, because the
//      new detail quotes it to explain it -- the first draft did and failed on correct
//      code

const MIGRATION = '99991790796466_denver_trade_relink_and_false_claim.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Comment lines removed, so the header's prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const update = statements.slice(
  statements.indexOf('update public.events e'),
  statements.indexOf('do $verify$'),
);
const verify = statements.slice(statements.indexOf('do $verify$'));

const DC = '0d350a5a-ae4d-407a-9912-cbb613a5fbc5';
const DENVER = '7146a3a9-bcc8-4ae5-bb2c-29348b7c91f2';
const PORTLAND = '086a792a-7246-4699-b4a8-d9e0ebd85aab';

describe('the spans this file depends on', () => {
  it('found the update and the postconditions', () => {
    expect(update.length, 'update span empty').toBeGreaterThan(400);
    expect(verify.length, 'verify span empty').toBeGreaterThan(400);
    expect(update).not.toContain('do $verify$');
  });
});

describe('the relink', () => {
  it('attaches Denver’s Trade and nothing else', () => {
    expect(update).toContain(`v.id = '${DENVER}'`);
    // never the DC row, never the coordinate-only row
    expect(update).not.toContain(DC);
    expect(update).not.toContain(PORTLAND);
  });

  it('requires all THREE signals, not proximity alone', () => {
    // coordinates
    expect(update).toMatch(/haversine_m\([\s\S]*?v\.latitude[\s\S]*?\)\s*<\s*1000/);
    // the venue's city really is the denver row
    expect(update).toContain("c.slug = 'denver'");
    // and the venue is usable
    expect(update).toMatch(/v\.closed_at is null/);
    expect(update).toMatch(/v\.duplicate_of_id is null/);
  });

  it('only acts on the defect, so a concurrent repair no-ops', () => {
    expect(update).toMatch(/e\.venue_id is null/);
    expect(update).toContain("= 'venue_name_collision_no_correct_row_exists'");
  });

  it('PRESERVES the original stamp rather than erasing it', () => {
    // The detach was right; only its stated reason was wrong. Dropping the original
    // would destroy the only record that the claim was ever made.
    expect(update).toMatch(/'corrected_from',\s*e\.enrichment_status->'event_venue_link'/);
  });

  it('clears needs_attention, because the row is now correctly linked', () => {
    expect(update).toMatch(/needs_attention = false/);
  });

  it('writes no city — the trigger derives it', () => {
    // All three ids were measured equal, and attaching a venue fires
    // tg_event_venue_geography, whose guard passes at 0.01 km.
    expect(update).not.toMatch(/\bcity_id\s*=/);
  });
});

describe('postconditions', () => {
  it('asserts the event is LINKED, not merely joined to something', () => {
    // A join on venue_id is vacuously satisfied when venue_id is null, so the
    // not-null case needs its own check.
    expect(verify).toMatch(/venue_id is null/);
    expect(verify).toContain('still detached');
  });

  it('checks the false claim positionally, never by absence from the new detail', () => {
    // THE TRAP: the corrected detail quotes the false phrase to explain it, so
    // `new detail not ilike '%no Denver venue exists%'` fails on correct code. The
    // assertion must instead require the phrase under `corrected_from`.
    const p2 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P2 failed')),
      verify.indexOf('P2 failed'),
    );
    expect(p2.length).toBeGreaterThan(80);
    expect(p2).toMatch(/corrected_from'->>'detail'\s*\n?\s*not ilike/);
    // BOTH halves of the preservation check. Mutation-tested: dropping the reason
    // arm survived until this line existed, because asserting only the detail arm
    // leaves "the original was preserved" provable by one field out of two.
    expect(p2).toMatch(
      /corrected_from'->>'reason'\s*\n?\s*<>\s*'venue_name_collision_no_correct_row_exists'/,
    );
    // and it must NOT test the TOP-LEVEL detail for that phrase. Scoped to
    // `event_venue_link'->>'detail'` with no `corrected_from` between, because the
    // corrected_from line legitimately contains the same `not ilike` phrase -- the
    // first draft of THIS assertion matched that line and failed on correct code,
    // which is the same trap one level up.
    expect(p2).not.toMatch(/event_venue_link'->>'detail'\s*\n?\s*not ilike '%no Denver/);
  });

  it('mirrors BOTH other Trade rows as live and unmoved', () => {
    // Sliced from the end of P3's raise, because `indexOf('P4')` lands on the first
    // "P4 failed" -- which is AFTER the statement carrying the ids.
    const p4 = verify.slice(verify.indexOf('P3 failed'), verify.lastIndexOf('P4 failed'));
    expect(p4).toContain(DC);
    expect(p4).toContain(PORTLAND);
    expect(p4).toMatch(/v_bad <> 2/);
    expect(p4).toContain("c.slug <> 'washington-d-c'");
  });

  it('proves restraint with a snapshot', () => {
    expect(statements).toMatch(/create temporary table _tr_before/);
    expect(verify).toContain('expected exactly 1 event to change');
    expect(verify).toMatch(/if v_moved <> 1 then/);
  });

  it('re-checks the corpus invariant the previous passes established', () => {
    const p6 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P6 failed')),
      verify.indexOf('P6 failed'),
    );
    expect(p6).toMatch(/> 250000/);
    expect(p6).not.toContain('d5c0c33f');
  });

  it('uses no loosened comparison that would stop the checks counting', () => {
    // Six: P1 twice (linked-correctly and not-detached), P2, P3, P4's slug check, P6.
    // P4's first check is `<> 2`, asserted separately above.
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(6);
    expect(verify).toMatch(/if v_bad <> 2 then/);
    expect(verify).not.toMatch(/if v_(bad|moved) [<>]\s*[-0-9]/);
    expect(verify).not.toMatch(/\bfalse\b\s*;/);
  });
});
