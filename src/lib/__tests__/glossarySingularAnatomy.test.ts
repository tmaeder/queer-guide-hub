import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the singular-anatomy de-gendering pass.
 *
 * The migration continues 99991789823744 onto the rows a singular/plural merge
 * later pointed the repaired pages at. The assertions that matter most are the
 * ones about what it must NOT sweep.
 */

const FILE = join(
  __dirname,
  '../../../supabase/migrations',
  '99991790384461_glossary_singular_anatomy_degender.sql',
);

// The header quotes the very phrases the statements remove, so every assertion
// runs against comment-stripped source — otherwise a `toContain` is satisfied
// by the prose while the statement is gone.
const stripped = readFileSync(FILE, 'utf8')
  .split('\n')
  .map((l) => {
    const i = l.indexOf('--');
    return i === -1 ? l : l.slice(0, i);
  })
  .join('\n');

const verifyAt = stripped.indexOf('do $verify$');
const writes = stripped.slice(0, verifyAt);
const verify = stripped.slice(verifyAt);

const GENDERED =
  /(female-bodied|female mammals|the female genitalia|the female reproductive|male reproductive system|principal male|primary (female|male) sex hormone)/i;

describe('what it writes', () => {
  it('repairs all ten group-A anatomy rows', () => {
    for (const slug of [
      'uterus',
      'vulva',
      'scrotum',
      'prostate-gland',
      'epididymis',
      'ejaculatory-duct',
      'vas-deferens',
      'erectile-tissue',
      'menstrual-cycle',
      'pelvic-inflammatory-disease-pid',
    ]) {
      expect(writes).toContain(`('${slug}',`);
    }
  });

  it('never writes the register it removes', () => {
    // scoped to the VALUES payloads: the WHERE/verify clauses legitimately
    // quote the defect as their own guard.
    for (const m of writes.matchAll(/'([^']{40,})'/g)) {
      expect(m[1]).not.toMatch(GENDERED);
    }
  });

  it('rewrites only the summary on the three hormone rows, never the body', () => {
    const hormones = writes.slice(writes.indexOf("('estradiol'"), writes.indexOf('-- ─')) || '';
    expect(writes).toContain("('estradiol',");
    expect(writes).toContain("('testosterone',");
    // the hormone UPDATE must not touch long_description — those bodies are
    // already trans-aware and rewriting them is the retired experiment
    const stmt = writes.split(/\n(?=update\s)/i).find((s) => /estradiol/.test(s)) ?? '';
    expect(stmt).not.toMatch(/long_description/);
    expect(hormones.length).toBeGreaterThan(0);
  });

  it('nulls the wrong-subject bodies on breast and glans, content-guarded', () => {
    const breast = writes.split(/\n(?=update\s)/i).find((s) => /slug = 'breast'/.test(s)) ?? '';
    expect(breast).toMatch(/long_description = null/);
    expect(breast).toMatch(/short_description ilike '%Feeding infants%'/);

    const glans = writes.split(/\n(?=update\s)/i).find((s) => /slug = 'glans'/.test(s)) ?? '';
    expect(glans).toMatch(/long_description = null/);
    expect(glans).toMatch(/mollusc/i);
  });

  it('moves the two miscategorised rows by category_id alone', () => {
    const stmt = writes.split(/\n(?=update\s)/i).find((s) => /category_id = c\.id/.test(s)) ?? '';
    expect(stmt).toMatch(/'vas-deferens',\s*'physical-reproductive'/);
    expect(stmt).toMatch(/'erectile-tissue',\s*'physical-reproductive'/);
    expect(stmt).not.toMatch(/\bcategory\s*=\s*'/);
    expect(stmt).toMatch(/is distinct from c\.id/);
  });

  it('declares an actor', () => {
    expect(writes).toContain('migration:99991790384461');
  });
});

describe('what it refuses', () => {
  it('never touches the three rows that are ABOUT gendered concepts', () => {
    for (const slug of ['wolffian', 'male-femininity', 'bio-king-faux-king']) {
      const stmts = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s.trim()));
      for (const s of stmts) expect(s).not.toContain(`'${slug}'`);
    }
  });

  it('never touches the already-repaired plural rows', () => {
    for (const s of writes.split(/\n(?=update\s)/i).filter((x) => /^update/i.test(x.trim()))) {
      expect(s).not.toMatch(/'(clitoris|sperm|foreskin|vagina|perineum|breasts|ovaries)'/);
    }
  });

  it('never revives, merges, renames or re-slugs anything', () => {
    expect(writes).not.toMatch(/set\s+status\s*=/i);
    expect(writes).not.toMatch(/set\s+slug\s*=/i);
    expect(writes).not.toMatch(/merged_into_id/);
    expect(writes).not.toMatch(/seo_indexable\s*=/);
    expect(writes).not.toMatch(/delete\s+from/i);
  });
});

describe('postconditions', () => {
  it('assert the gendered register is gone across the whole cohort', () => {
    expect(verify).toMatch(/female-bodied/);
    expect(verify).toMatch(/still publish the gendered register/);
  });

  it('assert the wrong subjects are gone from every prose field', () => {
    expect(verify).toMatch(/Breastfeeding is the process/);
    expect(verify).toMatch(/mollusc/);
  });

  it('call the real thin-page predicate rather than restating it', () => {
    expect(verify).toMatch(/tag_has_prose\(description, short_description\)/);
  });

  it('assert all three category representations, not just the lever', () => {
    expect(verify).toMatch(/t\.category_id = c\.id/);
    expect(verify).toMatch(/t\.category = c\.name/);
    expect(verify).toMatch(/a\.is_primary/);
    expect(verify).toMatch(/if v_n <> 2 then/);
  });

  it('assert the already-repaired rows did NOT regress', () => {
    expect(verify).toMatch(/people with a vulva/);
    expect(verify).toMatch(/already-repaired rows regressed/);
  });

  it('assert wolffian survives', () => {
    expect(verify).toMatch(/wolffian was swept and should not have been/);
  });

  it('are not loosened or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).not.toMatch(/v_(bad|n)\s*<\s*0/);
    // every branch must still read the table it claims to check
    expect((verify.match(/from unified_tags/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
