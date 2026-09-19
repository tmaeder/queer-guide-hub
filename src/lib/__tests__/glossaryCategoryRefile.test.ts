import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guards the category half of the sex-glossary brief. */

const FILE = join(
  __dirname,
  '../../../supabase/migrations',
  '99991789846890_glossary_category_refile.sql',
);

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

describe('category refile', () => {
  it('moves exactly the four rows it names, to the categories it names', () => {
    for (const [slug, cat] of [
      ['cervix', 'physical-reproductive'],
      ['outing', 'violence-hate'],
      ['gender-non-conforming', 'expression-presentation'],
      ['fingering', 'practices-play'],
    ] as const) {
      expect(writes).toContain(`('${slug}',`);
      expect(writes).toContain(`'${cat}'`);
    }
  });

  it('moves by writing category_id alone and letting both triggers reconcile', () => {
    // On the UPDATE path the BEFORE trigger derives the `category` text and the
    // AFTER trigger moves the primary junction row. Writing the text by hand
    // here would fight them.
    expect(writes).toMatch(/set category_id = c\.id/);
    const catStmt = writes.split(/\n(?=update\s)/i).find((s) => /category_id/.test(s)) ?? '';
    expect(catStmt).not.toMatch(/\bcategory\s*=\s*'/);
    expect(catStmt).not.toMatch(/insert into tag_category_assignments/);
  });

  it('is idempotent — a row already in the target category is skipped', () => {
    expect(writes).toMatch(/t\.category_id is distinct from c\.id/);
  });

  it('clears the adult flag on cervix only', () => {
    expect(writes).toMatch(/set is_adult = false\s*\nwhere slug = 'cervix' and is_adult/);
  });

  it('never touches prose', () => {
    for (const s of writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s))) {
      expect(s).not.toMatch(/(^|[\s,])(short_)?description\s*=/);
      expect(s).not.toMatch(/long_description\s*=/);
    }
  });

  it('declares an actor', () => {
    expect(writes).toContain('migration:99991789846890');
  });
});

describe('postconditions', () => {
  it('assert ALL THREE category representations, not just the lever', () => {
    expect(verify).toMatch(/t\.category_id = c\.id/);
    expect(verify).toMatch(/t\.category = c\.name/);
    expect(verify).toMatch(/tag_category_assignments a[\s\S]{0,140}?a\.is_primary/);
    expect(verify).toMatch(/if v_n <> 4 then/);
  });

  it('assert each row actually left the category it was in', () => {
    expect(verify).toContain("category = 'Dynamics & Roles'");
    expect(verify).toContain("category = 'Orientation'");
    expect(verify).toContain("category = 'Fetishes'");
  });

  it('assert pubic-hair and the play-style rows SURVIVE', () => {
    // pubic-hair reads like the same anatomy-as-kink error and is not one; a
    // sweep that took it would satisfy the "did it move" check just as happily.
    expect(verify).toMatch(/'pubic-hair','blood-play','temperature-play','rough-sex'/);
    expect(verify).toMatch(/deliberately-left rows were refiled/);
  });

  it('are not loosened or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/if\s+v_(bad|n)\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
  });
});
