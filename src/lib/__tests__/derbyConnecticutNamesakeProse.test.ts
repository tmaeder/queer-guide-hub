import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991789838474_derby_connecticut_namesake_prose.sql.
//
// Derby, Connecticut (Q755197) published Derby, England's lead AND England's
// Wikidata population (255,394 byte-exact) while its own QID and wikipedia_title
// were correct. The replacement text is the row's own unpublished
// field_provenance candidate, so this is a correction, not an invention.
//
// Assertions are scoped to the statement they are about: the header quotes the
// defect's own strings ("Derbyshire, England", 255394) and the postconditions
// quote them again in their guards, so a whole-file assertion passes against a
// gutted statement.

const MIGRATION = '99991789838474_derby_connecticut_namesake_prose.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const verify = raw.slice(raw.indexOf('do $verify$'));
const ctUpdate = statements.slice(
  statements.indexOf('update public.cities c'),
  statements.indexOf("and c.description ilike '%Derbyshire, England%';") + 60,
);
const gbUpdate = statements.slice(
  statements.indexOf('set population = 255394'),
  statements.indexOf('do $verify$'),
);

describe('derby connecticut namesake prose: the correction', () => {
  it('publishes the Connecticut text, taken from the row own candidate', () => {
    expect(ctUpdate).toContain('Derby is a city in New Haven County, Connecticut');
    expect(ctUpdate).toContain('The population was 12,325 at the 2020 census.');
    // a literal, not the row jsonb read at apply time -- what lands must be what
    // was verified, not whatever a later enrichment pass leaves in candidates
    expect(ctUpdate).not.toMatch(/set description = c\.field_provenance/);
  });

  it('corrects the population to the row own Wikidata value', () => {
    expect(ctUpdate).toContain('population = 12325');
    expect(ctUpdate).not.toMatch(/set[\s\S]*population = 255394/);
  });

  it('corrects rather than retracts -- the row is live and indexable', () => {
    expect(ctUpdate).not.toMatch(/description = null/i);
    expect(statements).not.toMatch(/seo_indexable\s*=\s*false/);
  });

  it('is content-guarded, so a human who fixes it first keeps their work', () => {
    expect(ctUpdate).toContain("c.slug = 'derby'");
    expect(ctUpdate).toContain("c.wikidata_qid = 'Q755197'");
    expect(ctUpdate).toContain("c.description ilike '%Derbyshire, England%'");
  });

  it('preserves the replaced text AND the replaced number', () => {
    expect(ctUpdate).toContain("'from', c.description");
    expect(ctUpdate).toContain("'from_population', c.population");
  });

  it('builds provenance with || and never jsonb_set(create_missing)', () => {
    // create_missing creates only the LAST path element, so writing into an
    // absent parent key stores nothing while the text is already destroyed
    expect(statements).not.toContain('jsonb_set');
    expect(ctUpdate).toContain("coalesce(c.field_provenance->'description', '{}'::jsonb)");
  });

  it('gives the England row only the facts that are its own', () => {
    expect(gbUpdate).toContain('population = 255394');
    expect(gbUpdate).toContain("wikipedia_title = 'Derby'");
    expect(gbUpdate).toContain("c.slug = 'derby-england'");
    expect(gbUpdate).toContain("c.wikidata_qid = 'Q43475'");
    // fill-if-empty: it may not overwrite a value somebody else has set
    expect(gbUpdate).toContain('c.population is null');
    expect(gbUpdate).toContain('c.wikipedia_title is null');
  });
});

describe('derby connecticut namesake prose: postconditions', () => {
  it('asserts the reached state positively', () => {
    expect(verify).toMatch(/if v_bad <> 1 then[\s\S]*?P1 failed/);
    expect(verify).toMatch(/if v_bad <> 0 then[\s\S]*?P2 failed/);
  });

  it('asserts the prior text stayed recoverable and the candidate survived', () => {
    const p3 = verify.slice(verify.indexOf('-- P3'), verify.indexOf('-- P4'));
    expect(p3).toContain("'corrected'->>'from'");
    expect(p3).toContain("'from_population'");
    expect(p3).toContain("'candidates' is not null");
  });

  it('MIRROR: exactly one row is corrected, so it cannot become a sweep', () => {
    const p5 = verify.slice(verify.indexOf('-- P5'), verify.indexOf('-- P6'));
    expect(p5).toContain("'corrected'->>'by' = 'migration:99991789838474'");
    expect(p5).toMatch(/if v_bad <> 1 then/);
  });

  it('MIRROR: the England row keeps its own England prose', () => {
    const p6 = verify.slice(verify.indexOf('-- P6'));
    expect(p6).toContain("c.slug = 'derby-england'");
    expect(p6).toContain("ilike '%Derbyshire%'");
    expect(p6).toMatch(/length\(btrim\(c\.description\)\) > 100/);
  });

  it('never loosens a comparison anywhere in the verify block', () => {
    expect(verify).not.toMatch(/if v_bad\s*<\s*0/);
    expect(verify).not.toMatch(/where false/i);
    expect((verify.match(/if v_bad <> \d+ then/g) ?? []).length).toBe(6);
    expect((verify.match(/select count\(\*\) into v_bad/g) ?? []).length).toBe(6);
  });
});

describe('derby connecticut namesake prose: what the header has to record', () => {
  it('names the cohort it deliberately did not sweep', () => {
    expect(raw).toMatch(
      /43 shared texts over 86\s*\n?--\s*rows, 65 of them indexable, 24 crossing a country boundary/,
    );
    expect(raw).toContain('Saint Augustine/Florida');
  });

  it('records that the direction was proven by the byte-exact population', () => {
    expect(raw).toContain('12,325');
    expect(raw).toContain('255,394');
    expect(raw).toMatch(/BYTE-EXACT/);
  });
});
