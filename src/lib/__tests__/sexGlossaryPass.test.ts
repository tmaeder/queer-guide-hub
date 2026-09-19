import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the three-part sex & sexual-health glossary pass.
 *
 * Every assertion runs against COMMENT-STRIPPED SQL. These files carry long
 * explanatory headers that quote the exact defect strings they remove (e.g.
 * "Village in Papua, Indonesia"), so a bare `toContain` over the raw file is
 * satisfied by the prose while the statement is gone — the vacuous-assertion
 * class this repo has recorded repeatedly.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const ACTIVE = '99991789812138_sex_glossary_active_corrections.sql';
const REVIVE = '99991789812140_sex_glossary_revivals.sql';
const CREATE = '99991789812141_sex_glossary_creations.sql';

/** Strip `--` line comments so assertions cannot be satisfied by the header. */
function statementsOf(file: string): string {
  const raw = readFileSync(join(MIGRATIONS, file), 'utf8');
  return raw
    .split('\n')
    .map((line) => {
      // naive but sufficient here: no statement in these files contains `--`
      // inside a string literal.
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

/** The verify block only — where the postconditions live. */
function verifyBlockOf(file: string): string {
  const s = statementsOf(file);
  const i = s.indexOf('do $verify$');
  expect(i, `${file} has no verify block`).toBeGreaterThan(-1);
  return s.slice(i);
}

/** Everything BEFORE the verify block — the writes. */
function writesOf(file: string): string {
  const s = statementsOf(file);
  const i = s.indexOf('do $verify$');
  return i === -1 ? s : s.slice(0, i);
}

/**
 * Split the writes into whole statements.
 *
 * NOT by splitting on `;` — the lubricant replacement prose contains a
 * semicolon ("condom-safe and washes out easily; silicone lasts longer"), so a
 * `[\s\S]*?;` match truncates that statement mid-literal and reports it as
 * unguarded. Same trap this repo has recorded on a `[^;]*` mutation pattern.
 * Cut at the START of the next top-level statement instead.
 */
function topLevelStatements(writes: string): string[] {
  return writes
    .split(/\n(?=(?:update|insert|create|select set_config|delete)\s)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

describe('part 1 — corrections to live rows', () => {
  const writes = writesOf(ACTIVE);
  const verify = verifyBlockOf(ACTIVE);

  it('replaces the industrial-lubricant prose and refiles the row', () => {
    // The row renders, so prose is REPLACED, not retracted (the darkroom rule).
    expect(writes).toMatch(/update unified_tags set[\s\S]{0,400}?where slug = 'lubricant'/);
    expect(writes).toContain('reduce friction between surfaces in mutual contact');
    expect(writes).toContain("where slug = 'safer-sex'");
    // and it must still publish something afterwards
    expect(writes).toMatch(/description = 'A slick liquid or gel used during sex/);
  });

  it('is content-guarded on every repair, so a concurrent fix no-ops instead of clobbering', () => {
    const updates = topLevelStatements(writes).filter((s) => /^update /i.test(s));
    expect(updates.length).toBeGreaterThanOrEqual(6);
    for (const u of updates) {
      // every UPDATE names the defect it removes, or targets only empty columns
      const guarded =
        /ilike '%/.test(u) ||
        /is null/.test(u) ||
        /category = 'Orientation'/.test(u) ||
        /lubricity/.test(u);
      expect(guarded, `unguarded UPDATE:\n${u.slice(0, 220)}`).toBe(true);
    }
  });

  it('fills NULL summaries rather than rewriting prose that exists', () => {
    expect(writes).toMatch(/t\.short_description is null/);
    // and never touches description on those rows
    const fill = writes.slice(writes.indexOf('update unified_tags t set short_description = v.s'));
    expect(fill).not.toMatch(/set description/);
  });

  it('de-genders the erectile-dysfunction summary without rewriting its description', () => {
    const ed =
      writes.match(
        /update unified_tags set\s+short_description = 'Persistent difficulty[\s\S]*?;/,
      )?.[0] ?? '';
    expect(ed).toContain("slug = 'erectile-dysfunction'");
    expect(ed).not.toMatch(/set[\s\S]*description = '(?!Persistent)/);
  });

  it('declares an actor, because most repaired rows are human_reviewed', () => {
    expect(writes).toContain("set_config('app.actor'");
    expect(writes).toContain('migration:99991789812138');
  });

  it('asserts the REACHED state positively, not a count of its own writes', () => {
    expect(verify).toMatch(/if v_bad <> 23 then/);
    expect(verify).toContain('tag_has_prose');
    // the lubricant check must cover the category, not only the prose
    expect(verify).toMatch(/category is distinct from 'Safer Sex Practices'/);
  });
});

describe('part 2 — repair, then revive', () => {
  const writes = writesOf(REVIVE);
  const verify = verifyBlockOf(REVIVE);

  it('repairs the six wrong-subject summaries BEFORE anything is published', () => {
    const reviveAt = writes.indexOf("status = 'active'");
    expect(reviveAt).toBeGreaterThan(-1);
    for (const needle of [
      'Village in Papua',
      'District in East Java',
      'deforms under shear stress',
      'reproductive cell or gamete',
      'Term for brief activity',
    ]) {
      const at = writes.indexOf(needle);
      expect(at, `${needle} is not repaired in the writes`).toBeGreaterThan(-1);
      expect(at, `${needle} is repaired AFTER the revive`).toBeLessThan(reviveAt);
    }
  });

  it('nulls borrowed identifiers and never repoints them', () => {
    expect(writes).toMatch(/wikidata_id = null/);
    // Scoped to the SET clause: a QID literal is legitimate in a WHERE guard
    // and appears there twice. Asserting over the whole statement would fail on
    // correct code — the "scope the assertion to the half of the statement it
    // is about" rule.
    for (const stmt of topLevelStatements(writes).filter((s) => /^update /i.test(s))) {
      const setClause = stmt.slice(
        0,
        stmt.search(/\bwhere\b/i) === -1 ? stmt.length : stmt.search(/\bwhere\b/i),
      );
      expect(setClause, `identifier repointed in:\n${stmt.slice(0, 160)}`).not.toMatch(
        /wikidata_id\s*=\s*'Q/,
      );
    }
    // Q9384 belongs to testicle; Q782623 to autoeroticism. Both are only ever
    // used as a GUARD here, never assigned.
    expect(writes).toMatch(/where slug = 'egg' and wikidata_id = 'Q9384'/);
    expect(writes).toMatch(/where slug = 'autosexual' and wikidata_id = 'Q782623'/);
  });

  it('does not write tag_wikidata_repair_audit, which feeds a live sentinel', () => {
    expect(writes).not.toContain('tag_wikidata_repair_audit');
  });

  it('revives UNPUBLISHED and reviewed, both set explicitly', () => {
    const revive = writes.match(/update unified_tags set\s+status = 'active'[\s\S]*?;/)?.[0] ?? '';
    expect(revive).toContain('seo_indexable = false');
    expect(revive).toContain('human_reviewed = true');
    expect(revive).toContain("where status = 'deprecated'");
  });

  it('moves health topics out of Fetishes and clears their adult flag', () => {
    expect(writes).toContain("('menstruation','physical-reproductive')");
    expect(writes).toContain("('pregnancy','physical-reproductive')");
    expect(writes).toContain("('libido','sexual-health')");
    expect(writes).toMatch(/set is_adult = false/);
  });

  it('asserts the reached state, the unpublished invariant, and the must-stay-down set', () => {
    expect(verify).toMatch(/if v_bad <> 46 then/);
    expect(verify).toMatch(/seo_indexable and slug in/);
    // the nine deliberately left deprecated, including the four the alias-shadow
    // guard refused — a later pass must not re-propose them
    for (const slug of ['blow-job', 'butt-plug', 'semen', 'transition', 'lube', 'testes']) {
      expect(verify).toContain(`'${slug}'`);
    }
    // and their canonical targets must be reachable, which is WHY it was safe
    expect(verify).toMatch(/'blowjob','anal-plug','jizz','gender-transition'/);
  });

  it('keeps the identifiers on the rows they actually belong to', () => {
    expect(verify).toMatch(/slug = 'testicle' and wikidata_id = 'Q9384'/);
    expect(verify).toMatch(/slug = 'autoeroticism' and wikidata_id = 'Q782623'/);
  });
});

describe('part 3 — creations', () => {
  const writes = writesOf(CREATE);
  const verify = verifyBlockOf(CREATE);

  it('creates unpublished and reviewed', () => {
    expect(writes).toMatch(/'active', false, true/);
  });

  it('sets ALL THREE category representations, because no trigger fires on INSERT', () => {
    // category_id AND the text column on the insert...
    expect(writes).toMatch(/category_id, category,/);
    expect(writes).toMatch(/c\.id, c\.name,/);
    // ...AND the junction row that /tags/:slug actually renders.
    // Anchored with (?![\w]) because `tag_category_assignments` is a PREFIX of
    // any renamed table: a bare toContain() passes against
    // `insert into tag_category_assignments_SKIPPED`, which writes nothing.
    // Found by mutation testing, not by reading.
    expect(writes).toMatch(/insert into tag_category_assignments(?![\w])/);
    expect(writes).toMatch(/is_primary\)\s*\nselect t\.id, c\.id, true/);
  });

  it('refuses to mint a row whose slug is already an alias', () => {
    expect(writes).toMatch(
      /not exists \(select 1 from tag_aliases a where a\.alias_slug = n\.slug\)/,
    );
  });

  it('guards alias inserts against the three shapes tag_reject_alias_shadow refuses', () => {
    const aliasInsert = writes.slice(writes.indexOf('insert into tag_aliases'));
    expect(aliasInsert).toMatch(
      /not exists \(select 1 from tag_aliases a where a\.alias_slug = v\.aslug\)/,
    );
    expect(aliasInsert).toMatch(
      /not exists \(select 1 from unified_tags u where u\.slug = v\.aslug\)/,
    );
    expect(aliasInsert).toMatch(/lower\(btrim\(u2\.name\)\) = lower\(v\.alias\)/);
  });

  it('writes aliases as approved, since auto aliases route nothing', () => {
    expect(writes).toMatch(/v\.atype, 'approved'/);
    expect(writes).not.toMatch(/v\.atype, 'auto'/);
  });

  it('fills the empty twin rather than creating a duplicate beside it', () => {
    expect(writes).toMatch(/where slug = 'handjob'[\s\S]{0,120}?btrim\(description\), ''\) = ''/);
    // and hand-job is an ALIAS, not a created row
    expect(writes).toContain("('handjob','Hand Job','hand-job','synonym')");
    expect(writes).not.toMatch(/^\('hand-job',/m);
  });

  it('does not create any of the nine rows that already exist under another spelling', () => {
    for (const slug of [
      'metamour',
      'dd-lg',
      'foot-job',
      'hand-job',
      'fraysexual',
      'fallopian-tube',
      'hook-up',
      'packer',
      'seminal-vesicle',
    ]) {
      expect(writes, `${slug} is in the creation VALUES list`).not.toMatch(
        new RegExp(`^\\('${slug.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}',`, 'm'),
      );
    }
  });

  it('does not create the deliberately refused single-source coinages', () => {
    for (const slug of [
      'amazon',
      'doppelbanger',
      'hotline-bling',
      'mastuwaiting',
      'sex-change-operation',
    ]) {
      expect(writes).not.toMatch(new RegExp(`^\\('${slug}',`, 'm'));
    }
    // and the refusal is enforced, not merely observed
    expect(verify).toMatch(/deliberately-refused terms were created after all/);
  });

  it('asserts categories agree across all three representations, not just the lever', () => {
    expect(verify).toMatch(/t\.category_id is distinct from c\.id/);
    expect(verify).toMatch(/t\.category is distinct from c\.name/);
    expect(verify).toMatch(/tag_category_assignments a[\s\S]{0,120}?a\.is_primary/);
  });

  it('asserts aliases actually landed, so a silently-empty insert fails', () => {
    expect(verify).toMatch(/if v_n < 18 then/);
  });

  it('asserts each of the nine twins is reachable under exactly one row', () => {
    expect(verify).toMatch(/if v_bad <> 9 then/);
    expect(verify).toMatch(/'metamour','ddlg','footjob','handjob'/);
  });
});

describe('all three parts', () => {
  const files = [ACTIVE, REVIVE, CREATE];

  it('declare an actor, since the corpus is largely human_reviewed', () => {
    for (const f of files) {
      expect(statementsOf(f), f).toContain("set_config('app.actor'");
    }
  });

  it('are transactional and end with a verify block', () => {
    for (const f of files) {
      const s = statementsOf(f);
      expect(s, f).toMatch(/^\s*begin;/m);
      expect(s, f).toMatch(/commit;\s*$/);
      expect(s, f).toContain('do $verify$');
    }
  });

  it('never loosen a postcondition comparison', () => {
    for (const f of files) {
      const v = verifyBlockOf(f);
      // a neutered `if v_bad < 0` / `if false` leaves every string-anchored
      // assertion above intact while the check has stopped checking
      expect(v, f).not.toMatch(/if\s+false\s+then/);
      expect(v, f).not.toMatch(/if\s+v_bad\s*<\s*0\s+then/);
      expect(v, f).not.toMatch(/v_bad\s+int\s*:=\s*0\s*;/);
      // and each verify block must actually read the table
      expect(v, f).toMatch(/from unified_tags/);
    }
  });

  it('never publish: no row anywhere in the pass is made indexable', () => {
    for (const f of files) {
      expect(writesOf(f), f).not.toMatch(/seo_indexable\s*=\s*true/);
    }
  });

  it('only ever REPLACE prose on rows that render, never blank them', () => {
    // part 1 and 2 operate on rows a reader can reach; a bare `description = null`
    // there would thin a live page instead of correcting it.
    for (const f of [ACTIVE, REVIVE]) {
      expect(writesOf(f), f).not.toMatch(/set\s+description\s*=\s*null/);
      expect(writesOf(f), f).not.toMatch(/short_description\s*=\s*null/);
    }
  });
});
