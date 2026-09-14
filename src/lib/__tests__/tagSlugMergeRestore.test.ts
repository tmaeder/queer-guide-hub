import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 20260914175649 (applied to prod ahead of merge; see the file header) — restoring three twin-named dedupe merges that
 * 50900101100100 withdrew as collateral, taking the documented zero-invariant
 * `tag_hygiene_stats().slug_diacritic_lossy` from 0 to 3 and failing
 * `Critical data-quality gates` on every open PR in the repo.
 *
 * The argument this file rests on, and therefore what the tests pin:
 *
 *  1. These three merges are DE-DUPLICATION, not semantic redirects. Each pair
 *     shares a byte-identical `name`; the loser's slug is a corrupt spelling of
 *     the winner's. 20261211120000 created them for exactly that reason,
 *     because a corrected slug cannot be freed by merging the other way. So the
 *     UPDATE must match on `o.name = t.name`, and the postcondition must prove
 *     each restored row points at its real twin rather than at anything.
 *
 *  2. SOFT ON PRECONDITIONS. No assertion about the starting state: a
 *     concurrent session that merges, renames or revives one of these rows must
 *     not abort `db push` on main and block every migration queued behind it.
 *
 *  3. HARD ON THE REACHED STATE. slug_diacritic_lossy must be 0 and
 *     merged_but_not_status_merged must be 0 — the second because this file
 *     writes `merged_into_id` and `status` together and a half-merge is its own
 *     zero-invariant.
 *
 *  4. target_deprecated is REPORTED, never enforced. It moves 0 -> 3 by design
 *     (all three targets are deprecated 0-usage twins) and is print-only in
 *     check-pipeline-health.mjs. Raising on it would make the file fail on
 *     success.
 *
 * Assertions run against COMMENT-STRIPPED SQL: the header quotes the metric
 * names and the rejected alternatives, so a bare toContain over the raw file
 * would pass with the real statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '20260914175649_tag_slug_merge_restore.sql';

const raw = readFileSync(join(MIGRATIONS, FILE), 'utf8');

const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const statements = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

const SLUGS = ['jan-mikol-ek', 'kirsten-pl-tz', 'preistr-ger'];

describe('20260914175649 — restore the twin-named dedupe merges', () => {
  it('restores exactly the three lossy-slug rows', () => {
    for (const slug of SLUGS) expect(statements).toContain(`'${slug}'`);
    expect(statements.match(/update public\.unified_tags/g) ?? []).toHaveLength(1);
  });

  it('writes merged_into_id and status together, never a half-merge', () => {
    expect(statements).toMatch(/set merged_into_id = o\.id,\s*\n\s*status = 'merged'/);
    expect(verify).toContain('merged_but_not_status_merged');
    expect(verify).toMatch(/raise exception '[^']*half-merge/);
  });

  it('matches the twin by NAME, which is the whole argument for re-merging', () => {
    expect(statements).toContain('o.name = t.name');
    expect(statements).toContain('o.slug = public.normalize_tag_slug(o.name)');
    expect(statements).toContain('o.id <> t.id');
  });

  it('refuses to merge into a row that is itself merged', () => {
    expect(statements).toContain("o.status <> 'merged'");
  });

  it('is soft on preconditions — no starting-state assertion can abort db push', () => {
    // The guards that scope the UPDATE are in its WHERE clause, not in a
    // precondition block that raises.
    expect(statements).toContain("t.status = 'deprecated'");
    expect(statements).toContain('t.merged_into_id is null');
    // ...and nothing raises before the work.
    expect(statements).not.toContain('raise exception');
  });

  it('hard-asserts the invariant it exists to reach, and names the survivors', () => {
    expect(verify).toContain("'slug_diacritic_lossy'");
    expect(verify).toMatch(/if v_lossy <> 0 then/);
    expect(verify).toMatch(/raise exception 'slug_diacritic_lossy is %/);
    // the failure message must carry the offending slugs, not just a count
    expect(verify).toContain('string_agg(slug');
  });

  it('proves each restored row points at its real twin', () => {
    expect(verify).toMatch(/o\.name is distinct from t\.name/);
    expect(verify).toMatch(/raise exception '[^']*not the twin/);
  });

  it('reports target_deprecated instead of raising on it', () => {
    expect(verify).toContain('target_deprecated');
    const block = verify.slice(verify.indexOf('target_deprecated'));
    expect(block).toMatch(/raise notice/);
    expect(block).not.toMatch(/raise exception/);
  });

  it('declares a non-system actor', () => {
    expect(statements).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'admin:[^']+'/);
    expect(statements).not.toMatch(/'system:/);
  });

  it('never re-baselines the metric it is fixing', () => {
    expect(raw).not.toMatch(/--update/);
    expect(raw).not.toContain('tag-hygiene-baseline.json');
  });
});
