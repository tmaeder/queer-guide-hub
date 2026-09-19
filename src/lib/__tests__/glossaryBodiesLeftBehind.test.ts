import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the five bodies the summary repairs left standing.
 *
 * Comment-stripped, and every assertion scoped to the half of the statement it
 * is about — this file's header quotes each defect string it removes.
 */

const MIGRATION = '99991789826279_glossary_bodies_the_summary_pass_left.sql';
const FILE = join(__dirname, '../../../supabase/migrations', MIGRATION);

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

const updates = writes
  .split(/\n(?=(?:update|insert|select set_config)\s)/i)
  .map((s) => s.trim())
  .filter((s) => /^update /i.test(s));

const setOf = (stmt: string) => {
  const i = stmt.search(/\bwhere\b/i);
  return i === -1 ? stmt : stmt.slice(0, i);
};

describe('bodies the summary pass left behind', () => {
  it('touches exactly the five rows it names, and no others', () => {
    const slugs = [...new Set(updates.map((u) => u.match(/slug = '([a-z-]+)'/)?.[1]))].sort();
    expect(slugs).toEqual(
      ['ball-kicking', 'minsexual', 'neosexual', 'praise-kink', 'primal-play'].sort(),
    );
  });

  it('NULLS bodies rather than rewriting them — a replacement would be the retired LLM rewrite', () => {
    const bodyWrites = updates.filter((u) => /long_description/.test(setOf(u)));
    expect(bodyWrites).toHaveLength(5);
    for (const u of bodyWrites) {
      expect(setOf(u), `body was rewritten, not nulled:\n${u.slice(0, 160)}`).toMatch(
        /long_description\s*=\s*null/,
      );
    }
  });

  it('never writes description — it is the evidence each repair rests on', () => {
    for (const u of updates) {
      expect(setOf(u)).not.toMatch(/(^|\s)description\s*=/);
    }
  });

  it('content-guards every UPDATE on the exact defect it removes', () => {
    for (const u of updates) {
      const where = u.slice(u.search(/\bwhere\b/i));
      expect(where, `unguarded:\n${u.slice(0, 160)}`).toMatch(/ilike '%/);
    }
  });

  it('replaces the ball-kicking summary, because it is a different subject not a thin one', () => {
    const bk = updates.find((u) => /short_description/.test(setOf(u))) ?? '';
    expect(bk).toContain("slug = 'ball-kicking'");
    expect(setOf(bk)).toMatch(/testicles/i);
    expect(bk).toMatch(/ilike '%Physical activity with a ball%'/);
  });

  it('declares an actor — all five rows are human_reviewed', () => {
    expect(writes).toContain("set_config('app.actor'");
    expect(writes).toContain('migration:99991789826279');
  });
});

describe('postconditions', () => {
  it('count the REACHED state positively, not rows in a bad state', () => {
    expect(verify).toMatch(/if v_n <> 5 then/);
    expect(verify).toContain('tag_has_prose(description, short_description)');
  });

  it('assert corpus-wide that no self-refusing body survives', () => {
    expect(verify).toMatch(/status = 'active'/);
    expect(verify).toContain('as there are no provided sources');
    expect(verify).toContain('discussed in an episode of');
  });

  it('assert ball-kicking lost the sport sense on BOTH fields', () => {
    expect(verify).toContain('Physical activity with a ball');
    expect(verify).toMatch(/soccer/i);
  });

  it('assert the contested-term controls SURVIVE — the half that stops over-reach', () => {
    // morosexual and novosexual legitimately say a term is not officially
    // recognised. A sweep broad enough to take them would satisfy the
    // "no self-refusing body" check just as happily.
    expect(verify).toContain("'morosexual','novosexual'");
    expect(verify).toContain('not an officially recognized term');
  });

  it('are not loosened, pre-seeded or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/if\s+v_bad\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/if\s+v_n\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).not.toMatch(/v_(bad|n)\s+int\s*:=\s*[1-9]/);
  });
});
