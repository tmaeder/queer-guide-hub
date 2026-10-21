import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791872772_admin_review_finding_codes.sql and the surfaces that read its output.
 *
 * /admin reported 335,506 "Pending decisions" when 281,271 of those rows were machine detector
 * output saying "this field is empty" -- rows on which business-quality's approve RAISES unless the
 * data is already fixed, and on which event-quality and general-review only flip a status without
 * touching the record. The migration classifies them and reports the two populations apart.
 *
 * Assertions run over COMMENT-STRIPPED SQL where they could otherwise be satisfied by the header,
 * which quotes nearly every phrase being asserted (including the numbers and the old predicate).
 */

const MIGRATION = '99991791872772_admin_review_finding_codes';
const MIG_DIR = join(process.cwd(), 'supabase/migrations');

function migrationSql(): string {
  const file = readdirSync(MIG_DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found -- renumbered without updating me?`);
  return readFileSync(join(MIG_DIR, file), 'utf8');
}

/** Strip only line-leading `--` comments; a mid-line `--` may sit inside a SQL string literal. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

const RAW = migrationSql();
const SQL = stripComments(RAW);

describe('the finding-code registry', () => {
  it('is a table with the subtitle_match column the join actually keys on', () => {
    expect(SQL).toMatch(/create table if not exists public\.admin_review_finding_codes/);
    // code is for humans and for joining the SOURCE tables; subtitle_match is what the union sees.
    // Dropping either column collapses the design into one that cannot express general-review,
    // whose view transforms its review_type while the other two emit theirs raw.
    expect(SQL).toMatch(/subtitle_match text not null/);
    expect(SQL).toMatch(/primary key \(queue_key, code\)/);
  });

  it('is never readable by anon or authenticated', () => {
    expect(SQL).toMatch(
      /revoke all on public\.admin_review_finding_codes from public, anon, authenticated/,
    );
    expect(SQL).toMatch(/enable row level security/);
  });

  it('seeds general-review codes in the normalized form its view emits, and the others raw', () => {
    // CITY_DESCRIPTION_PROVENANCE_MISSING is emitted as replace(lower(x),'_',' ').
    expect(SQL).toContain(
      "('general-review','CITY_DESCRIPTION_PROVENANCE_MISSING','city description provenance missing'",
    );
    // business-quality / event-quality emit reason_code / issue_code raw, so the two agree.
    expect(SQL).toContain(
      "('business-quality','description_missing_or_thin','description_missing_or_thin'",
    );
    expect(SQL).toContain("('event-quality','DESCRIPTION_MISSING','DESCRIPTION_MISSING'");
  });

  it('classifies ONLY empty-field codes -- anything a human could decide stays a decision', () => {
    // Misfiling a decision as a finding HIDES work. These are the big decidable codes and none of
    // them may ever appear in the seed: NAMED_VENUE_UNLINKED is 16,190 rows a human could resolve
    // by picking a venue, CITY_IDENTITY_AMBIGUOUS 12,063 that need a second signal, and every
    // *_REUSED / DEDUP_CANDIDATE / GEO_CONFLICT is a judgement about two records.
    for (const code of [
      'NAMED_VENUE_UNLINKED',
      'CITY_IDENTITY_AMBIGUOUS',
      'CITY_CATEGORY_UNCLASSIFIED',
      'IMAGE_REUSED',
      'IMAGE_CONTENT_REUSED',
      'DESCRIPTION_REUSED',
      'DESCRIPTION_BOILERPLATE',
      'DEDUP_CANDIDATE',
      'VENUE_GEO_CONFLICT',
      'LIVENESS_STALE',
      'linkage_unresolved',
      'ownership_pending',
      'organization_link_pending',
      'product_count_drift',
      'CITY_DESCRIPTION_WRONG_SUBJECT',
    ]) {
      expect(SQL).not.toContain(`,'${code}',`);
    }
  });
});

describe('the patch to get_admin_review_queue', () => {
  const patchBlock = SQL.slice(SQL.indexOf('do $patch$'), SQL.indexOf('end $patch$'));

  it('derives the new body from the LIVE definition, never from a repo file', () => {
    // A CREATE OR REPLACE built from the newest migration silently reverts a concurrent session's
    // change to this function -- the 99991790719601 precedent.
    expect(patchBlock).toContain('pg_get_functiondef(p.oid)');
    expect(patchBlock).toContain('execute v_src');
    expect(patchBlock).not.toMatch(/create or replace function public\.get_admin_review_queue/i);
  });

  it('requires every anchor to occur EXACTLY once and aborts otherwise', () => {
    expect(patchBlock).toMatch(/if coalesce\(v_n,0\) <> 1 then/);
    expect(patchBlock).toMatch(/raise exception 'anchor % occurs % times/);
    // and is idempotent, so a re-run is a no-op rather than a double application
    expect(patchBlock).toMatch(/if position\(v_after in v_src\) > 0 then\s+continue;/);
  });

  it('qualifies the star and the overdue predicate, or the function raises 42702 when CALLED', () => {
    // The left join brings admin_review_finding_codes.created_at into scope, so a bare `select *`
    // and a bare `created_at` are both ambiguous. CREATE OR REPLACE only parses a plpgsql body --
    // this compiled fine and failed on the first call. Caught by the dry run, not by reading.
    expect(patchBlock).toContain('(select authorized_rows.*,sla_hours is not null');
    expect(patchBlock).toContain('authorized_rows.created_at < now()');
  });

  it('joins on equality, not an OR, so the planner hash-joins 335k rows', () => {
    expect(patchBlock).toContain(
      'on f.queue_key=authorized_rows.queue_type and f.subtitle_match=authorized_rows.subtitle',
    );
    // An OR across code/subtitle_match would nested-loop. Guard the shape, not just the table name.
    expect(patchBlock).not.toMatch(/f\.code\s+or\s+/);
  });

  it('reports both totals and leaves all_total standing for existing callers', () => {
    expect(patchBlock).toContain(
      "'decisions_total',(select count(*) from authorized where not is_finding)",
    );
    expect(patchBlock).toContain(
      "'findings_total',(select count(*) from authorized where is_finding)",
    );
    expect(patchBlock).toContain("'all_total',(select count(*) from authorized),");
  });

  it('adds the decisions scope without removing any existing one', () => {
    expect(patchBlock).toContain("('all','safety','overdue','public','decisions')");
    expect(patchBlock).toContain("($4='decisions' and not u.is_finding)");
    for (const s of ['safety', 'overdue', 'public']) {
      expect(patchBlock).toContain(`'${s}'`);
    }
  });

  it('carries the new keys on the empty-union early return', () => {
    // An editor-only session takes that branch; without this it reads null and the UI renders NaN.
    expect(patchBlock).toContain("'decisions_total',0,'findings_total',0");
  });
});

describe('the postconditions', () => {
  const verify = SQL.slice(SQL.indexOf('do $verify$'), SQL.indexOf('end $verify$'));

  it('asserts the split PARTITIONS the queue rather than merely being present', () => {
    // Two numbers that do not sum to all_total would mean rows counted twice or not at all.
    expect(verify).toMatch(
      /\(v_res->>'decisions_total'\)::bigint \+ \(v_res->>'findings_total'\)::bigint\s*\n?\s*<> \(v_res->>'all_total'\)::bigint then/,
    );
    expect(verify).toContain('does not partition the queue');
  });

  it('refuses a degenerate classification in BOTH directions', () => {
    // findings_total = 0 means the registry matched nothing; decisions_total = 0 means it swallowed
    // the whole queue. Either passes a presence-only check.
    expect(verify).toMatch(/if \(v_res->>'findings_total'\)::bigint <= 0 then/);
    expect(verify).toMatch(/if \(v_res->>'decisions_total'\)::bigint <= 0 then/);
  });

  it('asserts every seeded code matches a LIVE row', () => {
    // A typo'd code classifies nothing while every structural assertion still passes -- the
    // vacuous-registry trap. P3 is the only check that can see it.
    expect(verify).toContain('P3 failed');
    // Each arm spans lines in the file; assert the table and its queue_key together but
    // whitespace-tolerantly, so a reformat does not read as a deleted check.
    expect(verify).toMatch(
      /public\.entity_quality_findings s\s+where f\.queue_key='business-quality'/,
    );
    expect(verify).toMatch(/public\.event_quality_issues s\s+where f\.queue_key='event-quality'/);
    expect(verify).toMatch(/public\.review_queue s\s+where f\.queue_key='general-review'/);
  });

  it('asserts subtitle_match agrees with what each view can emit', () => {
    // Asserting `code` alone passes with every general-review row misclassified.
    expect(verify).toMatch(
      /f\.queue_key='general-review' and f\.subtitle_match <> replace\(lower\(f\.code\),'_',' '\)/,
    );
    expect(verify).toMatch(
      /f\.queue_key in \('business-quality','event-quality'\) and f\.subtitle_match <> f\.code/,
    );
  });

  it('EXECUTES the function rather than only reading its source', () => {
    // A source-text postcondition cannot tell a live classification from a dead one.
    expect(verify).toContain('public.get_admin_review_queue(null,null,null,');
    expect(verify).toContain("'decisions')");
  });

  it('raises on every failure path instead of merely computing a count', () => {
    // Replacing a `raise exception` with `null;` leaves every string-anchored check green while
    // the postcondition has stopped failing.
    const raises = (verify.match(/raise exception '?P\d/g) ?? []).length;
    expect(raises).toBeGreaterThanOrEqual(7);
  });
});

describe('the sentinel', () => {
  it('reports its denominators before any count, and is service_role only', () => {
    expect(SQL).toMatch(/create or replace function public\.admin_review_finding_code_signals/);
    // Zero unmatched codes over an EMPTY registry is not a clean registry.
    const fn = SQL.slice(
      SQL.indexOf('admin_review_finding_code_signals()\nreturns jsonb'),
      SQL.indexOf('$fn$;'),
    );
    expect(fn.indexOf("'registry_rows'")).toBeLessThan(fn.indexOf("'codes_matching_nothing'"));
    expect(SQL).toMatch(
      /revoke all on function public\.admin_review_finding_code_signals\(\) from public, anon, authenticated/,
    );
    // `to service_role` must not be satisfied by `to service_role, authenticated`
    expect(SQL).toMatch(
      /grant execute on function public\.admin_review_finding_code_signals\(\) to service_role;/,
    );
  });
});

describe('the reader surfaces', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/admin/AdminReviewQueue.tsx'), 'utf8');
  const sidebar = readFileSync(
    join(process.cwd(), 'src/components/admin/shell/AdminSidebar.tsx'),
    'utf8',
  );

  it('headlines ready cases and separately labels raw decisions, never all_total', () => {
    expect(page).toContain('fmtCount(summary!.ready_total)');
    expect(page).toContain('Raw decisions ({fmtCount(summary?.decisions_total)})');
    expect(page).not.toContain('fmtCount(summary!.all_total)} decisions');
  });

  it('degrades to an em dash rather than substituting a different count', () => {
    // Between the Pages deploy and `db push` the two new keys are undefined, and
    // undefined.toLocaleString() takes the admin page down. Falling back to all_total would print
    // 335,495 labelled "decisions" -- the conflation this change removes.
    expect(page).toMatch(/const fmtCount = [^;]*: '—'/);
    expect(page).toMatch(/typeof n === 'number' && Number\.isFinite\(n\)/);
    expect(page).not.toMatch(/decisions_total \?\?|decisions_total \|\|/);
  });

  it('keys "All caught up" on decisions_total', () => {
    // all_total also counts the 281k findings, so that message could never display.
    // Whitespace-tolerant: prettier splits this ternary across lines, and an assertion pinned to
    // one layout fails on correct code the next time the file is formatted.
    expect(page).toMatch(/query\.data\?\.decisions_total === 0\s*\n?\s*\? 'All caught up'/);
    expect(page).not.toMatch(/query\.data\?\.all_total === 0\s*\n?\s*\? 'All caught up'/);
  });

  it('defaults the scope to ready cases, via the shared constant', () => {
    // Asserts the CONSTANT rather than a scope literal. Pinning the literal here is what
    // made this test fail on the fix that removed the duplicate request: both call sites must name
    // one value, so the page and the sidebar summary cannot drift into two separate RPCs.
    expect(page).toMatch(
      /\? \(scopeRaw as ReviewFilters\['scope'\]\)\s*\n?\s*: DEFAULT_REVIEW_SCOPE,/,
    );
    expect(page).toContain('scope: key === DEFAULT_REVIEW_SCOPE ? null : key');
    expect(page).toMatch(
      /import \{[\s\S]*?DEFAULT_REVIEW_SCOPE[\s\S]*?\} from '@\/hooks\/useAdminReview'/,
    );
  });

  it('still offers an all-inclusive view, so nothing is hidden', () => {
    expect(page).toContain('<option value="all">All source rows & findings');
    expect(page).toContain('fmtCount(summary?.all_total)');
  });

  it('badges the nav with ready cases, retaining the legacy decisions fallback', () => {
    expect(sidebar).toContain('count: review.data?.ready_total ?? review.data?.decisions_total');
    expect(sidebar).not.toContain('count: review.data?.all_total');
  });
});

/**
 * Sidebar badges must not issue a second full-queue request.
 * The former shared-scope optimization still duplicated requests when a filter changed.
 * Badges now use an unscoped summary RPC outside the queue workspace and consume the
 * page's cached totals inside it. useAdminReviewRequests.test.tsx verifies the actual
 * request count, shared totals and navigation cancellation; this guards the call boundary.
 */
describe('the admin review summary avoids a duplicate queue request', () => {
  const hook = readFileSync(join(process.cwd(), 'src/hooks/useAdminReview.ts'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'src/pages/admin/AdminReviewQueue.tsx'), 'utf8');

  it('keeps the page default shared and uses the summary RPC for badges', () => {
    expect(hook).toMatch(/export const DEFAULT_REVIEW_SCOPE[^=]*=\s*'ready'/);
    const fetchSummary = hook.slice(
      hook.indexOf('async function fetchReviewSummary'),
      hook.indexOf('export function useAdminReviewSummary'),
    );
    expect(fetchSummary).toContain(".rpc('get_admin_review_work_summary')");
    expect(fetchSummary).not.toContain('get_admin_review_queue');
    const summary = hook.slice(hook.indexOf('export function useAdminReviewSummary'));
    expect(summary).toContain('queryFn: fetchReviewSummary');
    expect(summary).not.toContain('useAdminReview(');
    expect(summary).not.toMatch(/scope:\s*'(all|decisions|safety|overdue|public)'/);
    // The page default must be the same constant.
    expect(page).toContain(': DEFAULT_REVIEW_SCOPE,');
    expect(page).toContain('DEFAULT_REVIEW_SCOPE');
  });

  it('the dashboard mock mirrors the real constant, so its scope assertion is not vacuous', () => {
    const spec = readFileSync(
      join(process.cwd(), 'src/pages/admin/__tests__/AdminDashboard.test.tsx'),
      'utf8',
    );
    const real = /export const DEFAULT_REVIEW_SCOPE[^=]*=\s*'([a-z]+)'/.exec(hook)?.[1];
    expect(real).toBeTruthy();
    expect(spec).toContain(`DEFAULT_REVIEW_SCOPE: '${real}'`);
  });

  it('leaves no stray scope literal in the hook that could re-split the request', () => {
    // Positive control: the file does carry the scope vocabulary, so a zero match below would be
    // evidence the search is wrong rather than evidence the file is clean.
    expect(hook).toMatch(/'all'\s*\|\s*'decisions'/);
    const afterTypes = hook.slice(hook.indexOf('export function useAdminReview'));
    expect(afterTypes).not.toMatch(/scope:\s*'all'/);
  });
});

/**
 * The follow-up pass that reclassified three derived city roll-ups as findings.
 *
 * Asserted over COMMENT-STRIPPED sql: that migration's header quotes every code it registers AND
 * every code it deliberately leaves as a decision, so an unstripped `toContain` passes with the
 * statement deleted.
 */
describe('99991791887070 — city roll-ups are findings, and the mirror set is not', () => {
  const NAME = '99991791887070_city_rollup_findings';
  const raw = (() => {
    const f = readdirSync(MIG_DIR).find((x) => x.startsWith(NAME));
    if (!f) throw new Error(`migration ${NAME} not found -- renumbered without updating me?`);
    return readFileSync(join(MIG_DIR, f), 'utf8');
  })();
  const sql = stripComments(raw);

  it('registers exactly the three derived roll-ups', () => {
    for (const code of [
      'CITY_IDENTITY_AMBIGUOUS',
      'CITY_CATEGORY_UNCLASSIFIED',
      'CITY_LINK_UNRESOLVED',
    ])
      expect(sql).toContain(`'general-review', '${code}'`);
    // Positive control: the insert exists at all, so the three checks above are not vacuous.
    expect(sql).toMatch(/insert into public\.admin_review_finding_codes/);
    // Exactly three rows are registered -- a fourth would be an unreviewed reclassification.
    expect((sql.match(/\('general-review', '/g) ?? []).length).toBe(3);
  });

  it('leaves the codes a human can genuinely decide alone, and asserts it', () => {
    // NAMED_VENUE_UNLINKED is the largest remaining block and must NOT be registered: a human can
    // answer the namesake question the linker refuses by design.
    expect(sql).not.toMatch(/'general-review', 'NAMED_VENUE_UNLINKED'/);
    expect(sql).not.toMatch(/'event-quality', 'NAMED_VENUE_UNLINKED'/);
    expect(sql).not.toMatch(/'general-review', 'CITY_LIFECYCLE_UNRESOLVED'/);
    // P3 is the mirror postcondition: it must name the decision codes and RAISE on them.
    expect(sql).toMatch(/P3 failed[\s\S]{0,160}remain decisions/);
    for (const keep of [
      'NAMED_VENUE_UNLINKED',
      'city lifecycle unresolved',
      'city image reused',
      'venue link candidate',
    ])
      expect(sql).toContain(`('${keep}')`);
  });

  it('pins no count, because the corpus moves between measuring and applying', () => {
    const stmts = sql.slice(0, sql.indexOf('$verify$'));
    // A postcondition asserting a total fails on correct code the next time ingest adds a city.
    expect(sql).not.toMatch(/<>\s*12063|<>\s*6484|<>\s*6483|<>\s*320/);
    expect(stmts).not.toMatch(/\b(12063|6484|6483)\b/);
  });

  it('guards the partition and refuses a degenerate split', () => {
    expect(sql).toMatch(/decisions_total'\)::bigint \+ \(v_res->>'findings_total'\)::bigint/);
    expect(sql).toMatch(
      /findings_total'\)::bigint <= 0 or[\s\S]{0,80}decisions_total'\)::bigint <= 0/,
    );
    // Every postcondition must actually raise, not merely compute.
    expect((sql.match(/raise exception 'P[0-9]/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
