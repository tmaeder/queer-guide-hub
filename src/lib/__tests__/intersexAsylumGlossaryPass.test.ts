import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791554493_intersex_asylum_glossary_pass';
const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`),
  'utf8',
);

// The migration's header quotes EVERY defect it removes, verbatim — the psychiatric-hospital
// body, "Hospital for severe mental health conditions", "gonochoric", "affecting females",
// "According to scientific research", "This tag is for individuals", "Another term for intersex."
// An unstripped `toContain` therefore passes with the executable statement deleted, and an
// unstripped negative assertion FAILS on correct code. Strip comments at line start, as the
// 99700101100300 round established (a mid-line `--` is inside a string literal here).
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verify = sql.slice(sql.indexOf('do $verify$'));
const statements = sql.slice(0, sql.indexOf('do $verify$'));

/** The region of a single UPDATE between its `set` and its `where` — the half that WRITES. */
function setClause(slug: string): string {
  const w = statements.indexOf(`where slug = '${slug}'`);
  expect(w, `no UPDATE found for ${slug}`).toBeGreaterThan(0);
  const s = statements.lastIndexOf('update unified_tags set', w);
  expect(s, `no set clause found for ${slug}`).toBeGreaterThan(0);
  return statements.slice(s, w);
}

describe(`${MIGRATION} — group A, wrong subject`, () => {
  it('rewrites asylum to international protection and names the collision', () => {
    const s = setClause('asylum');
    expect(s).toContain('International protection granted to someone at risk of persecution');
    expect(s).toContain('1951 Refugee Convention sets out five grounds');
    expect(s).toContain('membership of a particular social group');
    // The new body must NOT publish the institution sense. Scoped to the SET clause, because
    // the WHERE guard legitimately matches on it.
    expect(s).not.toMatch(/specialized medical facility|treatment of severe mental disorders/);
  });

  it('guards the asylum update on the defect, so it no-ops once repaired', () => {
    expect(statements).toContain("where slug = 'asylum'\n  and long_description ilike '%psychiatric hospital%'");
  });

  it('rewrites hermaphrodite to the term-applied-to-people sense, not the botany sense', () => {
    const s = setClause('hermaphrodite');
    expect(s).toContain('Outdated and offensive term once applied to intersex people');
    expect(s).not.toMatch(/gonochoric|dioecious/);
    // It may mention the biological sense in order to separate the two — but must not lead on it.
    expect(s).toContain('An obsolete term that was applied to intersex people');
  });
});

describe(`${MIGRATION} — group B, surgical`, () => {
  // Four rows, each ONE sentence, by replace(). A literal body here would be the LLM rewrite
  // both auto-apply paths were retired for, and would silently discard the other sentences.
  it.each([
    ['intersex-variations', 'According to scientific research published in 2018'],
    ['intersex-conditions', 'According to scientific research, intersex conditions are natural'],
    ['dsd-disorders-of-sex-development', 'essential to approach discussions around DSD'],
    ['asylum-refugees', 'This tag is for individuals seeking refuge'],
  ])('%s is edited by replace(), not by a literal body', (slug, needle) => {
    const w = statements.indexOf(`where slug = '${slug}'`);
    expect(w).toBeGreaterThan(0);
    const s = statements.lastIndexOf('update unified_tags set', w);
    const stmt = statements.slice(s, w);
    expect(stmt).toContain('replace(long_description,');
    expect(stmt).toContain(needle);
  });

  it('counts exactly four replace() edits on long_description', () => {
    expect(statements.match(/replace\(long_description,/g) ?? []).toHaveLength(4);
  });

  it('also replaces the asylum-refugees description, which restated the tag name', () => {
    // Scoped to the `description =` assignment ALONE. The long_description replace() in the
    // same SET clause carries the identical phrase, so an assertion over the whole clause
    // matched the body and passed while the description was gutted back to the tag's own name
    // — a mutation survivor on the first round, and the over-broad-anchor class.
    const s = setClause('asylum-refugees');
    const d = s.slice(s.indexOf('description ='), s.indexOf('long_description ='));
    expect(d.length).toBeGreaterThan(40);
    expect(d).toContain('who have fled their own country because of persecution');
    expect(d).not.toContain("'LGBTQ+ asylum seekers and refugees'");
  });
});

describe(`${MIGRATION} — group C, register`, () => {
  it.each(['sex-chromosome-anomaly', 'turner-syndrome-x'])(
    '%s sheds the gendering and pathologising phrasings in its SET clause',
    (slug) => {
      const s = setClause(slug);
      expect(s).not.toMatch(/affect(s|ing) females|Normally, females have|irregularity/);
      // "abnormal" must not reappear even inside a sentence ABOUT the word — that is the
      // mistake the prod dry run caught, where the explanatory clause tripped P3 itself.
      expect(s).not.toMatch(/abnormal/i);
    },
  );

  it('states the Turner identity question as contested rather than settling it', () => {
    const s = setClause('turner-syndrome-x');
    expect(s).toContain('genuinely contested');
    expect(s).toContain('do not describe themselves as intersex');
    expect(s).toContain('assigned female at birth');
  });
});

describe(`${MIGRATION} — group D, truncated or saying nothing`, () => {
  it('replaces the mojibake intersex description with the four-part definition', () => {
    const s = setClause('intersex');
    expect(s).toContain('sexual anatomy, reproductive organs, hormonal structure or levels');
    expect(s).toContain('not a medical condition and not a gender identity');
    // Guarded on the replacement character OR a short description, so it no-ops once repaired.
    expect(statements).toContain("chr(65533)");
  });

  it('completes the refugee description, which stopped at "due to a"', () => {
    const s = setClause('refugee');
    expect(s).toContain('well-founded fear of persecution');
    expect(statements).toContain("and description like '%due to a'");
  });

  it('gives variations-of-sex-development-vsd a definition rather than a cross-reference', () => {
    const s = setClause('variations-of-sex-development-vsd');
    expect(s).toContain('innate variations of sex characteristics');
    expect(s).not.toContain('Another term for intersex.');
  });
});

describe(`${MIGRATION} — creations`, () => {
  const NEW = [
    'intersex-genital-mutilation',
    'sex-characteristics',
    'variation-of-sex-characteristics',
    'bodily-integrity',
    'vital-intervention',
    'malta-declaration',
    'discretion-requirement',
    'particular-social-group',
    'credibility-assessment',
  ];

  it('creates all nine', () => {
    for (const slug of NEW) expect(statements).toContain(`('${slug}',`);
  });

  it('ships them unpublished, reviewed, and with publication_role set explicitly', () => {
    // publication_role is NOT NULL with no default; on a NULL, validate_tag_entity_target()
    // raises a misleading error about entity redirects (the 99991791039872 trap).
    expect(statements).toMatch(/'active',\s*'utility',\s*false,/);
    expect(statements).toContain('seo_indexable');
    // human_reviewed=true is the escape hatch from deprecate_unused_tags(), which selects
    // exactly active AND human_reviewed=false AND usage_count=0 — all nine are usage 0.
    expect(statements).toContain('human_reviewed');
  });

  it('writes all three category representations, because neither trigger fires on INSERT', () => {
    expect(statements).toMatch(/insert into unified_tags[\s\S]*?category,\s*category_id/);
    expect(statements).toMatch(/insert into tag_category_assignments\s*\(tag_id, category_id, is_primary\)/);
    expect(statements).toContain('is_primary');
  });

  it('adds igm as an APPROVED alias — an auto alias routes nothing', () => {
    expect(statements).toMatch(/insert into tag_aliases[\s\S]{0,400}?'igm',\s*'synonym',\s*'approved'/);
    expect(statements).toContain("'IGM', 'igm', 'synonym', 'approved'");
    // And never 'auto' on this insert.
    expect(statements).not.toMatch(/insert into tag_aliases[\s\S]{0,400}?'auto'/);
  });

  it('grounds IGM in the published definition rather than paraphrasing it', () => {
    expect(statements).toContain('free, personal, prior and fully informed consent');
    expect(statements).toContain('UN High Commissioner for Human Rights');
  });

  it('quotes the CJEU ruling verbatim on the discretion requirement', () => {
    expect(statements).toContain('conceal his homosexuality in his country of origin');
    expect(statements).toContain('exercise reserve in the expression of his sexual orientation');
    expect(statements).toContain('C-199/12');
  });

  it('does NOT create endosex, which is an approved alias of dyadic', () => {
    expect(statements).not.toMatch(/\('endosex',/);
  });
});

describe(`${MIGRATION} — postconditions`, () => {
  it('has eight postconditions, each of which RAISES', () => {
    // Assert the branch RAISES, not merely that its condition text is present: replacing each
    // `raise exception` with `null;` leaves every string-anchored check green while the
    // postcondition has stopped failing (the 99991791030558 survivors).
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']) {
      const i = verify.indexOf(`raise exception '${p} failed`);
      expect(i, `${p} does not raise`).toBeGreaterThan(0);
    }
    expect(verify.match(/raise exception '/g) ?? []).toHaveLength(8);
  });

  it('asserts reached state positively, never a count of rows in a bad state', () => {
    // `v_bad <> N` returns the wrong answer for a slug that has gone missing from the corpus,
    // which the softened pre-flight now lets through — so every check must count REACHED rows.
    expect(verify).toMatch(/v_bad <> 2/);
    expect(verify).toMatch(/v_bad <> 4/);
    expect(verify).toMatch(/v_bad <> 3/);
    expect(verify).toMatch(/v_bad <> 9/);
    // No loosened comparison anywhere, and no pre-seeded counter.
    expect(verify).not.toMatch(/v_bad\s*<\s*0|v_bad\s*>=\s*0/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/where false|if \(?false\)?/);
  });

  it('calls tag_has_prose rather than restating its OR', () => {
    // The gate is `coalesce(nullif(btrim(description),''), short_description) is not null` —
    // a hand-rolled "both present" form is a different, stricter check and fails correct rows.
    expect(verify).toContain('public.tag_has_prose(t.description, t.short_description)');
    expect(verify).not.toMatch(/description is not null and short_description is not null/);
  });

  it('asserts the deferred rows SURVIVED, so a sweep cannot satisfy the pass', () => {
    expect(verify).toContain('ambiguous-genitalia');
    expect(verify).toContain('congenital-abnormalities');
    expect(verify).toContain('dublin-event');
    expect(verify).toMatch(/P8 failed[\s\S]{0,80}deferral was swept/);
  });

  it('keeps the pre-flight soft — it notices, it never aborts', () => {
    const pre = sql.slice(sql.indexOf('do $pre$'), sql.indexOf('do $pre$') + 1400);
    expect(pre).toContain('raise notice');
    expect(pre).not.toContain('raise exception');
  });
});

describe(`${MIGRATION} — actor declaration`, () => {
  it('declares an actor, which is load-bearing for asylum-refugees', () => {
    // asylum-refugees is human_reviewed=true AND is_sensitive=true, so tag_prose_apply()
    // hard-refuses it and log_unified_tag_change() RAISEs on an undeclared system:% actor.
    // Measured, not assumed. The other eight corrected rows are human_reviewed=false.
    expect(statements).toContain("set_config('app.actor', 'migration:99991791554493");
  });

  it('carries the version string in every place it is bound', () => {
    // Filename, the test's own constant, and the app.actor stamp. A renumber that misses one
    // leaves a stamp naming a version that never ran.
    expect(raw).toContain(MIGRATION);
    expect(statements).toContain(`migration:${MIGRATION}`);
  });
});
