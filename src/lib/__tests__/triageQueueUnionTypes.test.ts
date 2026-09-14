import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `/admin/inbox` returned nothing but
 *
 *   Failed to load triage queue: UNION types text and editorial_entity_type
 *   cannot be matched
 *
 * `get_unified_triage_queue()` builds its result by UNION ALL-ing `SELECT *`
 * over every ACTIVE `triage_sources` view. Sixteen of the seventeen emit `text`
 * for content_type / subtitle / entity_table / status; `triage_src_editorial`
 * emitted the raw column types of `editorial_drafts` — `editorial_entity_type`
 * on three and `editorial_draft_status` on the fourth — so the union could not
 * be PLANNED and the RPC raised 42804.
 *
 * Two properties are what this file exists to pin, because both are what let it
 * survive from `20260801050000` until someone hit it by hand:
 *
 *   1. THE OFFENDING VIEW IS EMPTY. `editorial_drafts` holds 241 rows and 0 at
 *      status='pending'. A plan-time failure does not care how many rows a
 *      member contributes, so a view with nothing in it hid 7,525 real items
 *      (staging 1,238 · dedup-review 1,378 · personality 1,738 · venue 1,197 ·
 *      news 782 · city 829). No queue-depth or row-count check can see this.
 *   2. IT ONLY FAILS UNFILTERED. The RPC narrows the union to the requested
 *      `p_queue_types`, so `?queue=dedup-review` builds a ONE-view union and
 *      works. Only the plain inbox unions all seventeen.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `newsNonImageUrlSeal.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '20260914084603_triage_editorial_view_text_types.sql',
);
const HEALTH = join(ROOT, 'scripts', 'check-pipeline-health.mjs');

/**
 * This migration carries a long explanatory header that repeats the very
 * phrases the assertions look for, and its own `do $verify$` block echoes the
 * strings being asserted — so a statement could be deleted and still be "found"
 * in prose or in the postcondition. Assertions run against comment-stripped
 * text, cut at `do $verify$`. (`mergeCoreReversibility.test.ts` had three
 * vacuous assertions for exactly the second reason.)
 */
function statementsOf(path: string): string {
  const raw = readFileSync(path, 'utf8');
  const body = raw.split(/do \$verify\$/)[0];
  return body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function verifyBlockOf(path: string): string {
  const raw = readFileSync(path, 'utf8');
  const parts = raw.split(/do \$verify\$/);
  return parts.length > 1 ? parts.slice(1).join('do $verify$') : '';
}

const sql = statementsOf(MIGRATION);
const verify = verifyBlockOf(MIGRATION);
const health = readFileSync(HEALTH, 'utf8');

describe('triage_src_editorial emits the same base types as its siblings', () => {
  // The four columns are the whole defect. Each is asserted by name rather than
  // counting `::text` occurrences, because a count passes when the right number
  // of casts land on the wrong columns.
  it.each([['content_type'], ['subtitle'], ['entity_table']])(
    'casts entity_type to text for %s',
    (column) => {
      expect(sql).toMatch(new RegExp(`d\\.entity_type::text\\s+as\\s+${column}`, 'i'));
    },
  );

  it('casts the editorial_draft_status enum to text for status', () => {
    // Fixing only the three columns the error message NAMES would leave `status`
    // to raise the identical 42804 on the very next page load — the
    // "fix one, three remain" trap this repo has hit before.
    expect(sql).toMatch(/d\.status::text\s+as\s+status/i);
  });

  it('leaves no bare enum column in the SELECT list', () => {
    // `d.entity_type as content_type` (no cast) is the exact pre-fix shape.
    expect(sql).not.toMatch(/d\.(entity_type|status)\s+as\s+/i);
  });

  it('DROPs the view rather than CREATE OR REPLACE', () => {
    // CREATE OR REPLACE VIEW cannot change a column's type — Postgres raises
    // "cannot change data type of view column" — so a replace would no-op the
    // whole fix while the migration reported success.
    expect(sql).toMatch(/drop\s+view\s+if\s+exists\s+public\.triage_src_editorial/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+view\s+public\.triage_src_editorial/i);
  });

  it('re-revokes anon and authenticated after the recreate', () => {
    // A dropped view is recreated under public's DEFAULT privileges, which in
    // this database grant anon=awd and authenticated=arwd. Without the REVOKE
    // the recreate silently re-exposes a view 20260801050000 closed on purpose.
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+public\.triage_src_editorial\s+from\s+anon,\s*authenticated/i,
    );
  });
});

describe('triage_queue_signals', () => {
  it('builds its union from triage_sources, like the RPC does', () => {
    // The sentinel must not hand-list the views: a hardcoded list measures a
    // different set than the inbox serves the moment a source is registered or
    // deactivated. Same rule as the embedding drain and its backlog sentinel
    // sharing one `embedding_candidates` view.
    expect(sql).toMatch(/from\s+triage_sources\s*\n?\s*where\s+active/i);
    expect(sql).toMatch(/string_agg\(\s*format\('SELECT \* FROM public\.%I', view_name\)/i);
  });

  it('EXECUTEs the union rather than only comparing types', () => {
    // Running it is what catches a dropped column, a reordered SELECT list and
    // a runtime error too — all of which present as the same dead inbox.
    expect(sql).toMatch(
      /execute\s+'select count\(\*\) from \(' \|\| v_union \|\| '\) u'\s+into\s+v_rows/i,
    );
  });

  it('captures SQLSTATE and the message instead of swallowing the error', () => {
    // The error text is the whole value of the probe: 42804 names the two types,
    // 42703 names a dropped column.
    expect(sql).toMatch(/v_err\s*:=\s*sqlstate\s*\|\|\s*': '\s*\|\|\s*sqlerrm/i);
  });

  it('compares BASE types, never format_type', () => {
    // confidence_score is legitimately numeric, numeric(3,2) and numeric(4,3)
    // across the set and all three unify under UNION. Comparing the formatted
    // type reports six false positives and teaches people to ignore the check.
    expect(sql).toMatch(/a\.atttypid::regtype::text/i);
    expect(sql).not.toMatch(/format_type\s*\(/i);
  });

  it('reports a registered view that no longer exists', () => {
    // `SELECT * FROM public.<gone>` fails at parse time — the same inbox-wide
    // outage by a different route.
    expect(sql).toMatch(/to_regclass\('public\.' \|\| quote_ident\(s\.view_name\)\) is null/i);
    expect(sql).toMatch(/'views_missing'/);
  });

  it('leaves rows NULL on a failed probe', () => {
    // A zero would read as an empty inbox, which is a legitimate state and the
    // opposite of what a failure means. v_rows is declared without a default and
    // only ever assigned inside the successful EXECUTE.
    expect(sql).toMatch(/v_rows\s+bigint;/i);
    expect(sql).not.toMatch(/v_rows\s+bigint\s*:=/i);
  });

  it('is service_role only', () => {
    // It counts rows from views that 20260801050000 revoked from anon and
    // authenticated; a SECURITY DEFINER granted wider would hand those counts
    // back. Same narrowing venue_dup_signals shipped with and its event twin
    // had to be corrected into afterwards.
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.triage_queue_signals\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.triage_queue_signals\(\)\s+to\s+service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.triage_queue_signals\(\)\s+to\s+[^;]*authenticated/i,
    );
  });
});

describe('migration postconditions', () => {
  it('asserts the union executes, not merely that the casts are present', () => {
    expect(verify).toMatch(/probe_ok/);
    expect(verify).toMatch(/raise exception 'triage queue union still does not execute/i);
  });

  it('asserts the recreate did not re-expose the view', () => {
    expect(verify).toMatch(/aclexplode/i);
    expect(verify).toMatch(/raise exception 'triage_src_editorial is exposed to/i);
  });

  it('asserts service_role kept SELECT', () => {
    // The mirror hazard of the REVOKE: over-revoking breaks the health probe
    // and leaves the sentinel reporting nothing.
    expect(verify).toMatch(
      /has_table_privilege\('service_role', 'public\.triage_src_editorial', 'SELECT'\)/i,
    );
  });

  it('refuses to pass when no triage source is active', () => {
    // Zero active sources makes every assertion above vacuous: the union is
    // NULL and the RPC returns an empty page instead of raising.
    expect(verify).toMatch(/views_active.*\n?.*raise exception 'no active triage_sources/i);
  });
});

describe('check-pipeline-health wiring', () => {
  it('calls the probe', () => {
    // Nothing in the database can tell whether any CI job reads this function;
    // the Village Truth Engine shipped a relink batch with no cron and it sat
    // dead for months.
    expect(health).toContain('/rest/v1/rpc/triage_queue_signals');
  });

  it('says so when the RPC is unreachable rather than defaulting to healthy', () => {
    expect(health).toMatch(/triage_queue_signals → HTTP \$\{res\.status\}[^\n]*measured NOTHING/);
  });

  it('treats a missing probe_ok as a broken probe, not a healthy inbox', () => {
    expect(health).toMatch(/typeof tq\?\.probe_ok !== 'boolean'/);
    expect(health).toMatch(/returned no `probe_ok`/);
  });

  it('hard-fails on a union that does not execute', () => {
    expect(health).toMatch(/The unified triage inbox does not load/);
  });

  it('hard-fails on a registered view that does not exist', () => {
    expect(health).toMatch(/registers view\(s\) that do not exist/);
  });

  it('hard-fails when no source is active', () => {
    expect(health).toMatch(/No ACTIVE triage_sources rows/);
  });

  it('describes inbox depth without failing on it', () => {
    // A drained inbox is the goal, so depth can never be a failure condition.
    expect(health).toMatch(/✓ Triage inbox loads: \$\{tq\.rows \?\? 0\}/);
  });
});
