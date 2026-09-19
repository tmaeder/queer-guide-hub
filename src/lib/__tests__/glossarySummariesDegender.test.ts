import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the third pass over the same rows: the summaries and bodies #3810 left
 * gendered under a de-gendered description.
 */

const MIGRATION = '99991789833238_glossary_summaries_degender.sql';
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

describe('summaries and bodies #3810 left gendered', () => {
  it('rewrites the five summaries and nulls the eleven bodies', () => {
    expect(writes).toMatch(/set short_description = v\.s/);
    expect(writes).toMatch(/set long_description = null/);
    for (const slug of ['clitoris', 'fallopian-tubes', 'seminal-vesicles', 'sperm', 'testicle']) {
      expect(writes).toContain(`('${slug}',`);
    }
    expect(writes).toContain("'erectile-dysfunction'");
  });

  it('never writes description — it is the evidence each replacement restates', () => {
    const setClauses = writes
      .split(/\n(?=update\s)/i)
      .filter((s) => /^update/i.test(s))
      .map((s) => {
        const i = s.search(/\bwhere\b/i);
        return i === -1 ? s : s.slice(0, i);
      });
    expect(setClauses.length).toBeGreaterThanOrEqual(2);
    for (const c of setClauses) {
      expect(c).not.toMatch(/(^|[\s,])description\s*=/);
    }
  });

  it('content-guards both statements on the gendered text they remove', () => {
    const stmts = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s));
    for (const s of stmts) {
      expect(s, `unguarded:\n${s.slice(0, 140)}`).toMatch(/~\*\s*'\\m\(male\|female/);
    }
  });

  it('nulls bodies rather than minting replacements', () => {
    const bodyStmt = writes.split(/\n(?=update\s)/i).find((s) => /long_description/.test(s)) ?? '';
    expect(bodyStmt).toMatch(/long_description = null/);
    expect(bodyStmt).not.toMatch(/long_description = '/);
  });

  it('declares an actor', () => {
    expect(writes).toContain("set_config('app.actor'");
    expect(writes).toContain('migration:99991789833238');
  });
});

describe('postconditions', () => {
  it('check ALL THREE prose fields, which is the check whose absence caused this', () => {
    expect(verify).toMatch(/short_description,''\)\s*~\*/);
    expect(verify).toMatch(/long_description,''\)\s*~\*/);
    expect(verify).toMatch(/description,''\)\s*~\*/);
    expect(verify).toMatch(/three fields/i);
  });

  it('assert every row still publishes after its body is nulled', () => {
    expect(verify).toMatch(/not tag_has_prose\(description, short_description\)/);
    expect(verify).toMatch(/unpublishable/i);
  });

  it('assert the controls where the word does real work SURVIVE', () => {
    expect(verify).toContain('neither exclusively male nor female');
    expect(verify).toContain("women''s rights");
    expect(verify).toContain('Trans women, non-binary people and intersex people');
  });

  it('are not loosened or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/if\s+v_(bad|n)\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).toMatch(/if v_n <> 5 then/);
  });
});
