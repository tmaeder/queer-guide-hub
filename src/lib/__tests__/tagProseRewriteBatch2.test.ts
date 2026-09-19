import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99930101100100 — the measured rewrite, batch 2 (10 rows of 28 read).
 *
 * WHAT THIS PRESERVES, each of which a later batch could undo:
 *
 * 1. VOICE CONFORMANCE IS NOW A CRITERION, not an afterthought. Batch 1 scored
 *    subject/sense/specificity/fabrication and omitted the published Tone of
 *    Voice, so four of eighteen shipped unpublishable (99930101100000). Every
 *    replacement here is checked for British spelling, hyphenated non-binary,
 *    second person, hype punctuation and sentence count.
 *
 * 2. THE THREE STANDING REFUSALS. Load-bearing safety prose, the advice-padding
 *    class (round thirteen), and — new here — a row whose intended sense cannot
 *    be established (social-security) are all left alone and asserted.
 *
 * 3. belly-play IS TRIMMED, NOT REWRITTEN. Its description ended with a dangling
 *    "Activities of interest include:" and nothing after. The clause is deleted
 *    and no prose is authored, because the promised list was never there.
 *
 * 4. THE NON-BREAKING-SPACE GUARD. cetrorelix carries ASCII 160 between "0.25"
 *    and "mg", so the obvious LIKE guard matched nothing while rendering
 *    identically. A silent no-op would fail the postcondition and abort db push
 *    on main. The guard must stay off that phrase.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99930101100100_tag_description_measured_rewrite_batch2.sql',
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

describe('measured rewrite batch 2', () => {
  it('changes exactly 10 rows, every one slug-scoped and content-guarded', () => {
    const updates = [...statements.matchAll(/^update unified_tags set description/gm)];
    expect(updates.length).toBe(10);
    const stmts = [...statements.matchAll(/update unified_tags set description[\s\S]*?;/g)].map(
      (m) => m[0],
    );
    for (const st of stmts) {
      expect(/where slug = '/.test(st), `not slug-scoped: ${st.slice(0, 70)}`).toBe(true);
      expect(/and description like/.test(st), `unguarded: ${st.slice(0, 70)}`).toBe(true);
    }
  });

  it('declares an actor', () => {
    expect(statements).toMatch(
      /set_config\('app\.actor',\s*'admin:tag-description-measured-rewrite-b2',\s*true\)/,
    );
  });

  describe('conformance to the published Tone of Voice', () => {
    it('extracts the replacement strings it asserts on', () => {
      // positive control: an empty set satisfies every check below
      expect(writtenTexts.length).toBeGreaterThanOrEqual(9);
    });

    it('uses American spelling — `spelling-and-units`', () => {
      for (const t of writtenTexts) {
        expect(
          /\b(organisation|characterised|recognised|behaviour|colour|centre|defence|licence|luteinising)s?\b/i.test(
            t,
          ),
          `British spelling: ${t.slice(0, 60)}`,
        ).toBe(false);
      }
    });

    it('writes nonbinary unhyphenated, no second person, no hype punctuation', () => {
      for (const t of writtenTexts) {
        expect(/\bnon-binary\b/i.test(t), `hyphenated: ${t.slice(0, 60)}`).toBe(false);
        expect(/\b(you|your)\b/i.test(t), `second person: ${t.slice(0, 60)}`).toBe(false);
        expect(/!/.test(t), `exclamation: ${t.slice(0, 60)}`).toBe(false);
      }
    });

    it('carries no marketing vocabulary — `no-marketing-vocabulary` (never)', () => {
      const banned =
        /\b(discover|explore|unlock|curated|journey|tailored|amazing|vibrant|hidden gem|iconic|bustling)\b/i;
      for (const t of writtenTexts) {
        expect(banned.test(t), `marketing vocabulary: ${t.slice(0, 60)}`).toBe(false);
      }
    });

    it('obeys `length-discipline` — one to two sentences', () => {
      for (const t of writtenTexts) {
        const n = t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0).length;
        expect(n, `too many sentences: ${t.slice(0, 60)}`).toBeLessThanOrEqual(2);
      }
    });

    it('asserts no voice violation reaches the database', () => {
      expect(verify).toMatch(/carry a Tone of Voice violation/);
      expect(verify).toMatch(/\\mnon-binary\\M/);
    });

    it('the SQL postcondition matches British PLURALS too — the `s?` is load-bearing', () => {
      // \m...\M anchors both ends, so `\morganisation\M` does NOT match
      // "organisations". Mutation testing caught a plural slipping through both
      // this check and its guard; asserting the TS regex alone leaves the SQL
      // side free to regress.
      expect(verify).toMatch(/\|licence\)s\?\\M/);
      expect(verify).not.toMatch(/\|licence\)\\M/);
    });
  });

  it('KEEPS the safety-content refusal, extended with anal-sex', () => {
    for (const slug of ['anal-sex', 'poppers', 'chemsex', 'soft-limits']) {
      expect(verify).toContain(`'${slug}'`);
      expect(statements).not.toMatch(new RegExp(`slug = '${slug}'`));
    }
    expect(verify).toMatch(/highest per-act HIV risk/);
  });

  it('KEEPS the advice-padding refusal (round thirteen)', () => {
    for (const slug of ['hiv-aids-awareness', 'safe-sane-and-consensual-ssc']) {
      expect(verify).toContain(`'${slug}'`);
      expect(statements).not.toMatch(new RegExp(`slug = '${slug}'`));
    }
  });

  it('does not touch social-security, whose intended sense is unestablished', () => {
    expect(statements).not.toMatch(/slug = 'social-security'/);
    expect(sql).toMatch(/filing decision for a human/);
  });

  it('TRIMS belly-play rather than rewriting it', () => {
    const stmt = statements.slice(statements.indexOf("slug = 'belly-play'") - 400);
    expect(stmt).toMatch(/replace\(description, 'Activities of interest include:', ''\)/);
    // and the mirror assertion keeps the three surviving sentences
    expect(verify).toMatch(/Belly play usually refers to pleasurable play%/);
    expect(verify).toMatch(/"Belly sluts" are typically found/);
  });

  it('keeps the cetrorelix guard OFF the non-breaking-space phrase', () => {
    expect(statements).toMatch(
      /slug = 'cetrorelix'[\s\S]{0,400}description like '%synthetic decapeptide%'/,
    );
    expect(statements).not.toMatch(/multiple 0\.25 mg daily/);
    expect(sql).toMatch(/NON-BREAKING SPACE \(ASCII/);
  });

  it('counts the reached state positively and short-circuits nothing', () => {
    expect(verify).toMatch(/if v_bad <> 10 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s*:=\s*\d/);
    expect([...verify.matchAll(/if v_bad <> \d+ then/g)].length).toBe(5);
  });
});
