/**
 * Guards 99991790498180_glossary_douching_validated.sql — the re-check of
 * `douching` and `douche` against seven dedicated sources, one of which could
 * not be read.
 *
 * Assertions run over COMMENT-STRIPPED source and are scoped to the statement
 * they are about. The header quotes every removed and refused claim verbatim and
 * the verify block greps for the same strings, so a file-wide `toContain` matches
 * twice and passes with either occurrence gone.
 *
 * Header claims are asserted against joined `prose`: the header wraps nearly
 * every sentence across two `--` lines, and a single-line `toContain` on the raw
 * file reads a wrapped claim as a missing one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790498180_glossary_douching_validated';
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

const updates = statements
  .split(/^update unified_tags set/m)
  .slice(1)
  .map((c) => c.split(/^(?:update unified_tags set|insert into|delete from|do \$)/m)[0]);

const douching = () => updates.find((u) => u.includes("slug = 'douching'"))!;
const douche = () => updates.find((u) => u.includes("slug = 'douche' and status"))!;

/**
 * The SET half of an update — everything before its `where`. Every statement
 * here is content-guarded, so it QUOTES the defect it removes verbatim in its
 * own WHERE clause. A `not.toMatch` over the whole statement therefore fails on
 * correct code, which is what the first draft of this file did. Anchor a
 * must-not-contain on what is WRITTEN, never on the statement.
 */
const written = (stmt: string) => stmt.split(/^where /m)[0];

describe('douching pass — the unreplicated mechanism is removed', () => {
  it('drops "absorbs more", which no source in the set states', () => {
    // The tearing half is what six sources give; the absorption half was mine.
    expect(written(douching())).not.toMatch(/absorbs more/);
    // Guarded on that exact string, so the statement is a no-op once a
    // concurrent session has already fixed it.
    expect(douching()).toContain("long_description like '%absorbs more%'");
    expect(verify).toMatch(/if v_absorbs <> 0 then/);
  });

  it('keeps the tearing mechanism the sources do give', () => {
    expect(douching()).toMatch(/tears more easily/);
  });
});

describe('douching pass — the validated claims survive', () => {
  it('keeps barrier damage (6 of 6) and raised risk (5 of 6, zero contradiction)', () => {
    const d = douching();
    expect(d).toMatch(/strips mucus/);
    expect(d).toMatch(/raises rather than lowers the risk/);
    // Counted per claim, not per row: both live on ONE row, so a count(*) over
    // an OR would max out at 1 and fail on correct data.
    expect(verify).toMatch(/count\(\*\) filter \(where long_description like '%strips mucus%'\)/);
    expect(verify).toMatch(/if v_validated <> 3 then/);
  });

  it('keeps no-soap-no-additives (5 of 6, zero contradiction)', () => {
    expect(douching()).toMatch(/no soap and no additives/);
  });
});

describe('douching pass — the three omissions are added', () => {
  it('adds the timing gap, as a range rather than one picked number', () => {
    // 6 of 6 give a gap; they span 30 minutes to two hours, so the range is
    // published instead of one source's figure.
    expect(douching()).toMatch(/half an hour to a couple of hours/);
    expect(douching()).toMatch(/rather than going straight from one to the other/);
  });

  it('adds the one frequency figure two independent sources agree on exactly', () => {
    expect(douching()).toMatch(/once in a day and two or three times a week/);
  });

  it('adds the stopping rule for water that will not run clear', () => {
    // The only source-given rule that closes the chase-clear failure mode.
    expect(douching()).toMatch(/will not run clear/);
    expect(douching()).toMatch(/stop and do something else/);
  });

  it('asserts all four additions landed', () => {
    expect(verify).toMatch(/if v_added <> 4 then/);
  });
});

describe('douching pass — contested and single-source claims are refused', () => {
  it('publishes no quantified risk figure', () => {
    // webmd's 74% is the only number in the set and the magnitude is actively
    // contested — "slightly" at one end, unhedged at the other.
    expect(statements).not.toMatch(/74\s?%/);
  });

  it('publishes neither saline-over-water nor a temperature number', () => {
    // Saline is the one place a source contradicts the plain-water advice;
    // temperature is contested three ways (cooler-than-lukewarm vs 37 °C vs
    // unnumbered lukewarm).
    expect(written(douching())).not.toMatch(/saline/i);
    expect(written(douching())).not.toMatch(/37\s?°?\s?C|body temperature/i);
    // The unnumbered word all four public-health sources use is kept, with the
    // burn risk as the stated reason.
    expect(douching()).toMatch(/lukewarm/);
    expect(douching()).toMatch(/scalds/);
  });

  it('publishes no single-source adjunct or anatomical argument', () => {
    expect(written(douching())).not.toMatch(/bisacodyl|laxative/i);
    expect(written(douching())).not.toMatch(/too high in the colon/i);
  });

  it('makes every refusal enforceable at apply time', () => {
    expect(verify).toMatch(/if v_refused <> 0 then/);
    for (const pat of ['saline', 'bisacodyl|laxative', 'too high in the colon'])
      expect(verify).toContain(pat);
  });
});

describe('douching pass — the douche body residue', () => {
  it('removes the vaginal-first framing the previous pass left in the body', () => {
    expect(douche()).toContain("long_description like '%typically refers to vaginal irrigation%'");
    expect(verify).toMatch(/if v_vaginal <> 0 then/);
  });

  it('KEEPS the do-not-share rule that was the reason the body was spared', () => {
    // Replacing a body that carried one correct rule must not lose that rule.
    expect(douche()).toMatch(/never shared between people/);
    expect(douche()).toMatch(/never moved between the rectum and the vagina/);
    expect(verify).toMatch(/if v_share <> 1 then/);
  });

  it('does not assert on the reader what a douche may be used for', () => {
    // The old body called it "not a recreational product", which is not this
    // platform's call to make about its own readers.
    expect(written(douche())).not.toMatch(/not a recreational product/);
  });
});

describe('douching pass — postconditions', () => {
  it('is soft on preconditions', () => {
    expect(verify).toMatch(/if v_scope < 2 then/);
    expect(verify).toContain('refusing to report success');
  });

  it('writes long_description only, on two rows, and proves it', () => {
    for (const u of updates) {
      expect(u).not.toMatch(/^\s*description\s*=/m);
      expect(u).not.toMatch(/^\s*short_description\s*=/m);
    }
    expect(sql).toContain('create temporary table _dv_before');
    expect(verify).toContain('t.description       is distinct from b.description');
    expect(verify).toContain('t.short_description is distinct from b.short_description');
    expect(verify).toContain("b.slug not in ('douching','douche')");
    expect(verify).toMatch(/if v_collat <> 0 then/);
  });

  it('asserts the four sibling bodies it does not touch are intact', () => {
    for (const s of ['fisting', 'anal-fisting', 'scat-play', 'lubricant'])
      expect(verify).toMatch(new RegExp(`count\\(\\*\\) filter \\(where slug = '${s}'`));
    expect(verify).toMatch(/if v_intact <> 4 then/);
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
  });
});

describe('douching pass — the source accounting is honest', () => {
  it('records masterclass as UNREAD, not silent, and excludes it', () => {
    // Three fallbacks exhausted. Unread and silent are different findings.
    expect(prose).toMatch(/masterclass\.com is UNREAD/);
    expect(prose).toMatch(/Unread is not silent/);
    expect(prose).toMatch(/denominator below is 6, not 7/);
  });

  it('records the non-independence that deflates two tallies', () => {
    // endinghiv and Burnett are one lineage; what makes the findings robust is
    // the two consumer sources supporting independently of the HIV sector.
    expect(prose).toMatch(/likely ONE voice, not two/);
    expect(prose).toMatch(/INDEPENDENTLY/);
  });

  it('records what the check validated versus what it corrected', () => {
    expect(prose).toMatch(/6 of 6, zero\s+contradiction/);
    expect(prose).toMatch(/5 of\s+6 support, ZERO contradict, 1 silent/);
    // The silence is an omission by a clinical provider, not a contradiction.
    expect(prose).toMatch(/not a source disputing the mechanism/);
    expect(prose).toMatch(/"absorbs more" is a mechanism NO\s+source in the set states/);
  });

  it('names the half-repair rule it is closing', () => {
    expect(prose).toMatch(/read all three prose\s+fields when one of them is wrong/);
  });
});
