import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991789823216_geo_namesake_city_rows.sql.
//
// The migration creates Derby, England and links its event, unlinks two Minnesota
// venues from a California city row, and REFUSES to create College Park, Georgia or
// Roseville, Minnesota because `cities` is unique on (name, country) and a BEFORE
// trigger strips the qualifier that would otherwise distinguish them.
//
// Assertions are scoped to the half of the file they are about: this migration's
// header quotes the strings the statements also contain (the 23505 detail line names
// `college park`, the postconditions echo their own slugs), so a bare toContain over
// the whole file passes against a gutted statement -- the vacuous-assertion class
// CLAUDE.md records repeatedly.

const MIGRATION = '99991789823216_geo_namesake_city_rows.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** Just the verify block. */
const verify = raw.slice(raw.indexOf('do $verify$'));

describe('geo namesake city rows: what the migration creates', () => {
  it('creates exactly one city, and it is Derby in GB with the resolved identifier', () => {
    const inserts = statements.match(/insert into public\.cities[\s\S]*?on conflict do nothing;/);
    expect(inserts).not.toBeNull();
    const ins = inserts![0];
    expect(ins).toContain("'derby-england'");
    expect(ins).toContain("'Q43475'");
    // the GB country id, not the US one
    expect(ins).toContain('58581332-7745-430b-8b51-dd1537e85cf0');
    expect(ins).not.toContain('0ba25df5-82cd-4edc-bf03-e10d737eab68');
    // exactly one VALUES tuple
    expect(ins.match(/'wikidata'/g) ?? []).toHaveLength(1);
  });

  it('does NOT attempt the two rows the unique key forbids', () => {
    const inserts = statements.match(
      /insert into public\.cities[\s\S]*?on conflict do nothing;/,
    )![0];
    expect(inserts).not.toContain('college-park-georgia');
    expect(inserts).not.toContain('roseville-minnesota');
    expect(inserts).not.toContain('Q388435');
    expect(inserts).not.toContain('Q983979');
  });

  it('publishes the new row deindexed and lets the completeness engine promote it', () => {
    const inserts = statements.match(
      /insert into public\.cities[\s\S]*?on conflict do nothing;/,
    )![0];
    expect(inserts).toContain('seo_indexable');
    expect(inserts).toMatch(/'Q43475',\s*'wikidata',\s*false/);
  });
});

describe('geo namesake city rows: the two content moves', () => {
  it('links only the Derby event, guarded on the prior migration stamp', () => {
    const upd = statements.match(/update public\.events e[\s\S]*?migration:99970901120000';/);
    expect(upd).not.toBeNull();
    const u = upd![0];
    expect(u).toContain("e.postal_code = 'DE1 1LH'");
    expect(u).toContain('e.city_id is null');
    expect(u).toContain('migration:99970901120000');
    expect(u).toContain('needs_attention = false');
    // exactly one events UPDATE -- the College Park one must not have been added back.
    // Scoped to the UPDATE: P6 legitimately names that postal code in its own guard,
    // so a whole-file negative fails on correct code.
    expect(statements.match(/update public\.events e/g) ?? []).toHaveLength(1);
    expect(u).not.toContain('30337');
  });

  it('unlinks the Minnesota venues on BOTH signals, never the state text alone', () => {
    const upd = statements.match(/update public\.venues v[\s\S]*?< 25000;/);
    expect(upd).not.toBeNull();
    const u = upd![0];
    expect(u).toContain('city_id = null');
    expect(u).toContain('needs_attention = true');
    expect(u).toContain("lower(v.state) = 'minnesota'");
    // the coordinate arm is what makes the state text usable at all
    expect(u).toMatch(
      /haversine_m\(v\.latitude, v\.longitude, 45\.01527778::numeric, -93\.15305556::numeric\)\s*<\s*25000/,
    );
    expect(u).toContain('v.duplicate_of_id is null');
  });

  it('scopes the venue unlink to the California row, so it cannot sweep the table', () => {
    const upd = statements.match(/update public\.venues v[\s\S]*?< 25000;/)![0];
    expect(upd).toContain("ca.slug = 'tmp-a7a9173f-64e0-444e-b26d-ca4338285fb1'");
    expect(upd).toContain('v.city_id = ca.id');
  });
});

describe('geo namesake city rows: postconditions', () => {
  it('asserts the reached state positively, never a count of rows in a bad state', () => {
    expect(verify).toMatch(/if v_bad <> 1 then[\s\S]*?P1 failed/);
    expect(verify).toMatch(/P2 failed/);
    expect(verify).toMatch(/P3 failed/);
  });

  it('keeps the mirrors: the rows this file must not touch are asserted intact', () => {
    // the two Californian venues stay put -- "the pair was unlinked" is equally
    // satisfied by a sweep that emptied the row
    expect(verify).toMatch(/if v_bad <> 2 then[\s\S]*?P4 failed/);
    // College Park, Maryland keeps its event; Derby, Connecticut keeps its venues
    expect(verify).toContain('tmp-23a52220-16e4-4622-b06d-c13d86ccd4e8');
    expect(verify).toContain("c.slug = 'derby' and c.wikidata_qid = 'Q755197'");
    expect(verify).toMatch(/if v_bad <> 4 then[\s\S]*?P5 failed/);
  });

  it('asserts the College Park event stays BLOCKED, so a later workaround breaks here', () => {
    const p6 = verify.slice(verify.indexOf('P6'));
    expect(verify).toMatch(/e\.postal_code = '30337' and e\.city_id is not null/);
    expect(p6).toContain('no representable city');
  });

  it('never loosens a comparison anywhere in the verify block', () => {
    // neutering `if v_bad <> N` to `if v_bad < 0` leaves every string-anchored
    // assertion above green while the check has stopped checking
    expect(verify).not.toMatch(/if v_bad\s*<\s*0/);
    expect(verify).not.toMatch(/where false/i);
    // every postcondition must actually read a table
    const conds = verify.match(/if v_bad <> \d+ then/g) ?? [];
    expect(conds.length).toBe(7); // P5 carries two mirrors, so six labels, seven checks
    expect((verify.match(/select count\(\*\) into v_bad/g) ?? []).length).toBe(7);
  });
});

describe('geo namesake city rows: the structural refusal is recorded', () => {
  it('names the trigger and the index that make the two rows impossible', () => {
    expect(raw).toContain('idx_cities_name_country_unique');
    expect(raw).toContain('cities_split_qualified_name');
    expect(raw).toContain('trg_cities_aa_split_name');
  });

  it('warns against the mangled-name workaround rather than leaving it open', () => {
    expect(raw).toMatch(/DO NOT work around it by inventing a parenthesised/);
  });
});
