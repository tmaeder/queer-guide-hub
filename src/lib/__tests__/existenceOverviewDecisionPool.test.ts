import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991791026196_existence_overview_decision_pool.sql,
// 99991791026120_existence_review_queue_decisions.sql and the
// /admin/content/liveness surface that reads them.
//
// The Liveness page showed four numbers per type and only three came from the same
// population. "Dead signals (120d)" sat under three decision counts and was read as
// their pool; it was 43,258 on events where the engine's own reading is 3, because it
// counted (a) signal kinds the decision cannot act on -- 43,253 of them `date_lifecycle`,
// i.e. "this event's date has passed" -- and (b) history rather than state, so a link
// broken in August and alive ever since still counted for 120 days.
//
// Four things must not drift:
//   1. `date_lifecycle` stays OUT of the strong set. Putting it in would make 43k
//      deliberately-past Wayback events archive-eligible.
//   2. the strong array has ONE source, held against run_existence_decision's own copy
//      by a postcondition on the DEPLOYED body -- that function is ~250 lines and the
//      sole writer of archive decisions, so it is deliberately not restated.
//   3. the blind-spot COUNT and the blind-spot LIST come from one predicate, or the
//      denominator the card now prints is unfalsifiable.
//   4. the two queue decisions stay evidence-bearing, reversible and row-scoped.
//
// Assertions run over comment-stripped SQL and are scoped to the half of the statement
// they are about: both headers quote the defect, the numbers and the reason strings in
// prose, so an unscoped `toContain` passes with the executable line deleted.

const POOL = '99991791026196_existence_overview_decision_pool.sql';
const DECISIONS = '99991791026120_existence_review_queue_decisions.sql';

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8');
const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const poolRaw = read(POOL);
const pool = strip(poolRaw);
const decisionsRaw = read(DECISIONS);
const decisions = strip(decisionsRaw);

const hook = readFileSync(join(process.cwd(), 'src/hooks/useExistenceEngine.ts'), 'utf8');

/** AdminLiveness with comments removed. Both the JSX comment explaining why the
 *  any-kind count is NOT rendered and the hook's doc comment name that key, so an
 *  unstripped read makes "does not render it" pass against code that does. */
const page = readFileSync(join(process.cwd(), 'src/pages/admin/AdminLiveness.tsx'), 'utf8')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** The verify block only, so a postcondition assertion cannot be satisfied by the body. */
const poolVerify = pool.slice(pool.indexOf('do $verify$'));
/** The overview body only. */
const overviewBody = pool.slice(
  pool.indexOf('create or replace function public.existence_overview'),
  pool.indexOf('do $verify$'),
);
/** The helper's DEFINITION only. `comment on function` is executable SQL, not a
 *  `--` comment, so the strip above leaves it — and that COMMENT names
 *  date_lifecycle in order to explain its absence, which would make the
 *  "excludes date_lifecycle" assertion fail against correct code. */
const helperBody = pool.slice(
  pool.indexOf('create or replace function public.existence_strong_signal_kinds'),
  pool.indexOf('comment on function public.existence_strong_signal_kinds'),
);
const blindSpotsFn = pool.slice(
  pool.indexOf('create or replace function public.existence_blind_spots('),
  pool.indexOf('create or replace function public.existence_overview'),
);

describe('existence strong-signal set', () => {
  it('excludes date_lifecycle — the whole defect', () => {
    expect(helperBody).not.toMatch(/date_lifecycle/);
  });

  it('names exactly the six kinds run_existence_decision acts on', () => {
    for (const kind of [
      'http_status',
      'jsonld_status',
      'content_closed_phrase',
      'external_wikidata',
      'price_availability',
      'admin',
    ]) {
      expect(helperBody).toContain(`'${kind}'`);
    }
  });

  it('is the only source the overview reads — no second hardcoded array', () => {
    expect(overviewBody).toContain('public.existence_strong_signal_kinds()');
    // A literal array in the overview body would be the second copy that drifts.
    expect(overviewBody).not.toMatch(/array\s*\[\s*'http_status'/i);
  });

  it('asserts date_lifecycle is absent as a postcondition, not only in the helper', () => {
    expect(poolVerify).toMatch(
      /'date_lifecycle'\s*=\s*any\s*\(\s*public\.existence_strong_signal_kinds\(\)\s*\)/,
    );
    expect(poolVerify).toMatch(/P1b failed/);
  });
});

describe('drift guard against run_existence_decision', () => {
  it('reads the DEPLOYED body, not the repo file', () => {
    // A later CREATE OR REPLACE from an older migration is exactly the drift being
    // guarded, and a repo-file read cannot see it.
    expect(poolVerify).toContain('pg_get_functiondef');
    expect(poolVerify).toContain("p.proname = 'run_existence_decision'");
  });

  it('fails when the function is absent rather than passing vacuously', () => {
    expect(poolVerify).toMatch(/if v_src is null then\s*\n\s*raise exception 'P1 failed/);
  });

  it('iterates the helper rather than a restated list', () => {
    expect(poolVerify).toMatch(/foreach v_kind in array public\.existence_strong_signal_kinds\(\)/);
  });

  it('does not restate run_existence_decision', () => {
    // Restating a 250-line sole-writer to consume the helper is a bigger risk than
    // the duplication the drift check covers.
    expect(pool).not.toMatch(/create or replace function public\.run_existence_decision/i);
  });
});

describe('blind spots: one predicate behind both the count and the list', () => {
  it('extracts the predicate into existence_blind_spot_ids', () => {
    expect(pool).toContain('create or replace function public.existence_blind_spot_ids');
  });

  it('rewrites existence_blind_spots to consume it instead of restating it', () => {
    expect(blindSpotsFn).toContain("public.existence_blind_spot_ids('venue')");
    expect(blindSpotsFn).toContain("public.existence_blind_spot_ids('event')");
    expect(blindSpotsFn).toContain("public.existence_blind_spot_ids('marketplace')");
    expect(blindSpotsFn).not.toMatch(/v\.website is null and \(v\.latitude is null/);
  });

  it('keeps the role gate and the signature the hook reads', () => {
    expect(blindSpotsFn).toContain("has_any_role_jwt(array['admin','moderator']::app_role[])");
    expect(blindSpotsFn).toContain(
      'returns table(entity_type text, entity_id uuid, label text, slug text)',
    );
  });

  it('counts blind spots through the same function', () => {
    expect(overviewBody).toContain('public.existence_blind_spot_ids(null)');
  });

  it('asserts count-equals-list per type against the predicate, not a literal', () => {
    expect(poolVerify).toMatch(
      /\(o->>'blind_spots'\)::int\s*\n?\s*<>\s*\(select count\(\*\) from public\.existence_blind_spot_ids\(t\.k\)\)/,
    );
  });
});

describe('the two new helpers are unreachable by client roles', () => {
  it('revokes PUBLIC, which is what CREATE FUNCTION granted', () => {
    expect(pool).toContain(
      'revoke all on function public.existence_strong_signal_kinds() from public',
    );
    expect(pool).toContain(
      'revoke all on function public.existence_blind_spot_ids(text) from public',
    );
  });

  it('asserts the absence, because the anon-grant sweep cannot see these', () => {
    // check-anon-function-grants.mjs is scoped to VOLATILE definers; one of these is
    // IMMUTABLE sql and the other STABLE invoker, so neither is covered.
    expect(poolVerify).toContain('has_function_privilege');
    expect(poolVerify).toMatch(/P5 failed/);
    for (const role of ['anon', 'authenticated']) expect(poolVerify).toContain(`('${role}')`);
  });
});

describe('overview payload', () => {
  it('keeps the old quantity under its own key rather than deleting it', () => {
    expect(overviewBody).toContain("'dead_signals_any_kind'");
  });

  it('reduces to the latest signal per kind, as the decision does', () => {
    expect(overviewBody).toMatch(/distinct on \(s\.entity_type, s\.entity_id, s\.signal_kind\)/);
    expect(overviewBody).toMatch(
      /order by s\.entity_type, s\.entity_id, s\.signal_kind, s\.observed_at desc/,
    );
  });

  it('excludes a dead signal when a fresher alive signal guards the entity', () => {
    const currentPool = overviewBody.slice(
      overviewBody.indexOf("'dead_signal_entities'"),
      overviewBody.indexOf("'archive_eligible'"),
    );
    expect(currentPool).toMatch(/g\.strong_dead >= 1/);
    expect(currentPool).toMatch(
      /fresh_alive_at is null or g\.fresh_alive_at <= g\.newest_dead_at/,
    );
  });

  it('reports archive_eligible with the decision predicate, not just strong_dead >= 2', () => {
    const eligible = overviewBody.slice(overviewBody.indexOf("'archive_eligible'"));
    expect(eligible).toMatch(/g\.strong_dead >= 2/);
    expect(eligible).toMatch(/fresh_alive_at is null or g\.fresh_alive_at <= g\.newest_dead_at/);
  });

  it('asserts the direction pool <= any-kind, which holds with equality', () => {
    // venue and marketplace only ever see http_status, so equality is legitimate and
    // a difference-based assertion would fail on correct code.
    expect(poolVerify).toMatch(
      /\(o->>'dead_signal_entities'\)::int > \(o->>'dead_signals_any_kind'\)::int/,
    );
  });
});

describe('review-queue decisions', () => {
  it('is scoped to the two flagged ids, never a blanket archive', () => {
    expect(decisions).toContain('4b67012e-8a10-44cc-b039-87790f5704eb');
    expect(decisions).toContain('eef37b46-df37-48fa-8ac4-2e23846c826c');
    // Driven by a VALUES list joined to open flags; no unscoped update of either table.
    expect(decisions).not.toMatch(/update public\.(events|marketplace_listings)\s+set/i);
  });

  it('only decides rows that still carry an OPEN flag, so it no-ops instead of aborting', () => {
    const loop = decisions.slice(decisions.indexOf('for rec in'), decisions.indexOf('loop\n'));
    expect(loop).toMatch(/a\.action\s*=\s*'flag'/);
    expect(loop).toMatch(/a\.reverted_at is null/);
  });

  it('records the verification AND keeps the engine’s own reading', () => {
    const body = decisions.slice(decisions.indexOf('perform public._existence_apply_archive'));
    expect(body).toMatch(
      /rec\.signals \|\| jsonb_build_object\('admin_verification', rec\.evidence\)/,
    );
  });

  it('carries a positive control per row — host alive, not just page dead', () => {
    // "the page is gone" and "the site is down" are the same 4xx from one request.
    expect(decisions).toContain("'control_host'");
    expect(decisions).toContain("'control_siblings'");
    expect(decisions).toContain("'control_catalog'");
    expect(decisions).toMatch(/'verified_status',\s*410/);
    expect(decisions).toMatch(/'verified_status',\s*404/);
  });

  it('asserts replayability, not merely that the rows were archived', () => {
    const verify = decisions.slice(decisions.indexOf('do $verify$'));
    // prev_state->>'status' = 'active' is what a reopen restores; a null or
    // already-archived snapshot would be an archive nothing could undo.
    expect((verify.match(/prev_state->>'status' = 'active'/g) ?? []).length).toBe(2);
  });

  it('does not key its postconditions on its own evidence stamp', () => {
    // Keying P2/P3 on admin_verification would RAISE on a concurrent session's
    // equally-correct disposition and abort db push for the whole repo.
    // Scoped to each postcondition's own SELECT: a fixed-width window before the
    // RAISE reaches back into the DO block, which legitimately writes the stamp.
    const p2 = decisions.slice(
      decisions.indexOf('from public.events e'),
      decisions.indexOf('P2 failed'),
    );
    const p3 = decisions.slice(
      decisions.indexOf('from public.marketplace_listings m'),
      decisions.indexOf('P3 failed'),
    );
    expect(p2).toContain("e.status = 'cancelled'");
    expect(p2).not.toContain('admin_verification');
    expect(p3).toContain("m.status = 'inactive'");
    expect(p3).not.toContain('admin_verification');
  });

  it('scopes the evidence check so it is vacuous only when nothing is stamped', () => {
    const p4 = decisions.slice(decisions.indexOf("a.signals ? 'admin_verification'"));
    expect(p4).toMatch(/\(a\.signals->>'strong_dead'\) is null/);
  });
});

describe('AdminLiveness surface', () => {
  it('does not render the any-kind count — that was the defect', () => {
    expect(page).not.toContain('dead_signals_any_kind');
  });

  it('renders the corrected pool and the eligible count', () => {
    expect(page).toContain('o?.dead_signal_entities');
    expect(page).toContain('o?.archive_eligible');
  });

  it('prints a denominator for the blind-spot sample', () => {
    expect(page).toContain('blindSpotsTotal');
    expect(page).toMatch(/Showing \{blindSpotsShown\} of \{blindSpotsTotal/);
    // Guarded so it does not claim "showing 0 of 0" on an empty or loading list.
    expect(page).toMatch(/blindSpotsShown > 0 && blindSpotsTotal > blindSpotsShown/);
  });

  it('sums the denominator from the overview, not from the rendered list', () => {
    expect(page).toMatch(/overview\.data\?\.\[t\]\?\.blind_spots/);
  });

  it('types the new keys so a renamed key fails typecheck', () => {
    for (const k of ['archive_eligible', 'dead_signals_any_kind', 'blind_spots']) {
      expect(hook).toMatch(new RegExp(`${k}:\\s*number`));
    }
  });
});
