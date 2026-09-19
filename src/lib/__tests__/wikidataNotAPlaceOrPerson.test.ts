import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991789819768 (cities) and 99991789819775 (personalities) — the
 * wrong-entity Wikidata sweep on the two surfaces outside the tag glossary.
 *
 * Both files come from one measurement pass over every live identifier
 * (2,318 cities, 1,696 public personalities), classified by P31 CLASS rather
 * than by description prose. That distinction is the first thing a later edit
 * is likely to undo, and it is not cosmetic: a prose classifier flags
 * Philadelphia ("largest city in the U.S. STATE OF Pennsylvania") and Antwerp,
 * both of which are correct, because the disqualifying words appear inside a
 * perfectly good sentence.
 *
 * What this test exists to preserve, in order of how easily an edit breaks it:
 *
 *  - THE VALUE GUARD. Both files clear an identifier only where it still equals
 *    the exact value the sweep verified (`c.wikidata_qid = b.qid`). Without it a
 *    concurrent repair is silently overwritten — and worse, a row someone has
 *    already fixed correctly gets its good identifier nulled.
 *  - THE TWO FALSE POSITIVES STAY EXCLUDED. `Central` (Hong Kong) and
 *    `Sant Jordi de ses Salines` were flagged by the detector and hand-read as
 *    NOT defects. They are excluded by QID with a stated reason so a later
 *    re-run cannot re-propose them. A test that only asserts "29 rows" would
 *    pass with these two swapped back in.
 *  - PART 2 IS A PREDICATE, NOT A FROZEN ID LIST. The wrong-state cohort is
 *    recomputed in SQL, so a row that is fixed or added between authoring and
 *    CI is handled correctly. A frozen list would rot.
 *  - THE DELIBERATE NON-ACTIONS. `description`, `population`, coordinates and
 *    `timezone` are NEVER retracted — they come from other sources and are
 *    mostly correct even on these rows (a painting has no population, so it
 *    cannot have supplied Dresden's). And `visibility` / `seo_indexable` are
 *    never touched on personalities: these are real people whose identifier is
 *    wrong, and deindexing them would punish the subject for our resolver's
 *    error.
 *  - THE CONTROLS. "the bad rows are gone" is equally satisfied by a pass that
 *    stripped every identifier in the corpus, so both files assert that the
 *    bulk of the corpus still carries one.
 *  - THE POSTCONDITIONS ARE POSITIVE AND UNNEUTERED. Asserting the reached
 *    state, not a count of rows in a bad state — which returns zero for an id
 *    that has vanished entirely.
 */

const CITY = join(
  process.cwd(),
  'supabase/migrations/99991789819768_city_wikidata_not_a_place.sql',
);
const PERSON = join(
  process.cwd(),
  'supabase/migrations/99991789819775_personality_wikidata_not_a_person.sql',
);

const city = readFileSync(CITY, 'utf8');
const person = readFileSync(PERSON, 'utf8');

/** Strip `--` comments so a guard cannot be satisfied by the header prose. */
const statementsOf = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const cityStmts = statementsOf(city);
const personStmts = statementsOf(person);

describe('cities — not a place at all', () => {
  it('clears an identifier only where it still equals the verified value', () => {
    expect(cityStmts).toMatch(/c\.wikidata_qid\s*=\s*b\.qid/);
  });

  it('nulls the identifier and the cached title together', () => {
    // wikipedia_title is the other half of the cache; leaving it makes the next
    // backfill re-resolve straight back to the wrong article.
    const update = cityStmts.slice(cityStmts.indexOf('update public.cities c'));
    expect(update).toMatch(/wikidata_qid\s*=\s*null/);
    expect(update).toMatch(/wikipedia_title\s*=\s*null/);
  });

  it('keeps the two hand-read false positives out of the repair set', () => {
    // Q14767 IS Central, Hong Kong. Q765811 is a legitimate Spanish settlement
    // class. Both were flagged by the regex and refused by a human.
    const values = cityStmts.slice(
      cityStmts.indexOf('insert into _bad_city'),
      cityStmts.indexOf('select count(*) into v_skipped'),
    );
    expect(values).not.toContain('Q14767');
    expect(values).not.toContain('Q765811');
    // ...and the reasons survive in the file so a re-run does not re-propose them.
    expect(city).toContain('Q14767');
    expect(city).toContain('Q765811');
  });

  it('still repairs the unambiguous non-places', () => {
    const values = cityStmts.slice(
      cityStmts.indexOf('insert into _bad_city'),
      cityStmts.indexOf('select count(*) into v_skipped'),
    );
    expect(values).toContain('Q180950'); // Oklahoma City Thunder, basketball team
    expect(values).toContain('Q119713449'); // Dresden, a painting
    expect(values).toContain('Q9668'); // 2002 Winter Olympics
    expect(values).toContain('Q3782546'); // a bay
    expect(values).toContain('Q5773072'); // a football club
  });

  it('computes the wrong-state cohort as a predicate, never a frozen id list', () => {
    const part2 = cityStmts.slice(cityStmts.indexOf('_wrong_state'));
    expect(part2).toMatch(/split_part\(ci\.wikipedia_title,\s*',',\s*2\)/);
    expect(part2).toMatch(/<>\s*ci\.region_name/);
    // both sides must come from the closed state vocabulary, or FIPS-coded
    // regions (Brazil's '13', '27') produce false positives
    expect(part2).toMatch(/in \(select s from states\)[\s\S]*?in \(select s from states\)/);
  });

  it('never retracts description, population, coordinates or timezone', () => {
    const writes = cityStmts.slice(cityStmts.indexOf('update public.cities c'));
    expect(writes).not.toMatch(/\bdescription\s*=\s*null/);
    expect(writes).not.toMatch(/\bpopulation\s*=\s*null/);
    expect(writes).not.toMatch(/\blatitude\s*=\s*null/);
    expect(writes).not.toMatch(/\blongitude\s*=\s*null/);
    expect(writes).not.toMatch(/\btimezone\s*=\s*null/);
  });

  it('retracts the mayor, which is the sharpest harm', () => {
    expect(cityStmts).toMatch(/mayor\s*=\s*null/);
  });

  it('preserves every retracted value for reversal', () => {
    expect(cityStmts).toContain('wikidata_repair_retracted');
    expect(cityStmts).toMatch(/'mayor',\s*to_jsonb\(c\.mayor\)/);
    expect(cityStmts).toMatch(/'postal_codes',\s*to_jsonb\(c\.postal_codes\)/);
  });

  it('asserts the reached state positively and keeps a corpus control', () => {
    expect(cityStmts).toMatch(/if v_leak > 0 then[\s\S]*?raise exception/);
    expect(cityStmts).toMatch(/still carrying a QID/);
    expect(cityStmts).toMatch(/still publishing a mayor/);
    // the counter must not be pre-satisfied
    expect(cityStmts).not.toMatch(/v_leak\s*(int)?\s*:=\s*0\s*;[\s\S]{0,80}if v_leak > 0/);
    expect(cityStmts).not.toMatch(/if\s+false\s+then/i);
  });

  it('scopes the part-1 postcondition to the verified QID, not to `is not null`', () => {
    // The UPDATE deliberately skips a row whose QID moved since the sweep. An
    // `is not null` assertion RAISEs on exactly that skipped row, which aborts
    // `db push` on main and takes every migration queued behind it — the
    // 20810101100100 failure. Scoped to the FIRST v_leak block only: part 2
    // legitimately tests `is not null` on the fact columns it retracts, so a slice
    // that reaches it would pass on a reverted part 1.
    const start = cityStmts.indexOf('select count(*) into v_leak');
    const leak = cityStmts.slice(start, cityStmts.indexOf('end if;', start));
    expect(leak).toMatch(/c\.wikidata_qid\s*=\s*b\.qid/);
    expect(leak).not.toMatch(/c\.wikidata_qid\s+is\s+not\s+null/);
  });

  it('declares an actor, because log/audit triggers reject system:% writers', () => {
    expect(cityStmts).toMatch(/set_config\('app\.actor',\s*'migration:[^']+',\s*true\)/);
  });
});

describe('personalities — not a person', () => {
  it('clears an identifier only where it still equals the verified value', () => {
    expect(personStmts).toMatch(/p\.wikidata_qid\s*=\s*b\.qid/);
  });

  it('nulls both the QID and the wikipedia url', () => {
    const update = personStmts.slice(personStmts.indexOf('update public.personalities p'));
    expect(update).toMatch(/wikidata_qid\s*=\s*null/);
    expect(update).toMatch(/wikipedia_url\s*=\s*null/);
  });

  it('never touches visibility, indexability, bio or profession', () => {
    // These are real people. Only the identifier is wrong; deindexing them
    // would punish the subject for our resolver's error.
    // Scoped to the UPDATE itself, not to the rest of the file: the control
    // query at the end legitimately READS `visibility = 'public'`, and an
    // unscoped slice makes this assertion fail on correct code.
    const start = personStmts.indexOf('update public.personalities p');
    const writes = personStmts.slice(start, personStmts.indexOf('get diagnostics', start));
    expect(writes).not.toMatch(/\bvisibility\s*=/);
    expect(writes).not.toMatch(/\bseo_indexable\s*=/);
    expect(writes).not.toMatch(/\bbio\s*=/);
    expect(writes).not.toMatch(/\bprofession\s*=/);
    expect(writes).not.toMatch(/\breview_status\s*=/);
  });

  it('repairs the measured namesake set', () => {
    expect(personStmts).toContain('Q797'); // Alaska -> the US state
    expect(personStmts).toContain('Q3283299'); // Brandi Carlile -> her album
    expect(personStmts).toContain('Q67146010'); // 999999 -> a number
    expect(personStmts).toContain('Q265868'); // Bones -> bone, the organ
  });

  it('preserves the cleared identifier for reversal', () => {
    expect(personStmts).toContain('wikidata_repair');
    expect(personStmts).toMatch(/'cleared_qid',\s*b\.qid/);
  });

  it('asserts the reached state positively and keeps a corpus control', () => {
    expect(personStmts).toMatch(/if v_leak > 0 then[\s\S]*?raise exception/);
    expect(personStmts).toMatch(/still carrying a QID/);
    expect(personStmts).not.toMatch(/if\s+false\s+then/i);
  });

  it('scopes the postcondition to the verified QID, not to `is not null`', () => {
    // Same defect as the city file: the UPDATE skips a row whose QID moved, and an
    // `is not null` assertion then RAISEs on that skipped row and aborts `db push`
    // for the whole repo. Scoped to the postcondition, because the control query
    // below legitimately matches on `wikidata_qid ~ '^Q[0-9]+$'`.
    const start = personStmts.indexOf('select count(*) into v_leak');
    const leak = personStmts.slice(start, personStmts.indexOf('end if;', start));
    expect(leak).toMatch(/p\.wikidata_qid\s*=\s*b\.qid/);
    expect(leak).not.toMatch(/p\.wikidata_qid\s+is\s+not\s+null/);
  });

  it('leaves the no-P31 rows alone — absence of evidence is not evidence', () => {
    // 4 public personalities carry a QID with no P31 at all. A missing class is
    // not a wrong class, and clearing them would record an unknown as a defect.
    expect(person).toMatch(/no P31 at all\s*\|?\s*left alone|absence of evidence/i);
  });
});
