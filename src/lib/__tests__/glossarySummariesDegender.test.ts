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

  const statements = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s));
  const setOf = (s: string) => {
    const i = s.search(/\bwhere\b/i);
    return i === -1 ? s : s.slice(0, i);
  };
  // The de-gendering statements, as opposed to the two namesake repairs.
  const degender = statements.filter((s) => /~\*\s*'\\m\(male\|female/.test(s));
  const namesake = statements.filter((s) => /Sarmi Regency|genus of insects/.test(s));

  it('writes description ONLY on the one row where it is itself the defect', () => {
    // On the de-gendered rows the description is the evidence each replacement
    // restates, so it must not be touched. `anus` is the deliberate exception:
    // its description was zoology, which is a defect rather than evidence.
    expect(degender.length).toBeGreaterThanOrEqual(2);
    for (const s of degender) {
      expect(setOf(s), `de-gendering statement wrote description:\n${s.slice(0, 140)}`).not.toMatch(
        /(^|[\s,])description\s*=/,
      );
    }
    const anus = namesake.find((s) => /Sarmi Regency/.test(s)) ?? '';
    expect(anus).toMatch(/description\s*=\s*'The opening at the end of the digestive tract/);
  });

  it('content-guards every statement on the exact defect it removes', () => {
    expect(statements.length).toBe(degender.length + namesake.length);
    for (const s of degender) {
      expect(s, `unguarded:\n${s.slice(0, 140)}`).toMatch(/~\*\s*'\\m\(male\|female/);
    }
    for (const s of namesake) {
      expect(s, `unguarded:\n${s.slice(0, 140)}`).toMatch(
        /ilike '%(village located in Sarmi Regency|genus of insects)%'/,
      );
    }
  });

  it('trims one sentence from labia rather than replacing its body', () => {
    const labia = namesake.find((s) => /genus of insects/.test(s)) ?? '';
    expect(labia).toMatch(/replace\(\s*\n?\s*long_description,/);
    expect(labia).toMatch(/,\s*''\)\)/);
    expect(labia).not.toMatch(/long_description\s*=\s*'[A-Z]/);
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
