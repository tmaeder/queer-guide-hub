import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `compose_safety_note` read "death" as a BOOLEAN for a year after
 * 20260904203201 established it is three states.
 *
 * That migration created `death_penalty_risk()` and repointed
 * `location_is_high_risk()`, and its own header predicted the rest:
 *
 *     compose_safety_note for Kabul today -> 'high',  "...(penalty: Death Penalty (possible))"
 *     with this fix                       -> 'critical', "...can carry the death penalty"
 *     8 published city notes sit in these five countries (AE 4, AF 2, PK 2)
 *
 * It never touched the composer. Measured on prod a year later, all 8 were
 * still wrong, and the split against the other cohort is what proves the
 * boolean was the mechanism: the 7 `confirmed` countries buried 0 of their 6
 * notes (there `='Yes'` is true and the good branch fires) while the 5
 * `possible` countries buried 8 of 8.
 *
 * These assertions run against COMMENT-STRIPPED SQL. The migration's header
 * quotes every phrase they look for, so without stripping the whole file would
 * pass on its own prose with the branches deleted — the trap CLAUDE.md records
 * from the venue-dedup and queerness passes.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/** Strip `--` line comments and block comments, so prose cannot satisfy a guard. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const raw = latestDefinitionOf('compose_safety_note');
const sql = stripComments(raw);

/**
 * The composer's own body, not the whole migration. The repair block below it
 * legitimately quotes ILGA's "no legal certainty" in a review-queue rationale,
 * which is content — the thing worth banning is the composer RE-DERIVING the
 * rule from those strings.
 */
const body = (() => {
  const start = sql.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.compose_safety_note/i);
  if (start < 0) throw new Error('compose_safety_note body not found');
  const end = sql.indexOf('$$;', start);
  if (end < 0) throw new Error('compose_safety_note body is unterminated');
  return sql.slice(start, end);
})();

describe('compose_safety_note — death penalty is three states', () => {
  it('derives the verdict from death_penalty_risk() rather than the raw boolean', () => {
    // The whole point: one implementation of the rule, and the composer asks it.
    expect(sql).toMatch(/v_dp_risk\s*:=[\s\S]{0,200}public\.death_penalty_risk\s*\(/);
  });

  it('treats any non-none verdict as a death-penalty destination', () => {
    expect(sql).toMatch(/v_death\s*:=\s*\(\s*v_dp_risk\s*<>\s*'none'\s*\)/);
  });

  it('never re-implements the branch order locally', () => {
    // The affirmative death_penalty test must precede the penalty fallback or
    // Nigeria breaks. That ordering lives in death_penalty_risk() and must not
    // be copied here, so the composer must not test the ILGA strings itself.
    expect(body).not.toMatch(/no legal certainty/i);
  });

  it('routes `possible` to critical alongside `confirmed`', () => {
    const tier = sql.match(/v_tier\s*:=\s*CASE([\s\S]*?)END/i)?.[1] ?? '';
    expect(tier).toMatch(/WHEN\s+v_death\s+THEN\s+'critical'/i);
    // `high` must remain reachable for ordinary criminalizing countries.
    expect(tier).toMatch(/WHEN\s+v_crim\s+THEN\s+'high'/i);
  });

  it('states the confirmed case as a fact and the possible case as a possibility', () => {
    expect(sql).toMatch(/v_dp_risk\s*=\s*'confirmed'/);
    expect(sql).toMatch(/v_dp_risk\s*=\s*'possible'/);
    expect(sql).toContain('can carry the death penalty');
    expect(sql).toContain('death penalty cannot be ruled out');
  });

  it('keeps the two wordings distinct, branch by branch', () => {
    // CLAUDE.md requires confirmed and possible stay distinguishable: a surface
    // stating a fact uses `confirmed`, "should this reader be warned" uses
    // `<> 'none'`. Collapsing them would overstate five countries.
    //
    // Checked per BRANCH, not per file — both strings existing somewhere is
    // satisfied even after one branch has been rewritten to the other's wording.
    const confirmedBranch =
      body.match(/IF\s+v_dp_risk\s*=\s*'confirmed'\s+THEN([\s\S]*?)ELSIF/i)?.[1] ?? '';
    const possibleBranch =
      body.match(/ELSIF\s+v_dp_risk\s*=\s*'possible'\s+THEN([\s\S]*?)ELSE/i)?.[1] ?? '';

    expect(confirmedBranch).toContain('can carry the death penalty');
    expect(confirmedBranch).not.toContain('cannot be ruled out');

    expect(possibleBranch).toContain('cannot be ruled out');
    expect(possibleBranch).not.toContain('can carry the death penalty');
    // and it must never fall back to the buried parenthetical
    expect(possibleBranch).not.toContain('(penalty: ');
  });

  it('never buries a death penalty in the parenthetical branch', () => {
    // The '(penalty: ...)' form must remain reachable ONLY from the else-branch,
    // i.e. after both death-penalty verdicts have been handled.
    const legalBlock =
      sql.match(
        /IF\s+v_crim\s+OR\s+v_death\s+THEN([\s\S]*?)ELSE\s*\n\s*v_legal\s*:=\s*format\('Same-sex relationships are legal/i,
      )?.[1] ?? '';
    expect(legalBlock).toMatch(/v_dp_risk\s*=\s*'confirmed'/);
    expect(legalBlock).toMatch(/v_dp_risk\s*=\s*'possible'/);
    const penaltyIdx = legalBlock.indexOf('(penalty: ');
    const possibleIdx = legalBlock.indexOf("v_dp_risk = 'possible'");
    expect(penaltyIdx).toBeGreaterThan(-1);
    // the parenthetical must come AFTER the possible branch, never before it
    expect(penaltyIdx).toBeGreaterThan(possibleIdx);
  });

  it('keeps the outing-safety invariant: a death-penalty destination never auto-publishes', () => {
    expect(sql).toMatch(/IF\s+v_crim\s+OR\s+v_death\s+THEN\s+v_auto\s*:=\s*false/i);
  });

  it('names the death penalty on the hotel surface too', () => {
    const hotel = sql.match(/IF\s+v_surface\s*=\s*'hotel'\s+THEN([\s\S]*?)END IF;/i)?.[1] ?? '';
    expect(hotel).toContain('death penalty cannot be ruled out');
    expect(hotel).toContain('can carry the death penalty');
  });
});

describe('the repair migration', () => {
  const repair = stripComments(
    readFileSync(
      join(MIGRATIONS, '20470922084500_safety_note_death_penalty_three_states.sql'),
      'utf8',
    ),
  );

  it('asserts the reconstruction is equivalent rather than assuming it', () => {
    // The no-caller-changes design rests on reconstructing {death_penalty,
    // penalty} agreeing with the real jsonb on every country.
    expect(repair).toMatch(/reconstruction disagrees/i);
    expect(repair).toMatch(/FROM\s+public\.countries/i);
  });

  it('only overwrites text the machine itself wrote', () => {
    // Guarded on the composer's own parenthetical signature. A human who wrote
    // real prose about this city keeps it.
    //
    // Scoped to the SELECT that drives the repair loop: the identical predicate
    // also appears in the postcondition, so an unscoped match stays green when
    // the guard on the loop is deleted and only the assertion survives.
    const loop = repair.match(/FOR rec IN([\s\S]*?)LOOP/i)?.[1] ?? '';
    expect(loop).toMatch(/safety_notes\s*~\*\s*'\\\(penalty:\[\^\)\]\*death'/);
    expect(loop).toMatch(/death_penalty_risk\(co\.lgbti_criminalization\)\s*=\s*'possible'/);
  });

  it('preserves the prior text so the correction is reversible', () => {
    expect(repair).toMatch(/'\{safety_notes,corrected\}'/);
    expect(repair).toMatch(/'from',\s*rec\.old_note/);
  });

  it('raises needs_attention and opens a review rather than silently rewriting', () => {
    expect(repair).toMatch(/needs_attention\s*=\s*true/);
    expect(repair).toMatch(/INSERT INTO public\.entity_review_queue/i);
  });

  it('ends by asserting no published note still buries a death penalty', () => {
    expect(repair).toMatch(/still bury a death penalty/i);
    expect(repair).toMatch(/RAISE EXCEPTION/i);
  });
});
