import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99920101100200 — the measured rewrite, batch 3 (7 rows of 28 read).
 *
 * WHAT THIS PRESERVES:
 *
 * 1. THE DEFINES-ANOTHER-LIVE-TAG FIX IS ASSERTED IN BOTH DIRECTIONS.
 *    `misgendering` published the definition of TRANSPHOBIA, which is a separate
 *    active row with 356 assignments. Asserting only that misgendering changed
 *    is satisfied by a pass that broke transphobia instead, so both are checked.
 *
 * 2. THREE MORE TRUNCATIONS STAY OPEN. mysophilia, patient and
 *    horny-net-geek-hng each sit at exactly 500 chars ending mid-word. Closing
 *    one with a full stop is the most dangerous edit available.
 *
 * 3. FOUR FLAGGED ROWS STAY UNTOUCHED. Each was read and refused for a reason
 *    written into the migration — most importantly `schoneberg`, where the
 *    obvious replacement ("Berlin's historic gay quarter") is supported by
 *    NOTHING ON THE ROW. Well-known is not the same as evidenced, and that
 *    distinction is exactly what produced batch 1's single fabrication.
 *
 * 4. VOICE CONFORMANCE, with the plural-aware regex. `\borganisation\b` does
 *    not match "organisations"; that gap shipped once and is pinned here.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99920101100200_tag_description_measured_rewrite_batch3.sql',
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

describe('measured rewrite batch 3', () => {
  it('changes exactly 7 rows, each slug-scoped and content-guarded', () => {
    expect([...statements.matchAll(/^update unified_tags set description/gm)].length).toBe(7);
    for (const st of [...statements.matchAll(/update unified_tags set description[\s\S]*?;/g)].map(
      (m) => m[0],
    )) {
      expect(/where slug = '/.test(st), `not slug-scoped: ${st.slice(0, 70)}`).toBe(true);
      expect(/and description like/.test(st), `unguarded: ${st.slice(0, 70)}`).toBe(true);
    }
  });

  it('declares an actor', () => {
    expect(statements).toMatch(
      /set_config\('app\.actor',\s*'admin:tag-description-measured-rewrite-b3',\s*true\)/,
    );
  });

  it('asserts the misgendering/transphobia split in BOTH directions', () => {
    expect(verify).toMatch(/slug='misgendering' and description not like 'Transphobia consists%'/);
    expect(verify).toMatch(
      /slug='transphobia' and description like 'Prejudice, discrimination, or fear directed towards transgender%'/,
    );
    // transphobia itself is never written
    expect(statements).not.toMatch(/slug = 'transphobia'/);
  });

  it('KEEPS all three truncations open', () => {
    for (const slug of ['mysophilia', 'patient', 'horny-net-geek-hng']) {
      expect(verify).toContain(`'${slug}'`);
      expect(statements).not.toMatch(new RegExp(`slug = '${slug}'`));
    }
    expect(verify).toMatch(/length\(description\) = 500/);
    expect(verify).toMatch(/if v_bad <> 3 then/);
  });

  it('KEEPS the four flagged rows untouched, schoneberg most of all', () => {
    for (const slug of ['schoneberg', 'sprecher', 'drink', 'color-beige']) {
      expect(verify).toContain(`'${slug}'`);
      expect(statements).not.toMatch(new RegExp(`slug = '${slug}'`));
    }
    // and the reason is recorded, not merely the refusal
    expect(sql).toMatch(/NOTHING ON THE ROW SAYS THAT/);
  });

  describe('Tone of Voice conformance', () => {
    it('extracts the replacement strings it asserts on', () => {
      expect(writtenTexts.length).toBe(7);
    });

    it('American spelling, nonbinary unhyphenated, no second person, no hype', () => {
      for (const t of writtenTexts) {
        expect(
          /\b(organisation|characterised|recognised|behaviour|colour|centre|defence|licence)s?\b/i.test(
            t,
          ),
          `British spelling: ${t.slice(0, 60)}`,
        ).toBe(false);
        expect(/\bnon-binary\b/i.test(t), `hyphenated: ${t.slice(0, 60)}`).toBe(false);
        expect(/\b(you|your)\b/i.test(t), `second person: ${t.slice(0, 60)}`).toBe(false);
        expect(/!/.test(t), `exclamation: ${t.slice(0, 60)}`).toBe(false);
      }
    });

    it('carries no marketing vocabulary and obeys length-discipline', () => {
      const banned =
        /\b(discover|explore|unlock|curated|journey|tailored|amazing|vibrant|hidden gem|iconic|bustling)\b/i;
      for (const t of writtenTexts) {
        expect(banned.test(t), `marketing: ${t.slice(0, 60)}`).toBe(false);
        const n = t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0).length;
        expect(n, `too many sentences: ${t.slice(0, 60)}`).toBeLessThanOrEqual(2);
      }
    });

    it('the SQL postcondition matches British PLURALS too', () => {
      expect(verify).toMatch(/\|licence\)s\?\\M/);
      expect(verify).not.toMatch(/\|licence\)\\M/);
    });
  });

  it('cervix is de-gendered, not merely shortened', () => {
    const cervix = writtenTexts.find((t) => t.startsWith('The lower part of the uterus'));
    expect(cervix).toBeDefined();
    expect(
      /\b(woman|women|female)\b/i.test(cervix!),
      'cervix replacement re-genders the organ',
    ).toBe(false);
  });

  it('counts the reached state positively and short-circuits nothing', () => {
    expect(verify).toMatch(/if v_bad <> 7 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s*:=\s*\d/);
    expect([...verify.matchAll(/if v_bad <> \d+ then/g)].length).toBe(5);
  });
});
