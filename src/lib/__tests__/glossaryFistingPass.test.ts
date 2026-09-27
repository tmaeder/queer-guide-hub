/**
 * Guards 99991790451897_glossary_fisting_pass.sql — the fisting comparison
 * against six external guides.
 *
 * Every assertion runs over COMMENT-STRIPPED source and, where it is about one
 * statement, is SCOPED to that statement. The header quotes each defect verbatim
 * and the verify block greps for the same strings, so a file-wide `toContain`
 * matches two or three times and passes with any one occurrence removed.
 *
 * The prose helper exists because the header wraps most of its claims across two
 * `--` lines: a single-line `toContain` on the raw file reads a wrapped sentence
 * as a missing one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790451897_glossary_fisting_pass';
const DIR = join(process.cwd(), 'supabase/migrations');

function source(): string {
  const file = readdirSync(DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, file), 'utf8');
}

const raw = source();
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const statements = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));

const prose = raw
  .split('\n')
  .filter((l) => /^\s*--/.test(l))
  .map((l) => l.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/**
 * Top-level UPDATE statements on unified_tags. Split on the statement keyword,
 * not on `;`: the replacement prose contains semicolons of its own (the
 * venue-dedup `[^;]*` trap), and a fixed character window reaches forward into
 * the next statement.
 */
const updates = statements
  .split(/^update unified_tags set/m)
  .slice(1)
  .map(
    (c) =>
      c.split(/^(?:update unified_tags set|update tag_aliases|insert into|delete from|do \$)/m)[0],
  );

describe('fisting pass — statements', () => {
  it('repairs the says-nothing row on its own defect text', () => {
    // Located via the statement splitter, never a character window: a negative
    // `slice` start counts from the END of the string, which silently yields
    // the wrong region (or an empty one) and reads as a missing guard.
    const s = updates.find((u) => u.includes("slug = 'anal-slut'"));
    expect(s, 'no update for anal-slut').toBeTruthy();
    expect(s).toContain("short_description = 'A term associated with sexual preference.'");
    // The replacement must name the subject the old body never mentioned.
    expect(s).toMatch(/receptive anal/);
  });

  it('fills the two NULL bodies and two NULL summaries only while they are NULL', () => {
    const fister = updates.find((u) => u.includes("slug = 'fister'"))!;
    expect(fister).toContain('long_description is null');
    for (const slug of ['anal', 'lube']) {
      const chunk = updates.find((u) => u.includes(`slug = '${slug}' and status`));
      expect(chunk, `no update for ${slug}`).toBeTruthy();
      expect(chunk).toMatch(/(short_description|long_description) is null/);
    }
  });

  it('repairs the wrong-sense summaries, each guarded on the wrong text', () => {
    const pairs: [string, string][] = [
      ['gloves', 'Garment covering the hand'],
      ['sounding', 'Body providing non-binding strategic advice'],
      ['douching', 'Vaginal cleansing practice'],
      ['douche', 'Device for introducing water into the body'],
    ];
    for (const [slug, wrong] of pairs) {
      const chunk = updates.find((u) => u.includes(`slug = '${slug}' and status`));
      expect(chunk, `no update for ${slug}`).toBeTruthy();
      expect(chunk).toContain(`short_description = '${wrong}'`);
    }
  });

  it('carries the glove-material fact the six sources get wrong by omission', () => {
    // Sources 1 and 5 recommend oil-based lube AND latex gloves; neither names
    // the incompatibility. `lubricant` already states the condom half.
    const g = updates.find((u) => u.includes("slug = 'gloves'"))!;
    expect(g).toContain('Oil-based lube destroys latex');
    expect(g).toContain('nitrile');
  });

  it('replaces define-the-term-with-the-term in both fields at once', () => {
    const at = updates.find((u) => u.includes("slug = 'anal-torture'"))!;
    expect(at).toContain(
      "short_description = 'Anal Torture' and long_description = 'Anal Torture'",
    );
  });

  it('removes the model-uncertainty tail from anal-fisting', () => {
    const af = updates.find((u) => u.includes("slug = 'anal-fisting'"))!;
    expect(af).toContain("short_description = 'Anal fisting is a sexual activity.'");
    expect(af).not.toContain('should be sought from reputable');
  });

  it('publishes none of the eight contested or unreplicated claims', () => {
    // Contested: safe-vs-dangerous poles, what pain means, botox, long-term
    // tone, a warm-up number. Each of these strings appearing would mean the
    // file had adopted one source's position as settled.
    expect(statements).not.toMatch(/botox/i);
    expect(statements).not.toMatch(/weaken(s|ed)? (the )?anal (muscle|tone)/i);
    expect(statements).not.toMatch(/30[-\s]?(to[-\s]?)?60[-\s]?minute/i);
    expect(statements).not.toMatch(/\b(?:can be )?fatal\b/i);
    expect(statements).not.toMatch(/fisting is safe/i);
    // Numbing IS named, as a warning — `fisting`'s own body already says so and
    // this agrees with it rather than contradicting it.
    expect(statements).toMatch(/numbing/i);
  });

  it('creates the one row unpublished with all three category representations', () => {
    expect(statements).toContain("'Duck Bill', 'duck-bill'");
    expect(statements).toMatch(/'active', 'article', false/);
    expect(statements).toContain('c.id, c.name');
    // Anchored: the table name is a PREFIX of `..._SKIPPED`, so a bare
    // toContain is satisfied by a renamed target.
    expect(statements).toMatch(/insert into tag_category_assignments(?![\w])/);
    expect(statements).toMatch(/where t\.slug = 'duck-bill'/);
  });

  it('adds three approved spelling aliases and promotes handballing', () => {
    const al = statements.slice(statements.indexOf('insert into tag_aliases'));
    expect(al).toContain("'synonym', 'approved'");
    for (const s of ['duckbill', 'silent-duck', 'duck-hand']) expect(al).toContain(`'${s}'`);
    expect(al).toContain(
      'not exists (select 1 from unified_tags x where lower(x.name) = lower(v.nm))',
    );
    // An `auto` alias routes nothing; promoting it is the whole point.
    // Anchored with a lookahead: `update tag_aliases` is a PREFIX of
    // `update tag_aliases_SKIPPED`, and a bare indexOf found the renamed
    // statement and passed every assertion against it. Second instance of the
    // prefix trap in this pair of files.
    expect(statements).toMatch(/update tag_aliases(?![\w])\s+a set review_status = 'approved'/);
    const hb = statements.slice(statements.search(/update tag_aliases(?![\w])/));
    expect(hb).toContain("a.alias_slug = 'handballing'");
    expect(hb).toContain("a.review_status = 'auto'");
  });

  it('touches exactly eleven update statements and no deferred row', () => {
    expect(updates).toHaveLength(11);
    for (const u of updates) {
      // The three bodies this pass refuses to touch, plus round thirteen's row.
      expect(u).not.toContain("slug = 'fisting'");
      expect(u).not.toContain("slug = 'anal-play'");
      expect(u).not.toContain("slug = 'lubricant'");
      expect(u).not.toContain("slug = 'fistee'");
      // Every write is content-guarded.
      expect(u).toMatch(/\bwhere slug = '[a-z-]+'/);
    }
  });

  it('writes no description column anywhere — summaries and bodies only', () => {
    for (const u of updates) expect(u).not.toMatch(/^\s*description\s*=/m);
  });
});

describe('fisting pass — postconditions', () => {
  it('is soft on preconditions', () => {
    expect(verify).toMatch(/if v_scope < 9 then/);
    expect(verify).toContain('refusing to report success');
  });

  it('counts FIELDS and CLAIMS per condition, not rows per OR', () => {
    // A count(*) over an OR counts rows; `lube` supplies two of the four fills
    // and `fisting` two of the five refusals, so the OR form maxes out below
    // target and fails on correct data. Both dry runs caught exactly this.
    // Every filter of BOTH counts is asserted. Checking only some of them let a
    // mutation repoint the `fister` filter at a nonexistent slug and survive,
    // even though that makes the count read 3 and RAISE at apply time.
    // `\s+`, not a single space: the SQL aligns these filters with runs of
    // spaces, and a single-space pattern silently matches nothing — which reads
    // as a missing assertion rather than as a whitespace mismatch.
    for (const f of [
      /count\(\*\) filter \(where slug = 'fister'\s+and coalesce\(btrim\(long_description\)/,
      /count\(\*\) filter \(where slug = 'anal'\s+and coalesce\(btrim\(short_description\)/,
      /count\(\*\) filter \(where slug = 'lube'\s+and coalesce\(btrim\(short_description\)/,
      /count\(\*\) filter \(where slug = 'lube'\s+and coalesce\(btrim\(long_description\)/,
    ])
      expect(verify).toMatch(f);
    // The refusal count has five filters, two of them on `fisting`.
    expect((verify.match(/count\(\*\) filter \(where slug = 'fisting'/g) ?? []).length).toBe(2);
    expect(verify).toMatch(/if v_filled <> 4 then/);
    expect(verify).toMatch(/if v_refusals <> 5 then/);
  });

  it('asserts the REACHED publication state for the new row', () => {
    expect(verify).toContain("publication_role = 'utility'");
    expect(verify).toContain("seo_deindex_reason = 'publication_role:utility'");
    expect(verify).toContain('seo_indexable = false');
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
  });

  it('makes all five refusals enforceable', () => {
    for (const needle of [
      "slug = 'fisting'   and long_description like '%hepatitis C%'",
      "slug = 'anal-play' and long_description like '%flared base or a retrievable handle%'",
      "slug = 'lubricant' and description      like '%oil-based lube destroys latex condoms%'",
      "slug = 'fistee'    and long_description like '%prioritize consent and safety%'",
    ])
      expect(verify).toContain(needle);
  });

  it('PROVES no description moved, via a snapshot', () => {
    expect(sql).toContain('create temporary table _fist_before');
    expect(verify).toContain('t.description is distinct from b.description');
    expect(verify).toMatch(/if v_collat <> 0 then/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
    const reads = (verify.match(/from unified_tags/g) ?? []).length;
    expect(reads).toBeGreaterThanOrEqual(6);
  });
});

describe('fisting pass — sources', () => {
  it('records all six sources', () => {
    for (const host of [
      'thepleasurechest.com',
      'sinful.co.uk',
      'sfaf.org',
      'bespokesurgical.com',
      'badgirlsbible.com',
      'thecode.shop',
    ])
      expect(raw).toContain(host);
  });

  it('records the four weighting caveats', () => {
    expect(prose).toContain('adult-retail marketing');
    expect(prose).toContain('DISJOINT');
    expect(prose).toContain('sells the procedures it names');
    expect(prose).toContain('alarmist pole');
  });

  it('records that the corpus already held the oil/latex fact', () => {
    // The seductive move was to present this as the pass's headline finding.
    expect(prose).toContain('ALREADY CLOSED in this corpus');
    expect(prose).toMatch(/Check whether the right answer is already in the corpus/);
  });

  it('names the unanimous-but-incomplete consensus as the dangerous shape', () => {
    expect(prose).toContain('unanimous-but-incomplete');
    expect(prose).toContain('more dangerous shape than a visible');
  });

  it('names what it declined to create and to merge', () => {
    for (const n of ['anal-fissure', 'J-Lube', 'nitrile', 'sphincter']) expect(prose).toContain(n);
    expect(prose).toContain('is NOT merged into');
  });
});
