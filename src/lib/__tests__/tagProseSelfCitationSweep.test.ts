import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791628948_tag_prose_self_citation_sweep';
const raw = readFileSync(
  join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`),
  'utf8',
);

// The header quotes EVERY defect this file removes AND the two broken shapes it replaced --
// the `update ... from _sc_pairs` statement, the tag_has_prose postcondition, "According to
// Wikipedia, self-acceptance is the acceptance of oneself." So an unstripped `toContain`
// passes with the executable statement deleted, and an unstripped negative assertion FAILS on
// correct code. Strip comments at LINE START only: a mid-line `--` here sits inside a string.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verify = sql.slice(sql.indexOf('do $verify$'));
const body = sql.slice(0, sql.indexOf('do $verify$'));
const pairsDdl = body.slice(
  body.indexOf('create temporary table _sc_pairs'),
  body.indexOf('do $pre$'),
);
const applyBlock = body.slice(body.indexOf('do $apply$'));

describe(`${MIGRATION} — one shared pattern`, () => {
  it('declares the self-citation pattern exactly once, as a table', () => {
    expect(sql).toContain('create temporary table _sc_rx (p text)');
    // The regex literal must appear ONCE. Two copies is the defect the dry run exposed twice:
    // a postcondition narrower than the work list cannot report the work list being incomplete.
    const occurrences = sql.match(/A scientific article published \(\?:on\|in\)/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('P1 and P5 both read v_rx rather than an inline regex of their own', () => {
    expect(verify).toContain('select p into v_rx from _sc_rx');
    expect(verify).toMatch(/t\.long_description !~ v_rx/);
    expect(verify).toMatch(/long_description ~ v_rx/);
    // No postcondition may carry its own copy of the pattern.
    expect(verify).not.toContain('According to Wikidata');
  });
});

describe(`${MIGRATION} — the apply step`, () => {
  it('is a loop, never UPDATE ... FROM _sc_pairs', () => {
    // `UPDATE ... FROM` joins each TARGET row at most once and silently discards the rest, so
    // the three rows carrying two offending sentences would keep one. P1 read "72 of 75".
    expect(applyBlock).toContain('for r in select slug, ord, find, repl from _sc_pairs');
    expect(body).not.toMatch(/update\s+public\.unified_tags\s+t\s*\n?\s*set[\s\S]{0,200}from\s+_sc_pairs/);
  });

  it('writes only through replace(), so no prose can be authored', () => {
    const writes = applyBlock.match(/set long_description = [^\n]*/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('replace(long_description, r.find, r.repl)');
  });

  it('touches long_description and nothing else', () => {
    // description / short_description are the evidence this pass relies on; writing either
    // would make the repair unreviewable, and short_description feeds three preview surfaces.
    expect(body).not.toMatch(/set\s+(short_)?description\s*=/);
    expect(verify).not.toMatch(/set\s+(short_)?description\s*=/);
  });
});

describe(`${MIGRATION} — the content guard is keyed on the DEFECT`, () => {
  // The loop's own `position(r.find in long_description) > 0` is CIRCULAR: find is derived
  // from the live body so it always matches. Re-run against an already-clean corpus it cut 33
  // characters off a correct sentence and destroyed five of six frozen safety claims. The real
  // guard is _sc_pairs' WHERE clause.
  it('only builds a pair when the sentence still carries the defect', () => {
    expect(pairsDdl).toContain('where case d.action');
    expect(pairsDdl).toContain("when 'strip_prefix' then left(s.frag, length(d.cut)) = d.cut");
    expect(pairsDdl).toContain("when 'strip_suffix' then position(d.cut in s.frag) > 0");
    expect(pairsDdl).toMatch(/when 'delete'\s+then s\.frag ~ \(select p from _sc_rx\)/);
  });

  it('has an arm for every action, so none can fall through unguarded', () => {
    const guardClause = pairsDdl.slice(pairsDdl.indexOf('where case d.action'));
    for (const action of ['strip_prefix', 'strip_suffix', 'delete']) {
      expect(guardClause, `no guard arm for ${action}`).toContain(`'${action}'`);
    }
  });
});

describe(`${MIGRATION} — the reviewed set`, () => {
  const rows = (body.match(/^ \('[a-z0-9-]+',\d+,'(delete|strip_prefix|strip_suffix)'/gm) ?? []).length
    + (body.match(/\('[a-z0-9-]+',\d+,'(delete|strip_prefix|strip_suffix)'/g) ?? []).length;

  it('carries 90 decisions split 42 / 47 / 1', () => {
    const decide = body.slice(
      body.indexOf('insert into _sc_decide'),
      body.indexOf('create temporary table _sc_before'),
    );
    expect((decide.match(/,'delete',/g) ?? [])).toHaveLength(42);
    expect((decide.match(/,'strip_prefix',/g) ?? [])).toHaveLength(47);
    expect((decide.match(/,'strip_suffix',/g) ?? [])).toHaveLength(1);
    expect(rows).toBeGreaterThan(0);
  });

  it('freezes the set and pins it with a checksum, in both places', () => {
    // The checksum appears TWICE -- in the comparison and in the notice that reports what was
    // expected. A bare toContain() passes when a single-occurrence edit corrupts one of them
    // (a mutation survivor on the first round), and a disagreement between the two makes the
    // notice lie about what the file was reviewed against. Assert the count.
    const hits = body.match(/2142d61a47548e69e918729542582b38/g) ?? [];
    expect(hits).toHaveLength(2);
  });
});

describe(`${MIGRATION} — soft preconditions`, () => {
  it('reports the checksum as a notice and never aborts on it', () => {
    const pre = sql.slice(sql.indexOf('do $pre$'), sql.indexOf('do $apply$'));
    expect(pre).toContain('raise notice');
    // An exact-match precondition aborts db push for the WHOLE repo when a concurrent session
    // legitimately edits one of these bodies.
    expect(pre).not.toContain('raise exception');
  });
});

describe(`${MIGRATION} — postconditions`, () => {
  it('has seven checks and every one RAISES', () => {
    // Assert the branch RAISES, not merely that its condition text is present: replacing each
    // `raise exception` with `null;` leaves every string-anchored check green while the
    // postcondition has stopped failing.
    for (const p of ['P1', 'P2', 'P2b', 'P3', 'P4', 'P5', 'P6']) {
      expect(
        verify.indexOf(`raise exception '${p} failed`),
        `${p} does not raise`,
      ).toBeGreaterThan(0);
    }
    expect(verify.match(/raise exception '/g) ?? []).toHaveLength(7);
  });

  it('P1 asserts the REACHED state positively, not a count of bad rows', () => {
    expect(verify).toMatch(/if v_bad <> 87 then/);
    // No loosened comparison anywhere, and no pre-seeded counter.
    expect(verify).not.toMatch(/v_bad\s*<\s*0|v_bad\s*>=\s*0/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/where false|if \(?false\)?/);
  });

  it('P2 is scoped to the pairs that exist, so the file is idempotent', () => {
    // Expecting a frozen 48 fails against an already-clean corpus -- which is the state the
    // merge will meet, because this sweep was committed to prod ahead of it.
    const p2 = verify.slice(verify.indexOf('select count(*) into v_bad'), verify.indexOf('P2b'));
    expect(p2).toContain("from _sc_pairs p");
    expect(p2).not.toMatch(/if v_bad <> 48/);
    expect(verify).toContain("(select count(*) from _sc_pairs where action in ('strip_prefix', 'strip_suffix'))");
  });

  it('P2b asserts six frozen safety claims unconditionally', () => {
    // P2 goes vacuous when _sc_pairs is empty, so without P2b the "nothing was over-swept"
    // guarantee would rest on a check that had stopped checking.
    for (const claim of [
      'Autoerotic asphyxiation can lead to serious injury or death.',
      'Donovanosis is a treatable condition with antibiotics.',
      'The crisis began in 1981',
      'Consistent and correct use of condoms can significantly reduce the risk of STI transmission.',
      'The death penalty for homosexuality is currently enforced in a few countries.',
      'Condoms are an effective method of protection when used correctly.',
    ]) {
      expect(verify, `frozen claim missing: ${claim}`).toContain(claim);
    }
    expect(verify).toMatch(/if v_bad <> 6 then/);
  });

  it('P4 does NOT assert tag_has_prose', () => {
    // `campos` is active with description IS NULL and fails that gate already; this file
    // touches only long_description and cannot move it. Asserting it aborts db push on
    // correct code. (The live function reads description ONLY -- CLAUDE.md's OR is stale.)
    expect(verify).not.toContain('tag_has_prose');
  });

  it('P6 enforces the advice-register refusal', () => {
    expect(verify).toContain('it is essential to');
    expect(verify).toMatch(/if v_rows < 100 then/);
    expect(verify).toMatch(/P6 failed[\s\S]{0,120}refused that sweep deliberately/);
  });
});

describe(`${MIGRATION} — scope and attribution`, () => {
  it('scopes every corpus-wide claim to active rows', () => {
    // The 17 non-active rows are deliberately out of scope; gating on them would ship red.
    const p5 = verify.slice(verify.indexOf('P5 failed') - 400, verify.indexOf('P5 failed'));
    expect(p5).toContain("status = 'active'");
  });

  it('declares an actor, and says it is attribution only', () => {
    expect(body).toContain(`set_config('app.actor', 'migration:${MIGRATION}'`);
    // 0 of 87 rows are human_reviewed, so log_unified_tag_change() will not RAISE here. The
    // header must say so, because the round-three tranche was the opposite case.
    expect(raw).toMatch(/ATTRIBUTION ONLY/);
  });

  it('carries the version string everywhere it is bound', () => {
    expect(raw).toContain(MIGRATION);
    expect(body).toContain(`migration:${MIGRATION}`);
  });
});
