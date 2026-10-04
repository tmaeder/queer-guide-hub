import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rows in `marketplace_brands` that are not brands.
 *
 * Three dispositions, deliberately different, and the guard keeps them apart because the
 * risk is that a later pass takes the loosest group's licence and applies it to the rest:
 *   A  MERGE  (9) a product line sold on its parent brand's own shop
 *   B  RETIRE (3) a print-on-demand fulfiller or a generic bucket, no defensible parent
 *   C  REFUSE (3) real brands the selection regex also matched
 *
 * Every assertion runs against comment-stripped SQL. The migration's header quotes its own
 * predicates, brand keys and listing titles verbatim, so a whole-file `toContain` would
 * pass with the load-bearing statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const VERSION = '99991791149837';
const FILENAME = `${VERSION}_marketplace_brand_identity_cleanup.sql`;

function raw(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.startsWith(VERSION));
  expect(files, `no migration found at version ${VERSION}`).toContain(FILENAME);
  return readFileSync(join(MIGRATIONS, FILENAME), 'utf8');
}

/** Strip `--` comments. The premise — every `--` starts a comment — is asserted below. */
function statements(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const SRC = raw();
const SQL = statements(SRC);

/** The nine product lines merged into a parent that already exists. */
const MERGES: Array<[string, string]> = [
  ['custom', 'automic gold'],
  ['a series', 'nattaup'],
  ['b series', 'nattaup'],
  ['f series', 'nattaup'],
  ['v series', 'nattaup'],
  ['p series', 'nattaup'],
  ['di', 'kink3d'],
  ['hd', 'cuffed'],
  ['jo', 'system jo'],
];

/** The three retired with no parent. */
const RETIRES = ['printful', 'printify', 'other'];

/** Real brands the selection regex matched and a human refused. */
const CONTROLS = ['master series', 'hard line prosthetics', 'desire collection by ns novelties'];

describe('the comment stripper itself', () => {
  it('removes the header prose it exists to remove', () => {
    // Positive control: without this, every assertion below could be passing against the
    // header rather than against a statement.
    expect(SRC).toContain('Single-merchant is NOT evidence of a non-brand');
    expect(SQL).not.toContain('Single-merchant is NOT evidence of a non-brand');
  });

  it('cannot truncate a string literal, because every double dash starts a comment', () => {
    // The stripper is line-based, so a `--` inside a quoted string would eat the rest of
    // that statement and make every later assertion vacuous. Verify the premise: on each
    // line the text before the first `--` must hold an even number of single quotes.
    const lines = SRC.split('\n');
    const offenders: string[] = [];
    let checked = 0;
    lines.forEach((line, i) => {
      const at = line.indexOf('--');
      if (at === -1) return;
      checked += 1;
      if ((line.slice(0, at).match(/'/g) ?? []).length % 2 !== 0) {
        offenders.push(`line ${i + 1}: ${line.trim()}`);
      }
    });
    // A scan that examined nothing would also report no offenders.
    expect(checked, 'no line contains a double dash; the scan measured nothing').toBeGreaterThan(
      20,
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * The VALUES list only. The counts below must not see `'merge'` in the CHECK constraint
 * or in the later `kind = 'merge'` predicates — scoping them to this slice is what makes
 * "and no others" mean the plan rather than the whole file.
 */
function planValues(): string {
  const m = SQL.match(/insert into _bic_plan[\s\S]*?;/i);
  expect(m, 'no plan INSERT found').not.toBeNull();
  return m![0];
}

describe('the frozen plan', () => {
  it('names all nine merges with their parent, and no others', () => {
    const values = planValues();
    for (const [artifact, canonical] of MERGES) {
      const row = new RegExp(`\\('${artifact}',\\s*'${canonical}',\\s*'merge'\\)`);
      expect(values, `merge ${artifact} -> ${canonical} missing`).toMatch(row);
    }
    expect((values.match(/'merge'\)/g) ?? []).length).toBe(MERGES.length);
  });

  it('names all three retires with a NULL parent', () => {
    const values = planValues();
    for (const artifact of RETIRES) {
      expect(values, `retire ${artifact} missing`).toMatch(
        new RegExp(`\\('${artifact}',\\s*null,\\s*'retire'\\)`, 'i'),
      );
    }
    expect((values.match(/'retire'\)/g) ?? []).length).toBe(RETIRES.length);
  });

  it('constrains kind to the two dispositions, so a third cannot be added silently', () => {
    expect(SQL).toMatch(/check\s*\(kind in \('merge','retire'\)\)/i);
  });
});

describe('group A: merged lines move their listings', () => {
  it('writes `brand`, never the generated `brand_key`', () => {
    // brand_key is GENERATED ALWAYS AS marketplace_normalize_brand(brand): it cannot be
    // written, and writing it would fail at apply time.
    const reKey = SQL.match(/update marketplace_listings[\s\S]*?;/i);
    expect(reKey, 'no listing re-key statement').not.toBeNull();
    expect(reKey![0]).toMatch(/set brand = b\.canonical_name/i);
    // Scoped to the SET clause. Over the whole statement this matches the WHERE clause's
    // own `l.brand_key = b.artifact_key` and fails on correct code.
    const setClause = reKey![0].match(/\bset\b([\s\S]*?)\bfrom\b/i);
    expect(setClause, 'no SET clause in the re-key statement').not.toBeNull();
    expect(setClause![1]).not.toMatch(/brand_key/i);
  });

  it('re-keys ONLY the merges, so group B keeps its source brand text', () => {
    const reKey = SQL.match(/update marketplace_listings[\s\S]*?;/i)![0];
    expect(reKey).toMatch(/b\.kind = 'merge'/i);
  });

  it('redirects each merged slug at its parent before the slug is dropped', () => {
    const redirect = SQL.match(/insert into public\.marketplace_brand_slug_redirects[\s\S]*?;/i);
    expect(redirect, 'no slug redirect statement').not.toBeNull();
    // Scoped to merges: a retired non-brand has no target to redirect at.
    expect(redirect![0]).toMatch(/b\.kind = 'merge'/i);
    expect(redirect![0]).toMatch(/b\.canonical_id/);
  });

  it('restates the receiving brands’ counts rather than waiting for the cron', () => {
    // marketplace_register_brands() only aggregates brands WITH active listings, so it can
    // raise a count but never lower one.
    const recount = SQL.match(/update marketplace_brands c[\s\S]*?;/i);
    expect(recount, 'no parent recount statement').not.toBeNull();
    expect(recount![0]).toMatch(/l\.status = 'active'/i);
    expect(recount![0]).toMatch(/kind = 'merge'/i);
  });
});

describe('group B: retired rows keep their listings', () => {
  it('asserts the listing count is UNCHANGED for every retired row', () => {
    // The mirror. Without it, a sweep that nulled or re-keyed group B's listings would
    // satisfy every "nothing is stranded" assertion.
    expect(SQL).toMatch(/v_retire_lost/);
    const mirror = SQL.match(
      /select count\(\*\) into v_retire_lost[\s\S]{0,400}?b\.listings_before/i,
    );
    expect(mirror, 'the retire mirror does not compare against listings_before').not.toBeNull();
    expect(SQL).toMatch(/raise exception 'brand-identity cleanup: % retired rows lost listings/i);
  });

  it('records the pre-state it compares against', () => {
    expect(SQL).toMatch(/listings_before/);
    const before = SQL.match(/create temp table _bic_before[\s\S]*?;/i);
    expect(before, 'no pre-state snapshot').not.toBeNull();
    expect(before![0]).toMatch(/listings_before/);
  });
});

describe('group C: the refused brands survive', () => {
  it('asserts all three are still approved with a slug', () => {
    for (const key of CONTROLS) {
      expect(SQL, `refused control ${key} is not asserted`).toContain(key);
    }
    expect(SQL).toMatch(/v_controls <> 3/);
    expect(SQL).toMatch(
      /raise exception 'brand-identity cleanup: only % of 3 refused control brands/i,
    );
  });
});

describe('soft on preconditions, hard on the goal', () => {
  it('skips a row a concurrent session already retired, and reports it', () => {
    const before = SQL.match(/create temp table _bic_before[\s\S]*?;/i)![0];
    expect(before).toMatch(/a\.status <> 'rejected'/i);
    expect(SQL).toMatch(/raise notice 'brand-identity cleanup: % of % rows actionable/i);
  });

  it('skips a merge whose parent does not exist', () => {
    const before = SQL.match(/create temp table _bic_before[\s\S]*?;/i)![0];
    expect(before).toMatch(/p\.kind = 'retire' or c\.id is not null/i);
  });

  it('refuses to report success when nothing is actionable', () => {
    expect(SQL).toMatch(/v_actionable = 0/);
    expect(SQL).toMatch(/raise exception 'brand-identity cleanup: no actionable rows/i);
  });

  it('never hard-deletes a brand or a listing', () => {
    expect(SQL).not.toMatch(/delete\s+from\s+(public\.)?marketplace_brands/i);
    expect(SQL).not.toMatch(/delete\s+from\s+(public\.)?marketplace_listings/i);
  });
});

describe('postconditions have positive controls', () => {
  it('proves the brands table is populated before trusting any zero', () => {
    expect(SQL).toMatch(/v_brands_total < 1000/);
    expect(SQL).toMatch(
      /raise exception 'brand-identity cleanup: marketplace_brands reads only % rows/i,
    );
  });

  it('asserts the reached state positively', () => {
    for (const cond of [
      /v_not_retired <> 0/,
      /v_slug_left <> 0/,
      /v_count_left <> 0/,
      /v_merge_stranded <> 0/,
    ]) {
      expect(SQL).toMatch(cond);
    }
  });

  it('asserts every merged slug resolves at its parent', () => {
    expect(SQL).toMatch(
      /v_redirects <> \(select count\(\*\) from _bic_before where kind = 'merge'/i,
    );
  });

  it('asserts each receiving brand ended up with listings', () => {
    expect(SQL).toMatch(/v_grew/);
    expect(SQL).toMatch(
      /raise exception 'brand-identity cleanup: a receiving brand reports no listings/i,
    );
  });
});

describe('the migration cannot reintroduce the deadlock class', () => {
  it('contains no DDL on marketplace_brands', () => {
    // 99991791111093 deadlocked (40P01) on `drop trigger ... on marketplace_brands`
    // because its own transaction had already UPDATEd that table, so a concurrent writer
    // held a row lock it needed released for ACCESS EXCLUSIVE.
    expect(SQL).not.toMatch(/\b(create|drop|alter)\s+(trigger|index|function|policy)\b/i);
    expect(SQL).not.toMatch(/alter\s+table/i);
  });

  it('creates only TEMP tables, which take no lock on a live table', () => {
    const creates = SQL.match(/create\s+(temp\s+)?table/gi) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    for (const c of creates) {
      expect(c.toLowerCase()).toContain('temp');
    }
  });

  it('uses a string literal in every RAISE format position', () => {
    // `raise exception 'a' || 'b'` is a 42601 that no test executing logic can reach and
    // that check-migration-sql.mjs cannot see inside a plpgsql body.
    const lines = SQL.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/\braise\s+(exception|notice)\b/i.test(line)) return;
      const after = line.replace(/^.*?\braise\s+(?:exception|notice)\s*/i, '');
      if (after.split(/',/)[0].includes('||')) offenders.push(`line ${i + 1}: ${line.trim()}`);
      const next = lines[i + 1] ?? '';
      if (!/,\s*$/.test(line) && /^\s*\|\|/.test(next)) {
        offenders.push(`line ${i + 1} continues with ||: ${line.trim()}`);
      }
    });
    expect(offenders).toEqual([]);
  });
});
