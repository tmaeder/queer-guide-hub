import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the tag category representation repair.
 *
 *   50700101100000  backfills the 195 active tags that carried a `category_id`
 *                   and NO `is_primary` junction row — categorised in site
 *                   search, uncategorised on their own page, because
 *                   `/tags/:slug` renders the JUNCTION and the search facet
 *                   renders the denormalised TEXT. It also SEALS the producer:
 *                   both sync triggers were UPDATE-only, so a tag INSERTed with
 *                   `category_id` set never minted a junction row.
 *
 *   50700101100100  the sentinel, because `tag_hygiene_stats()` reads
 *                   `category_id IS NULL` and junction -> TEXT, and neither can
 *                   see category_id -> JUNCTION.
 *
 * The load-bearing property is NOT the backfill. It is that the backfill does
 * not move content gating. `unified_tags_recompute_is_adult()` fires AFTER
 * INSERT on `tag_category_assignments` and derives `is_adult` from the category
 * ALONE, so inserting the missing junction rows recomputes gating on all 195 —
 * measured, 22 would flip and 15 of those would UNGATE explicit sexual
 * vocabulary (`grool`, `helicockter`, `key-party`, `mmd-r18`, `story-of-o`)
 * that `isAdultTag()` gates behind an 18+ affirmation and safe mode. The
 * snapshot/restore pair is what stops that, and every assertion below exists so
 * it cannot be quietly dropped.
 *
 * Assertions run against COMMENT-STRIPPED SQL. This file's header quotes its own
 * statements almost verbatim, so a bare toContain over the whole file would pass
 * with the real statement deleted — the vacuous-assertion class that
 * 29000101100000, 20360401100300 and 20361124161700 all hit.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const BACKFILL = '50700101100000_tag_category_junction_gap.sql';
const SENTINEL = '50700101100100_tag_category_signals.sql';

/** Line comments only; these files use no block comments. */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

describe('category junction backfill', () => {
  const sql = statementsOf(BACKFILL);

  it('declares a non-system actor', () => {
    // log_unified_tag_change() RAISEs when an actor matching 'system:%' modifies
    // a human_reviewed row, and the is_adult recompute fires exactly such an
    // UPDATE. Default actor is 'system:trigger'.
    expect(sql).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:[^']+'/);
  });

  it('snapshots is_adult BEFORE any write can fire the recompute', () => {
    // The snapshot must precede the first statement that touches a junction or
    // a category_id, or it records post-recompute values and restores nothing.
    const snap = sql.indexOf('_tag_cat_before');
    const firstWrite = sql.search(
      /\bupdate\s+unified_tags\b|\binsert\s+into\s+tag_category_assignments\b/,
    );
    expect(snap).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(snap).toBeLessThan(firstWrite);
    expect(sql.slice(Math.max(0, snap - 200), snap + 400)).toMatch(/is_adult/);
  });

  it('restores is_adult from the snapshot after the junction backfill', () => {
    // Without this the backfill ungates 15 rows of explicit vocabulary.
    const insert = sql.indexOf('insert into tag_category_assignments');
    const restore = sql.search(/set\s+is_adult\s*=\s*b\.is_adult/);
    expect(insert).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(insert);
    expect(sql.slice(restore - 300, restore + 300)).toMatch(/_tag_cat_before/);
  });

  it('asserts gating did not move', () => {
    // The safety postcondition. Its absence is how a regression ships silently.
    expect(sql).toMatch(/is_adult is distinct from b\.is_adult/);
    expect(sql).toMatch(/raise exception '[^']*is_adult moved/);
  });

  it('backfills the junction directly rather than rewriting category_id', () => {
    // Re-writing category_id with the value it already holds is a no-op:
    // `is distinct from` is false, so neither trigger fires and nothing is
    // backfilled. The insert must target the junction table itself.
    const i = sql.indexOf('insert into tag_category_assignments');
    expect(i).toBeGreaterThan(-1);
    const stmt = sql.slice(i, i + 500);
    expect(stmt).toMatch(/from unified_tags/);
    expect(stmt).toMatch(/not exists/);
    expect(stmt).toMatch(/is_primary/);
  });

  it('names `category` in the one statement that changes the TEXT', () => {
    // trg_search_documents_tag is column-scoped and fires on the columns named
    // in the STATEMENT, not on what a BEFORE trigger wrote. A category_id-only
    // write therefore leaves the search facet stale.
    const i = sql.indexOf("where t.slug = 'faggot'");
    expect(i).toBeGreaterThan(-1);
    const stmt = sql.slice(Math.max(0, i - 400), i);
    expect(stmt).toMatch(/set\s+category_id\s*=\s*c\.id\s*,\s*category\s*=\s*c\.name/);
  });

  it('reconciles robot toward the junction, not away from it', () => {
    // The junction and the TEXT already agree on Fetishes; category_id is the
    // lone dissenter. Writing the junction's value keeps the page still.
    const i = sql.indexOf("t.slug = 'robot'");
    expect(i).toBeGreaterThan(-1);
    const stmt = sql.slice(Math.max(0, i - 400), i + 200);
    expect(stmt).toMatch(/set\s+category_id\s*=\s*a\.category_id/);
    expect(stmt).toMatch(/a\.is_primary/);
    // The postcondition pins AGREEMENT, not the literal category: hardcoding
    // 'Fetishes' would abort `db push` on main if the row is legitimately
    // recategorised, and agreement is the actual invariant. The literal is
    // reported instead so the row that took the disagreement count from 1 to 0
    // stays named.
    expect(sql).toMatch(/raise exception '[^']*robot page and category_id still disagree/);
    expect(sql).toMatch(/raise notice '[^']*robot now reads/);
    expect(sql).not.toMatch(/raise exception '[^']*robot expected Fetishes/);
    // Assert the CONDITION, not just the message: swapping the test to a
    // literal category leaves the wording intact and reintroduces the abort.
    expect(sql).toMatch(/if v_robot_pg is distinct from v_robot_id then/);
    expect(sql).not.toMatch(
      /if v_robot_pg is distinct from 'Fetishes' then\s*\n\s*raise exception/,
    );
  });

  describe('the producer seal', () => {
    it('makes both triggers fire on INSERT', () => {
      expect(sql).toMatch(
        /create trigger trg_sync_tag_category\s+before insert or update on public\.unified_tags/,
      );
      expect(sql).toMatch(
        /create trigger trg_sync_tag_category_after\s+after insert or update of category_id on public\.unified_tags/,
      );
    });

    it('branches on TG_OP instead of relying on OR short-circuit', () => {
      // On INSERT `OLD` is unassigned and touching it raises 55000. PostgreSQL
      // does not guarantee short-circuit evaluation of OR, so the compact
      // `tg_op = 'INSERT' or new.category_id is distinct from old.category_id`
      // can still evaluate the `old` reference and raise.
      for (const fn of ['sync_tag_category_assignment()', 'sync_tag_category_assignment_after()']) {
        const i = sql.indexOf(`function public.${fn}`);
        expect(i).toBeGreaterThan(-1);
        const body = sql.slice(i, i + 900);
        expect(body).toMatch(/if tg_op = 'INSERT' then/);
        // No branch may put tg_op and an `old.` reference in one expression.
        expect(body).not.toMatch(/tg_op = 'INSERT'\s+or\b/);
      }
    });

    it('asserts the INSERT arm is actually attached', () => {
      // A count of zero gap rows the day after someone re-creates a trigger
      // without INSERT is not evidence of health.
      //
      // BOTH raises are asserted by name. A single `does not fire on INSERT`
      // match is satisfied by either one, so deleting the other survives —
      // which is exactly what mutation testing caught here.
      expect(sql).toMatch(/tgtype & 4/);
      const raises = sql.match(/raise exception '[^']*does not fire on INSERT[^']*'/g) ?? [];
      expect(raises).toHaveLength(2);
      expect(raises.join('\n')).toMatch(/trg_sync_tag_category_after does not fire on INSERT/);
      expect(raises.join('\n')).toMatch(/trg_sync_tag_category does not fire on INSERT/);
    });
  });

  it('guards the faggot postcondition on the row still being active', () => {
    // A retirement or merge of that row between authoring and CI applying this
    // is a legitimate concurrent decision; without the existence guard the
    // lookup returns NULL and aborts `db push` for the whole repo.
    expect(sql).toMatch(
      /if exists \(select 1 from unified_tags where slug = 'faggot' and status = 'active'\) then/,
    );
    expect(sql).toMatch(/raise notice '[^']*faggot is no longer an active tag/);
  });

  it('asserts the reached state positively, not the number of insertions', () => {
    // `on conflict` work is idempotent, so a re-run legitimately inserts
    // nothing and an insertion count proves nothing.
    expect(sql).toMatch(/raise exception '[^']*without a primary junction row: %/);
    expect(sql).toMatch(/if v_gap <> 0 then/);
  });
});

describe('tag_category_signals', () => {
  const sql = statementsOf(SENTINEL);

  it('reports a denominator so an empty corpus cannot read as clean', () => {
    expect(sql).toMatch(/'active_tags'/);
    expect(sql).toMatch(/raise exception '[^']*zero active tags/);
  });

  it('measures category_id -> JUNCTION, the direction the page renders', () => {
    const i = sql.indexOf("'category_id_without_junction'");
    expect(i).toBeGreaterThan(-1);
    const expr = sql.slice(i, i + 300);
    expect(expr).toMatch(/left join prim/);
    expect(expr).toMatch(/a\.category_id is not null and p\.tag_id is null/);
  });

  it('checks the producer seal structurally', () => {
    const i = sql.indexOf("'insert_trigger_sealed'");
    expect(i).toBeGreaterThan(-1);
    const expr = sql.slice(i, i + 400);
    expect(expr).toMatch(/pg_trigger/);
    expect(expr).toMatch(/tgtype & 4/);
    expect(expr).toMatch(/trg_sync_tag_category_after/);
  });

  it('keeps the is_adult override cohort advisory and NAMED', () => {
    // Non-zero by design (22). Gating it would ship red on arrival; hiding the
    // slugs would make a new one indistinguishable from the known cohort.
    expect(sql).toMatch(/'is_adult_override'/);
    expect(sql).toMatch(/'is_adult_override_examples'/);
    expect(sql).toMatch(/jsonb_agg\(slug order by slug\)/);
    // It must NOT be asserted to zero anywhere in the verify block.
    const v = sql.indexOf('$verify$');
    expect(sql.slice(v)).not.toMatch(/is_adult_override.*raise exception/s);
  });

  it('is service_role only', () => {
    // A SECURITY DEFINER aggregate granted to `authenticated` is granted to
    // every signed-in member.
    expect(sql).toMatch(/revoke all on function public\.tag_category_signals\(\) from anon/);
    expect(sql).toMatch(
      /revoke all on function public\.tag_category_signals\(\) from authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.tag_category_signals\(\) to service_role/,
    );
  });
});

describe('CI wiring', () => {
  const js = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  /**
   * Scoped to THIS section, not a fixed character window. A generous slice runs
   * into the next section and borrows its `FAILED = true`, so a count-based
   * assertion passes with this section's own failure branch removed — caught by
   * mutation testing, and the same vacuous-assertion class recorded elsewhere
   * in this repo.
   */
  const section = (() => {
    const i = js.indexOf('rpc/tag_category_signals');
    expect(i).toBeGreaterThan(-1);
    const next = js.indexOf('// §', i);
    return js.slice(i, next > -1 ? next : js.length);
  })();

  it('calls the sentinel and fails loudly on a broken probe', () => {
    expect(section).toMatch(/measured NOTHING/);
  });

  it('hard-fails on each zero invariant', () => {
    expect(section).toMatch(/category_id_without_junction/);
    // The loop over the zero invariants must set FAILED, not merely print.
    //
    // Scoped to the `if (n > 0)` block ALONE — cut at its closing brace rather
    // than by a character budget. A generous window reaches forward into the
    // `insert_trigger_sealed` branch and borrows ITS console.error/FAILED pair,
    // so the assertion passes with this branch downgraded to console.log. That
    // survived two rounds of mutation testing before being scoped.
    const loop = section.indexOf('for (const [key, why] of zeroInvariants)');
    expect(loop).toBeGreaterThan(-1);
    const guard = section.indexOf('if (n > 0) {', loop);
    expect(guard).toBeGreaterThan(-1);
    const end = section.indexOf('\n      }', guard);
    expect(end).toBeGreaterThan(guard);
    const body = section.slice(guard, end);
    expect(body).toMatch(/console\.error/);
    expect(body).toMatch(/FAILED = true/);
  });

  it('hard-fails on an unsealed producer', () => {
    const i = section.indexOf('insert_trigger_sealed !== true');
    expect(i).toBeGreaterThan(-1);
    expect(section.slice(i, i + 400)).toMatch(/console\.error[\s\S]*?FAILED = true/);
  });

  it('does not gate on the advisory override cohort', () => {
    const ov = section.indexOf('is_adult_override');
    expect(ov).toBeGreaterThan(-1);
    // The advisory branch prints; it must not set FAILED.
    expect(section.slice(ov)).not.toMatch(/FAILED = true/);
  });
});
