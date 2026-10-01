/**
 * Guards 99991790527174_water_sports_sense_split.sql.
 *
 * `/tags/water-sports` was one row doing two jobs: `wikidata_id = Q61065` (aquatic
 * sports) driving the summary, body, six translated aliases and three ontology edges,
 * against a kink `description` and `is_adult = true`. The crawler's meta reads
 * `description` first and the article reads `long_description` first, so Google was
 * served a urination definition while a reader was served kayaking, on one indexable
 * URL.
 *
 * The split rehomes the SPORTS sense on a new `aquatic-sports` utility row rather than
 * deleting it — the taxonomy is correct and `news-sports` carries 2,706 assignments —
 * and leaves the kink sense on the slug the name means here.
 *
 * Assertions run over COMMENT-STRIPPED SQL. The header quotes the defect prose, both
 * senses, the rejected abbreviations and the guard messages verbatim, so an unstripped
 * `toContain` is satisfied by the explanation while the statement is missing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790527174_water_sports_sense_split';
const DIR = join(process.cwd(), 'supabase/migrations');

const raw = (() => {
  const f = readdirSync(DIR).find((x) => x.startsWith(MIGRATION));
  if (!f) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, f), 'utf8');
})();

/** Line-start comments only — a mid-line `--` may sit inside a literal. */
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

/** The work block and the verify block are asserted separately: several strings occur
 *  in both, so a whole-file match is satisfied by the copy you did not mean. */
const work = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

/**
 * Comments joined and whitespace-collapsed: the reasoning wraps across `--` lines,
 * which a single-line pattern cannot match.
 *
 * The marker is STRIPPED, not just matched. Filtering comment lines and joining them
 * verbatim leaves the `--` mid-string, so a sentence broken across two lines reads
 * "NOT NULL with NO -- DEFAULT" and every pattern spanning the break silently fails.
 * That cost this file a false red on correct code.
 */
const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/**
 * The SET clause of the kink UPDATE, i.e. only what the migration WRITES.
 *
 * Every UPDATE here is content-guarded on the text it removes, so its WHERE clause
 * quotes the defect verbatim — `defecating`, `Q61065`, `aquatic sports`. A negative
 * assertion over the whole statement therefore fails on correct code, and its mirror
 * would pass with the write deleted. Assert on what is written.
 */
const kinkSet = (() => {
  // Anchored at the statement, not at a column name: `wikidata_id = null` and
  // `wikipedia_url = null` are the FIRST assignments in the SET clause, so slicing
  // from `short_description =` silently excludes the two the identifier assertions
  // are about.
  const start = work.indexOf('update public.unified_tags');
  const end = work.indexOf('where id = v_kink');
  if (start < 0 || end < 0 || end < start) throw new Error('kink UPDATE not found as expected');
  return work.slice(start, end);
})();

describe('the sports sense is REHOMED, not deleted', () => {
  it('creates aquatic-sports carrying the identifier', () => {
    expect(work).toMatch(/insert into public\.unified_tags/);
    expect(work).toContain("'aquatic-sports'");
    expect(work).toContain("'Q61065'");
  });

  it('moves the six translations rather than deleting them', () => {
    // alias_slug is globally UNIQUE, so this must be an UPDATE across; an insert+delete
    // would fail and a delete alone would throw away correct sports vocabulary.
    expect(work).toMatch(/update public\.tag_aliases\s+set canonical_tag_id = v_sports/);
    expect(work).not.toMatch(/delete from public\.tag_aliases/);
    for (const a of [
      'wassersport',
      'sport-aquatique',
      'sport-nautique',
      'sports-deau-vive',
      'sports-nautiques',
      'deporte-acutico',
    ])
      expect(work).toContain(`'${a}'`);
  });

  it('moves the two Q61065 sources rather than deleting them', () => {
    expect(work).toMatch(/update public\.tag_sources\s+set tag_id = v_sports/);
    expect(work).not.toMatch(/delete from public\.tag_sources/);
  });

  it('re-points the taxonomy in BOTH directions', () => {
    // surfing/swimming point AT the row (target), and the row points at news-sports
    // (source). Only re-pointing one leaves half the taxonomy on the kink page.
    expect(work).toMatch(/update public\.tag_relations\s+set target_tag_id = v_sports/);
    expect(work).toMatch(/update public\.tag_relations\s+set source_tag_id = v_sports/);
    // Never tombstoned or dropped — that is what would destroy the sports taxonomy.
    expect(work).not.toMatch(/delete from public\.tag_relations/);
    expect(work).not.toMatch(/review_status\s*=\s*'rejected'/);
  });

  it('sets all three category representations by hand', () => {
    // Neither category trigger fires on INSERT, so category_id alone leaves the row
    // uncategorised on its own page and categorised in search.
    expect(work).toContain("'Sports & Recreation'");
    expect(work).toMatch(/category_id/);
    expect(work).toMatch(/insert into public\.tag_category_assignments/);
    expect(work).toMatch(/is_primary/);
  });

  it('files the new row as utility and deindexed, explicitly', () => {
    expect(work).toMatch(/publication_role/);
    expect(work).toContain("'utility'");
    // Explicit, because a row that moves status but not this column is how terms once
    // went live to crawlers with nothing to self-heal them.
    expect(work).toMatch(/seo_indexable/);
  });
});

describe('the ordering that the dry run forced', () => {
  it('releases the identifier BEFORE claiming it', () => {
    // enforce_tag_wikidata_identity() raises 23505 on a second active tag holding
    // Q61065. Written the intuitive way round, the insert fails and the migration
    // aborts, taking every migration queued behind it on main.
    const release = work.search(/wikidata_id\s*=\s*null/);
    const claim = work.indexOf("'Q61065'");
    expect(release).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(-1);
    expect(release).toBeLessThan(claim);
  });

  it('records why the order is load-bearing', () => {
    expect(prose).toMatch(/23505/);
    expect(prose).toMatch(/enforce_tag_wikidata_identity/);
  });

  it('records the NULL publication_role trap', () => {
    // NOT NULL with no default, and zy_validate_tag_entity_target sees NULL before
    // zz_enforce_tag_publication_role runs, so `<> 'entity_redirect'` is NULL and it
    // raises a misleading redirect error.
    expect(prose).toMatch(/entity_redirect/);
    expect(prose).toMatch(/NOT NULL with NO DEFAULT|NOT NULL with no default/i);
  });
});

describe('the kink page it becomes', () => {
  it('NULLS the identifier and never repoints it', () => {
    // tag_medical_codes_sync and tag_wikidata_hierarchy rebuild weekly from this
    // column: a wrong QID regenerates wrong data forever, a null one regenerates
    // nothing.
    expect(kinkSet).toMatch(/wikidata_id\s*=\s*null/);
    expect(kinkSet).toMatch(/wikipedia_url\s*=\s*null/);
    // No second identifier is guessed onto it. Scoped to the SET clause: the content
    // guard legitimately names Q61065 in its WHERE.
    expect(kinkSet).not.toMatch(/wikidata_id\s*=\s*'Q/);
  });

  it('removes the claim that it includes faeces', () => {
    // "urinating or defecating" conflated water sports with scat. These are the words
    // people use to agree what is and is not on the table.
    expect(kinkSet).not.toMatch(/defecating/i);
    expect(kinkSet).toMatch(/does not include faeces/);
    expect(kinkSet).toMatch(/scat/);
  });

  it('writes only claims our own corpus corroborates', () => {
    // Natursekt is already an alias on urophilia. "WS" and "NS" appear nowhere in the
    // corpus, so they are deliberately not written — the nine-source pass refused
    // fourteen unsourced claims and this is the same bar.
    expect(work).toMatch(/Natursekt/);
    const body = kinkSet.slice(kinkSet.indexOf('long_description ='));
    expect(body).not.toMatch(/\bWS\b/);
    expect(body).not.toMatch(/\bNS\b/);
  });

  it('is content-guarded so a human fixing it first keeps their work', () => {
    expect(work).toMatch(/where id = v_kink/);
    expect(work).toMatch(/wikidata_id = 'Q61065'\s*\n?\s*or long_description ilike/);
  });

  it('declares an attributed actor', () => {
    // The row is human_reviewed, so log_unified_tag_change() RAISES for an undeclared
    // system actor — and before_data is the only copy of the prior prose.
    expect(work).toMatch(/set_config\('app\.actor'/);
    expect(work).toContain(MIGRATION);
  });

  it('keeps it in the article lane, adult and in Practices & Play', () => {
    // The lane, is_adult and the category are the KINK signals and are not touched.
    expect(work).not.toMatch(/is_adult\s*=\s*false\s*(,|\n)*\s*where id = v_kink/);
    expect(work).not.toMatch(/update public\.unified_tags[\s\S]{0,400}publication_role\s*=/);
  });
});

describe('postconditions assert the REACHED state', () => {
  it('proves the kink row shed every sports artifact', () => {
    expect(verify).toMatch(/wikidata_id is not null/);
    expect(verify).toMatch(/ilike '%aquatic sports%'/);
    expect(verify).toMatch(/ilike '%defecating%'/);
  });

  it('proves the sports sense EXISTS somewhere', () => {
    // Nulling an identifier without rehoming it is a deletion dressed as a split.
    expect(verify).toMatch(/slug = 'aquatic-sports'[\s\S]{0,300}wikidata_id = 'Q61065'/);
  });

  it('proves the taxonomy survived, counting positively', () => {
    expect(verify).toMatch(/s\.slug in \('surfing','swimming'\)/);
    expect(verify).toMatch(/if v_bad <> 2 then/);
    expect(verify).toMatch(/t\.slug = 'news-sports'/);
  });

  it('proves no edge and no alias still hangs off the kink row', () => {
    expect(verify).toMatch(/relation\(s\) still hang off water-sports/);
    expect(verify).toMatch(/alias\(es\) still sit on water-sports/);
    // Both directions: "none on the kink row" is equally satisfied by having deleted
    // them, so the arrival count is asserted too.
    expect(verify).toMatch(/if v_bad <> 6 then/);
  });

  it('CALLS tag_has_prose rather than restating its OR', () => {
    expect(verify).toMatch(/public\.tag_has_prose\(description, short_description\)/);
  });

  it('asserts all three category representations on the new row', () => {
    expect(verify).toMatch(/tag_category_assignments a[\s\S]{0,200}is_primary/);
    expect(verify).toMatch(/c\.slug = 'sports-recreation'/);
  });

  it('carries sibling controls, so a family-wide sweep cannot pass', () => {
    for (const s of ['watersports', 'piss-play', 'golden-shower', 'urophilia', 'scat-play'])
      expect(verify).toContain(`'${s}'`);
    expect(verify).toMatch(/news-sports'\s+and usage_count < 2000/);
    expect(verify).toMatch(/sibling row\(s\) were damaged/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
  });
});

describe('the finding is recorded, not just fixed', () => {
  it('names why the earlier repair missed this row', () => {
    // 50100101100100 repaired `watersports` and its postcondition passed truthfully
    // while the hyphenated sibling carried the same defect.
    expect(prose).toMatch(/50100101100100/);
    expect(prose).toMatch(/postcondition scoped to a slug cannot see another slug/);
  });

  it('names the merge decision it deliberately leaves to a human', () => {
    expect(prose).toMatch(/merge decision/);
    expect(prose).toMatch(/piss-play/);
  });

  it('records the measurement that made rehoming the right call', () => {
    expect(prose).toMatch(/2,706/);
  });
});
