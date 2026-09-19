import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guards the last two bodies of the sex-glossary pass. */

const FILE = join(
  __dirname,
  '../../../supabase/migrations',
  '99991789836833_glossary_penis_egg_bodies.sql',
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

describe('penis and egg bodies', () => {
  const statements = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s));

  it('nulls the penis and egg bodies rather than rewriting them', () => {
    expect(writes).toMatch(/slug = 'penis' and long_description ilike '%male reproductive organ%'/);
    expect(writes).toMatch(/slug = 'egg' and long_description ilike '%female reproductive cell%'/);
    // Scoped to those two: sexual-arousal below deliberately REWRITES, because
    // its physiology is worth keeping. Iterating every long_description
    // statement would fail on correct code.
    const nulled = statements.filter(
      (s) => /slug = '(penis|egg)'/.test(s) && /long_description/.test(s),
    );
    expect(nulled.length).toBe(2);
    for (const s of nulled) {
      expect(s).toMatch(/long_description = null/);
    }
  });

  it('de-binarises sexual-arousal with an exact-phrase replace, keeping the physiology', () => {
    const sa = statements.find((s) => /slug = 'sexual-arousal'/.test(s)) ?? '';
    expect(sa).toMatch(/replace\(/);
    expect(sa).toContain('In males, arousal leads to erection');
    expect(sa).toContain('people with a penis');
    // never a wholesale body replacement
    expect(sa).not.toMatch(/long_description = '[A-Z]/);
    expect(sa).not.toMatch(/long_description = null/);
  });

  it('never touches the penis description — it is the sentence being defended', () => {
    const stmts = writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s));
    const penis = stmts.filter((s) => /slug = 'penis'/.test(s));
    expect(penis.length).toBe(1);
    expect(penis[0]).not.toMatch(/description\s*=\s*'/);
  });

  it('content-guards every statement on the exact text it removes', () => {
    for (const s of writes.split(/\n(?=update\s)/i).filter((s) => /^update/i.test(s))) {
      expect(s, `unguarded:\n${s.slice(0, 140)}`).toMatch(/ilike '%/);
    }
  });

  it('declares an actor', () => {
    expect(writes).toContain('migration:99991789836833');
  });
});

describe('postconditions', () => {
  it('assert penis keeps the inclusive sentence it was contradicting', () => {
    expect(verify).toContain('Trans women, non-binary people and intersex people');
    expect(verify).toMatch(/lost the inclusive sentence/i);
  });

  it('re-measure the whole pass across rendered fields AFTER the write', () => {
    // #3838's sweep selected before the corpus moved under it and missed penis.
    expect(verify).toMatch(/short_description,''\)\s*~\*/);
    expect(verify).toMatch(/long_description,''\)\s*~\*/);
    for (const slug of ['erectile-dysfunction', 'penis', 'egg', 'anus', 'labia']) {
      expect(verify).toContain(`'${slug}'`);
    }
  });

  it('assert female-ejaculation SURVIVES — the word is in the term itself', () => {
    expect(verify).toContain("slug = 'female-ejaculation'");
    expect(verify).toMatch(/!~\*\s*'female'/);
  });

  it('assert both rows still publish after their bodies are nulled', () => {
    expect(verify).toMatch(/tag_has_prose\(description, short_description\)/);
  });

  it('are not loosened or short-circuited', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/);
    expect(verify).not.toMatch(/if\s+v_(bad|n)\s*<\s*0\s+then/);
    expect(verify).not.toMatch(/where\s+false\s+and/);
    expect(verify).toMatch(/if v_n <> 2 then/);
  });
});
