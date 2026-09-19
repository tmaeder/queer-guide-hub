import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `personality-link-adult-profiles` queued 1,513 proposals to attach a porn-site
 * profile to a personality. 401 of the target rows carried a real `Q…`
 * wikidata_qid; 125 of those are provably a different entity — 50 not a human at
 * all (Austin the city, Colt's Manufacturing, an Offspring album), 72 a different
 * real named person (Jason Collins, Scott Miller, Brad Davis, Lee Smith).
 *
 * Asserted against COMMENT-STRIPPED source. The migration header quotes almost
 * every string these tests look for, so an unstripped check passes on the prose
 * with the statements deleted — the trap CLAUDE.md records repeatedly.
 */

const MIGRATION = '99991789824947_personality_wrong_entity_repair';

const stripSql = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const sql = stripSql(
  readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION}.sql`), 'utf8'),
);

// Collapse runs of whitespace so an assertion survives reformatting of the
// statement it is about, but never crosses statements: `;` and the dollar-quote
// delimiters are preserved verbatim.
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

const repair = norm(sql.slice(sql.indexOf('do $repair$'), sql.indexOf('do $verify$')));
const verify = norm(sql.slice(sql.indexOf('do $verify$')));

describe('personality wrong-entity repair: the identifier', () => {
  it('replaces the qid with a SKIP_ sentinel and never with NULL', () => {
    // personality-refresh re-resolves by NAME whenever wikidata_qid IS NULL, so a
    // null re-mints the same bad match on the next pass. This is the one place
    // the tag precedent (null regenerates nothing) does NOT transfer.
    expect(repair).toMatch(/wikidata_qid\s*=\s*'SKIP_'\s*\|\|\s*gen_random_uuid\(\)/);
    expect(repair).not.toMatch(/wikidata_qid\s*=\s*null/i);
  });

  it('asserts in the postconditions that no repaired row was left without a sentinel', () => {
    // Anchored on the CONDITION, not on the message it prints: neutering the
    // branch to `if v_null_qid < 0` leaves every message string intact.
    expect(verify).toMatch(/wikidata_qid is null or p\.wikidata_qid !~ '\^SKIP_'/);
    expect(verify).toMatch(/if v_null_qid <> 0 then\s*raise exception/);
  });
});

describe('personality wrong-entity repair: retraction is per field and content-guarded', () => {
  it.each([
    ['description', 'wd_desc'],
    ['birth_date', 'wd_birth'],
    ['death_date', 'wd_death'],
  ])('%s is nulled only when it equals the wrong entity own %s', (col, wd) => {
    // A blanket wipe would have destroyed real data: of 28 rows carrying a
    // birth_date only 16 match the wrong entity's P569, so 12 must survive.
    const re = new RegExp(
      `${col}\\s*=\\s*case when p\\.${col} is not distinct from w\\.${wd} then null else p\\.${col} end`,
    );
    expect(repair).toMatch(re);
  });

  it('filters external_ids per KEY rather than clearing the column', () => {
    // Jason Collins' twitter/instagram match the wrong item exactly and go; his
    // stored imdb_id differs from that item's and stays.
    expect(repair).toMatch(/jsonb_each_text\(coalesce\(p\.external_ids/);
    expect(repair).toMatch(/where w\.wd_ext ->> e\.key is distinct from e\.value/);
    expect(repair).not.toMatch(/external_ids\s*=\s*'\{\}'::jsonb\s*,/);
    expect(repair).not.toMatch(/external_ids\s*=\s*null/i);
  });

  it('never writes image_url — the provenance discriminator was refuted', () => {
    // 701 rows in this cohort carry a /personalities/<uuid>.webp mirror while
    // holding a SKIP_ qid, i.e. no Wikidata entity ever existed for them. The URL
    // shape proves nothing, so retracting on it would blank the performer's own
    // photo. Under-reaching is the correct error.
    expect(repair).not.toMatch(/image_url\s*=/);
  });
});

describe('personality wrong-entity repair: the queue decision', () => {
  it('closes rows to rejected and to no other status', () => {
    // Every producer's idempotency keys on status='open' and uq_erq_open is
    // partial over open rows, so any other value is re-inserted as open.
    expect(repair).toMatch(/set status = 'rejected'/);
    const statuses = [...repair.matchAll(/status\s*=\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(statuses)).toEqual(new Set(['rejected', 'open']));
  });

  it('leaves reviewer_id NULL and marks the note as a machine close', () => {
    // reviewer_id IS NULL + an `auto-` prefix is the house convention that keeps
    // a machine close distinguishable from a human decision.
    expect(repair).not.toMatch(/reviewer_id\s*=/);
    expect(repair).toMatch(/reviewer_note = 'auto-wrong-entity:/);
  });

  it('only touches this producer and only its open rows', () => {
    expect(repair).toMatch(/q\.model like 'adult-profile-probe:%'/);
    expect(repair).toMatch(/q\.status = 'open'/);
  });
});

describe('personality wrong-entity repair: attribution and reversibility', () => {
  it('declares app.actor with set_config, never SET LOCAL', () => {
    // db push does not wrap a migration in a transaction block: SET LOCAL is
    // discarded with a bare WARNING 25P01 and the actor is silently never set,
    // which would make the content_revisions rows `system` and therefore prunable.
    expect(repair).toMatch(/perform set_config\('app\.actor'/);
    expect(sql).not.toMatch(/set local\s+app\.actor/i);
  });

  it('stamps the refuted identifier on the row so the finding survives the write', () => {
    expect(repair).toMatch(/'wrong_entity_candidate'/);
    expect(repair).toMatch(/'state', 'confirmed'/);
    expect(repair).toMatch(/'qid', ?w\.qid/);
  });

  it('merges into enrichment_status instead of replacing it', () => {
    expect(repair).toMatch(
      /enrichment_status = coalesce\(p\.enrichment_status, '\{\}'::jsonb\)\s*\|\|/,
    );
  });
});

describe('personality wrong-entity repair: postconditions', () => {
  it('asserts the reached state positively, not the absence of a bad state only', () => {
    // Each is anchored on its `if <var> <> 0` CONDITION rather than on the text
    // it raises, because loosening the comparison to `< 0` leaves the message,
    // the variable and the query all intact while the check stops checking.
    for (const v of ['v_qid_left', 'v_null_qid', 'v_open_left', 'v_desc_left']) {
      expect(verify).toMatch(new RegExp(`if ${v} <> 0 then\\s*raise exception`));
    }
    // and the positive form: the controls are counted UP to their expected value
    expect(verify).toMatch(/if v_controls <> 4 then\s*raise exception/);
  });

  it('carries controls that a blanket sweep would fail', () => {
    // Q947588 Jack Wrangler, Q24955325 Tim Kruger, Q1286616 Al Parker,
    // Q6446890 Kurt Marshall — correct identifiers on public, indexable rows.
    // Without this, "no refuted qid remains" is satisfied by deleting every qid.
    for (const q of ['Q947588', 'Q24955325', 'Q1286616', 'Q6446890']) {
      expect(verify).toContain(q);
      expect(repair).not.toContain(q);
    }
    expect(verify).toMatch(/if v_controls <> 4 then raise exception/);
  });

  it('reports the outing-guard demotions rather than asserting zero', () => {
    // Measured at 0 across all 401 real-qid rows, because every one carries a
    // non-SKIP personality_sources row. Reported so the day it changes is visible.
    expect(verify).toMatch(/v_demoted/);
    expect(verify).not.toMatch(/if v_demoted <> 0 then raise exception/);
  });

  it('every postcondition actually reads a table', () => {
    // Guards against the short-circuit mutation: `where false and ...` leaves the
    // slug list, the regex and the comparison all intact while the check stops
    // counting. Recorded in CLAUDE.md as a mutation that SURVIVED a first round.
    const selects = [...verify.matchAll(/select count\(\*\) into (\w+)/g)].map((m) => m[1]);
    expect(selects.length).toBeGreaterThanOrEqual(7);
    expect(verify).not.toMatch(/where false/i);
    expect(verify).not.toMatch(/:=\s*0\s*;[\s\S]{0,40}raise exception/);
  });
});

describe('personality wrong-entity repair: the refuted set', () => {
  const values = sql.slice(sql.indexOf('insert into _wrong_entity'), sql.indexOf('do $repair$'));
  const qids = [...values.matchAll(/\('(Q\d+)'/g)].map((m) => m[1]);

  it('names exactly 125 distinct refuted identifiers', () => {
    expect(qids).toHaveLength(125);
    expect(new Set(qids).size).toBe(125);
  });

  it('includes the named defamation cases that motivated the repair', () => {
    // Jason Collins, Scott Miller, Brad Davis, Lee Smith, Mike Stone,
    // Bobby Garcia, Steve Lucas, Marliese Arold.
    for (const q of [
      'Q2317740',
      'Q107984823',
      'Q374175',
      'Q112628161',
      'Q120416052',
      'Q135321627',
      'Q7613194',
      'Q1902087',
    ]) {
      expect(qids).toContain(q);
    }
  });

  it('includes the not-a-person cases', () => {
    // Austin (city), Aceh (province), Colt's Manufacturing, Ignition (album),
    // Eycelli (mahalle), Sir (honorific), heavy metal music.
    for (const q of ['Q16559', 'Q1823', 'Q745019', 'Q45727', 'Q4822728', 'Q209690', 'Q38848']) {
      expect(qids).toContain(q);
    }
  });
});
