import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the anatomy/reproductive-health de-gendering follow-up to #3807.
 *
 * Assertions run against COMMENT-STRIPPED SQL and are scoped to the half of the
 * statement they are about. This file's header quotes every phrase it removes,
 * so a bare toContain() over the raw text is satisfied by the prose while the
 * statement is gone.
 */

const MIGRATION = '99991789823744_glossary_anatomy_degender.sql';
const FILE = join(__dirname, '../../../supabase/migrations', MIGRATION);

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

const full = stripComments(readFileSync(FILE, 'utf8'));
const verifyAt = full.indexOf('do $verify$');
const writes = full.slice(0, verifyAt);
const verify = full.slice(verifyAt);

/**
 * Split into whole statements at the START of the next one — not on `;`, because
 * replacement prose contains semicolons ("...travels down the fallopian tube
 * toward the uterus" is fine, but `pregnancy` and `ovaries` both use one), and a
 * `[\s\S]*?;` match truncates mid-literal and reports a guarded UPDATE as
 * unguarded.
 */
const statements = writes
  .split(/\n(?=(?:update|insert|select set_config|delete)\s)/i)
  .map((s) => s.trim())
  .filter(Boolean);

const updates = statements.filter((s) => /^update /i.test(s));

/** The SET half of an UPDATE — everything before its WHERE. */
function setClauseOf(stmt: string): string {
  const i = stmt.search(/\bwhere\b/i);
  return i === -1 ? stmt : stmt.slice(0, i);
}

describe('anatomy de-gendering migration', () => {
  it('repairs exactly the thirteen rows it claims', () => {
    expect(updates).toHaveLength(13);
    const slugs = updates.map((u) => u.match(/where slug = '([a-z-]+)'/)?.[1]).sort();
    expect(slugs).toEqual(
      [
        'clitoris',
        'erectile-dysfunction',
        'fallopian-tubes',
        'foreskin',
        'ovaries',
        'perineum',
        'pregnancy',
        'seminal-vesicles',
        'sex-worker',
        'sperm',
        'testicle',
        'uncircumcised',
        'vagina',
      ].sort(),
    );
  });

  it('content-guards every UPDATE on the exact phrase it removes', () => {
    for (const u of updates) {
      const where = u.slice(u.search(/\bwhere\b/i));
      expect(where, `unguarded UPDATE:\n${u.slice(0, 200)}`).toMatch(/description ilike '%/);
    }
  });

  it('only ever writes description — no status, flag, identifier or category change', () => {
    for (const u of updates) {
      const set = setClauseOf(u);
      expect(set).not.toMatch(/\bstatus\s*=/);
      expect(set).not.toMatch(/seo_indexable\s*=/);
      expect(set).not.toMatch(/wikidata_id\s*=/);
      expect(set).not.toMatch(/category_id\s*=/);
      expect(set).not.toMatch(/human_reviewed\s*=/);
      expect(set).not.toMatch(/short_description\s*=/);
    }
  });

  it('replaces prose on rows that render, never nulls it', () => {
    for (const u of updates) {
      expect(setClauseOf(u)).not.toMatch(/description\s*=\s*null/);
    }
  });

  it('removes the sex-worker sentence with replace(), which cannot author prose', () => {
    const sw = updates.find((u) => /slug = 'sex-worker'/.test(u)) ?? '';
    expect(sw).toMatch(/replace\(\s*description,/);
    expect(sw).toContain(
      'Sex workers are typically female, but there are some male and transgender sex workers.',
    );
    // the replacement argument must be the empty string — a literal body here
    // would be a rewrite wearing a deletion's clothes
    expect(sw).toMatch(/,\s*''\)\)/);
  });

  it('declares an actor, since several rows are human_reviewed', () => {
    expect(writes).toContain("set_config('app.actor'");
    expect(writes).toContain('migration:99991789823744');
  });
});

describe('postconditions', () => {
  it('assert the excluding prose is gone corpus-wide, not just on these slugs', () => {
    expect(verify).toMatch(/from unified_tags\s*\n\s*where coalesce\(description,''\) ~\*/);
    for (const needle of [
      'sexual dysfunction in males',
      'vital female sex organ',
      'gonad in the female reproductive system',
      'In male human anatomy',
      "inside a woman''s uterus",
      'typically female, but there are some male and transgender',
    ]) {
      expect(verify).toContain(needle);
    }
  });

  it('assert the five correct-as-written rows SURVIVE', () => {
    // A sweep that took these too would satisfy the "excluding prose is gone"
    // check as well — this is the half that stops over-reach.
    for (const [slug, keep] of [
      ['ceterosexual', 'neither exclusively male nor female'],
      ['feminism', "women''s rights"],
      ['hymen', 'assigned female at birth'],
      ['penis', 'Trans women, non-binary people and intersex people'],
      ['breasts', 'A sexual focus on breasts'],
    ] as const) {
      expect(verify).toContain(`slug = '${slug}'`);
      expect(verify).toContain(keep);
    }
  });

  it('assert sex-worker kept the sentences meant to survive', () => {
    expect(verify).toContain('engages in sexual services in exchange for money or goods');
    expect(verify).toContain('prostitution, exotic dancing, and pornography');
  });

  it('assert nothing lost active status or indexability', () => {
    expect(verify).toMatch(/status <> 'active'/);
    expect(verify).toMatch(/slug = 'erectile-dysfunction' and seo_indexable/);
  });

  it('are not loosened, pre-seeded, or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/if\s+v_bad\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/if\s+v_n\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=\s*0\s*;/);
    // the positive form: count rows in the REACHED state, not the bad one
    expect(verify).toMatch(/if v_n <> 13 then/);
  });
});
