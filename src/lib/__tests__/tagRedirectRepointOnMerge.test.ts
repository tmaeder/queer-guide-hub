import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A redirect whose TARGET is later merged away must be carried across to the
 * surviving concept, or the URL dies one hop short of a canonical that exists.
 *
 * `tag_slug_redirects` is old_slug -> tag_id, and both readers resolve through
 * `tag_id`: the edge (`functions/_lib/detail.ts`, filtered `status=eq.active`)
 * and `resolve_tag_slug()` (joined `t.status = 'active'`). So when a redirect's
 * target tag flips to `merged`, that redirect resolves to NOTHING — measured on
 * prod 2026-09-03: /tags/m-nchen 404 while /tags/munchen 301'd to /tags/munich.
 *
 * `log_unified_tag_merge_redirect` only ever minted a row for the merged tag's
 * OWN slug (`old_slug = NEW.slug`). A rename-trail redirect already pointing AT
 * that tag was invisible to it.
 *
 * THIS HAD BEEN REPAIRED TWICE AND REGENERATED BOTH TIMES, because both repairs
 * were bare one-shot statements in data migrations rather than a change to a
 * writer:
 *   - 20260830011607 — repaired the WRONG COLUMN. It sets `new_slug`, which
 *     nothing reads, and never `tag_id`, which both readers and the hygiene
 *     metric use. Its closing assertion joins `t.slug = r.new_slug` too, so it
 *     verified the column it had just written and was blind to the one that
 *     matters.
 *   - 20261027120000 — did the `tag_id` half, predicate-scoped, and its header
 *     says it was written that way so it would "also cover the next merge that
 *     forgets a redirect". A one-shot statement cannot cover a future merge.
 *
 * 20270108100000 puts it in the trigger. These assertions exist so the third
 * repair is the last one: a future `create or replace` that drops the repoint
 * fails here rather than silently regenerating dead URLs, which nothing but a
 * baselined ratchet would notice.
 *
 * Text check against the migrations directory, not a database one, so it runs
 * in CI without credentials — same pattern as
 * `src/lib/rights/__tests__/geoSpineDualWrite.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

describe('log_unified_tag_merge_redirect carries inbound redirects through a merge', () => {
  const sql = latestDefinitionOf('log_unified_tag_merge_redirect');

  it('still mints the redirect for the merged tag’s own slug', () => {
    // Branch (a). Dropping it would strand every /tags/<merged-slug> URL, the
    // defect 20260802111403 exists to fix.
    expect(sql).toMatch(/insert\s+into\s+public\.tag_slug_redirects/i);
    expect(sql).toMatch(/on\s+conflict\s*\(\s*old_slug\s*\)\s*do\s+update/i);
  });

  it('repoints OTHER redirects that already pointed at the tag being merged', () => {
    // Branch (b) — the whole point. `tag_id = NEW.id` is the selector that
    // distinguishes it from branch (a), which keys on the tag's own slug.
    const repoint = sql.match(
      /update\s+public\.tag_slug_redirects\s+(?<set>set[\s\S]*?)\s+where\s+(?<where>[\s\S]*?tag_id\s*=\s*NEW\.id[\s\S]*?);/i,
    );
    expect(repoint, 'trigger must UPDATE redirects whose tag_id is the merged tag').not.toBeNull();
    // It must write tag_id — the column both readers resolve through. Writing
    // only new_slug is exactly how 20260830011607 passed while still broken.
    //
    // The SET clause is captured SEPARATELY from the WHERE on purpose. A regex
    // over the whole statement matches `tag_id =` in `where tag_id = NEW.id`
    // and passes on a body that sets new_slug alone — i.e. it green-lights the
    // precise historical bug. Caught by mutation-testing this assertion, not by
    // reading it.
    expect(repoint!.groups!.set).toMatch(/\btag_id\s*=/i);
  });

  it('resolves the whole chain rather than trusting merged_into_id', () => {
    // A bare UPDATE can point merged_into_id at a row that is itself merged,
    // which would repoint the redirect onto another dead target.
    expect(sql).toMatch(/tag_terminal_canonical\s*\(\s*NEW\.merged_into_id\s*\)/i);
  });

  it('deletes rather than creates a self-redirect', () => {
    // The canonical's own slug coming back means the row has nothing left to
    // do; repointing it would produce old_slug = new_slug. Same disposition
    // 20260830011607 settled on for the identical shape.
    expect(sql).toMatch(/delete\s+from\s+public\.tag_slug_redirects[\s\S]*?old_slug\s*=/i);
  });
});

describe('tag_terminal_canonical', () => {
  const sql = latestDefinitionOf('tag_terminal_canonical');

  it('is depth-capped and cycle-safe', () => {
    expect(sql).toMatch(/v_hops\s*>=\s*10|hops\s*<\s*10/i);
    expect(sql).toMatch(/v_next\s*=\s*v_id/i);
  });

  it('returns NULL rather than inventing a destination off an inactive chain', () => {
    // The 57 redirects pointing at a deprecated tag with no successor must stay
    // untouched: there is nowhere correct to send them and a wrong 301 is worse
    // than the 404 they get now.
    expect(sql).toMatch(/return\s+null\s*;/i);
    expect(sql).toMatch(/status\s*=\s*'active'/i);
  });
});
