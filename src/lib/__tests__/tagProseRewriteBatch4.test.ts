import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99900101110300 — the measured rewrite, batch 4 (15 rows, HIGH USAGE).
 *
 * 1. `queer` IS NEVER TOUCHED. At 13,053 assignments it is the most-used tag in
 *    the corpus and its description is already the standard this work aims at —
 *    the 1890s slur, the 1980s reclamation, Queer Nation, and the honest closing
 *    that some people still hear the slur. A later batch reaching for it is the
 *    single worst thing that could happen to this series.
 *
 * 2. THE THREE MINIMAL EDITS STAY MINIMAL. `drag`, `kreuzberg` and `kink` each
 *    lose exactly one banned word and keep every other word. "The banned word is
 *    gone" is equally satisfied by a pass that replaced the whole description.
 *
 * 3. `gruppen` IS EVIDENCE-LED. Its sense was recovered from what the tag is
 *    ATTACHED TO — 532 Berlin community events — not from the row, which
 *    published a Stockhausen orchestral work. The German is kept and glossed per
 *    `local-scene-vocabulary`, not translated away.
 *
 * 4. VOICE CONFORMANCE with the plural-aware regex, including `counselling`,
 *    which one proposal carried before it was corrected.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99900101110300_tag_description_measured_rewrite_batch4.sql',
);
const sql = readFileSync(MIG, 'utf8');
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

const writtenTexts = [...statements.matchAll(/set description =\s*\n?\s*'((?:[^']|'')*)'/g)].map(
  (m) => m[1].replace(/''/g, "'"),
);

describe('measured rewrite batch 4 — high usage', () => {
  it('changes exactly 15 rows, each slug-scoped and content-guarded', () => {
    expect([...statements.matchAll(/^update unified_tags set description/gm)].length).toBe(15);
    for (const st of [...statements.matchAll(/update unified_tags set description[\s\S]*?;/g)].map(
      (m) => m[0],
    )) {
      expect(/where slug = '/.test(st), `not slug-scoped: ${st.slice(0, 70)}`).toBe(true);
      expect(/and description like/.test(st), `unguarded: ${st.slice(0, 70)}`).toBe(true);
    }
  });

  it('declares an actor — several target rows are human_reviewed', () => {
    expect(statements).toMatch(
      /set_config\('app\.actor',\s*'admin:tag-description-measured-rewrite-b4',\s*true\)/,
    );
  });

  it('NEVER touches `queer`, the most-used tag in the corpus', () => {
    expect(statements).not.toMatch(/slug = 'queer'/);
    expect(verify).toMatch(/Queer Nation formed in March 1990/);
    expect(verify).toMatch(/Some people still hear it as the slur it was/);
  });

  it('keeps the three minimal edits MINIMAL — replace(), not a literal', () => {
    for (const slug of ['drag', 'kreuzberg', 'kink']) {
      const i = statements.indexOf(`slug = '${slug}'`);
      const stmt = statements.slice(Math.max(0, i - 260), i);
      expect(stmt, `${slug} is not a replace()`).toMatch(/set description = replace\(description,/);
    }
    // and the surviving sentence is asserted, not just the banned word's absence
    expect(verify).toMatch(/comedy, music, and dance/);
    expect(verify).toMatch(/since German reunification in 1990/);
    expect(verify).toMatch(/Your Kink is Not My Kink/);
  });

  it('asserts the banned forms are gone from those three rows', () => {
    expect(verify).toMatch(/\\mvibrant\\M/);
    expect(verify).toMatch(/description like '%VALID%'/);
  });

  it('keeps hiv and acceptance, whose prose is already better than a rewrite', () => {
    for (const slug of ['hiv', 'acceptance']) {
      expect(statements).not.toMatch(new RegExp(`slug = '${slug}'`));
      expect(verify).toContain(`'${slug}'`);
    }
    expect(verify).toMatch(/cannot be transmitted sexually/);
    expect(verify).toMatch(/distinct from mere tolerance/);
  });

  it('gruppen keeps the German and glosses it — `local-scene-vocabulary`', () => {
    const g = writtenTexts.find((t) => t.startsWith('German for groups'));
    expect(g, 'gruppen replacement missing').toBeDefined();
    expect(sql).toMatch(/THE ASSIGNMENTS ARE THE\s*\n--\s*EVIDENCE/);
    expect(sql).toMatch(/do not translate/);
  });

  describe('Tone of Voice conformance', () => {
    it('extracts the authored replacements it asserts on', () => {
      // 15 writes, 3 of which are replace() calls rather than literals
      expect(writtenTexts.length).toBe(12);
    });

    it('American spelling incl. counselling, nonbinary unhyphenated, no 2nd person, no hype', () => {
      for (const t of writtenTexts) {
        expect(
          /\b(organisation|characterised|recognised|behaviour|colour|centre|defence|licence|counselling)s?\b/i.test(
            t,
          ),
          `British spelling: ${t.slice(0, 60)}`,
        ).toBe(false);
        expect(/\bnon-binary\b/i.test(t), `hyphenated: ${t.slice(0, 60)}`).toBe(false);
        expect(/\b(you|your)\b/i.test(t), `second person: ${t.slice(0, 60)}`).toBe(false);
        expect(/!/.test(t), `exclamation: ${t.slice(0, 60)}`).toBe(false);
      }
    });

    it('no marketing vocabulary, and length-discipline holds', () => {
      const banned =
        /\b(discover|explore|unlock|curated|journey|tailored|amazing|vibrant|hidden gem|iconic|bustling)\b/i;
      for (const t of writtenTexts) {
        expect(banned.test(t), `marketing: ${t.slice(0, 60)}`).toBe(false);
        const n = t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0).length;
        expect(n, `too many sentences: ${t.slice(0, 60)}`).toBeLessThanOrEqual(2);
      }
    });

    it('the SQL postcondition matches British PLURALS too', () => {
      expect(verify).toMatch(/\|counselling\)s\?\\M/);
      expect(verify).not.toMatch(/\|counselling\)\\M/);
    });
  });

  it('counts the reached state positively and short-circuits nothing', () => {
    expect(verify).toMatch(/if v_bad <> 15 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s*:=\s*\d/);
    expect([...verify.matchAll(/if v_bad <> \d+ then/g)].length).toBe(6);
  });
});
