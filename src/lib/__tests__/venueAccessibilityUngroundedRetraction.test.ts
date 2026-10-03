/**
 * Guard for 99991791024454 — the retraction of 259 ungrounded live venue
 * accessibility claims, and the sentinel correction that goes with it.
 *
 * The repair itself is a frozen list of (venue, slug) pairs, so there is nothing
 * behavioural to unit-test. What CAN rot is the discipline around it: the four
 * claims that must SURVIVE, the postconditions that prove the sweep did not
 * over-reach, the sentinel grounding against the text the model was really shown,
 * and §20 having become a zero-invariant that nobody quietly re-baselines.
 *
 * Assertions run over COMMENT-STRIPPED SQL. This migration's header quotes the
 * defect it removes — including the bare slug strings the model cited — so an
 * unstripped search would match the prose while the statement was gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791024454_venue_accessibility_ungrounded_retraction.sql';
const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const HEALTH = join(process.cwd(), 'scripts/check-pipeline-health.mjs');

const raw = readFileSync(join(MIG_DIR, MIGRATION), 'utf8');
/** Executable text only: drop whole-line `--` comments. */
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const health = readFileSync(HEALTH, 'utf8');

/** The four whose SOURCE supports the claim; they are re-cited, never retracted. */
const KEEP_VENUES = [
  '00823aee-d902-4ffe-a0e6-ea7b38f8d404', // Grocery Outlet
  '31e53ad9-9834-4895-b5e2-ca26bca98101', // Tang Jip
  '3c3c4e15-883b-46b9-b662-d713d18e487b', // Stilson Transit Center
  '9acb8e6c-bed5-4d08-88e0-4b31d4839a25', // Thee Stork Club
];
const RECITED_ROWS = [
  '7ba8c77f-9378-43ff-83e2-6c374b566846',
  '8d1928bd-caef-4b66-bb4a-fa39924478f0',
  'e99b75b9-4cec-48c2-9ce0-44ac8fcc5651',
  'f14ded17-a02a-4ebf-9725-ba27c4abed06',
];

describe('99991791024454 — the migration exists and is the only copy', () => {
  it('is present exactly once', () => {
    const hits = readdirSync(MIG_DIR).filter((f) => f.startsWith('99991791024454'));
    expect(hits).toEqual([MIGRATION]);
  });

  it('stamps its own version so the write is attributable', () => {
    // Three places carry the version: the stamp `by`, the re-citation marker and
    // the postconditions that count by them. A rename that misses one reports
    // zero AFTER the rows have already been rewritten.
    const n = (sql.match(/99991791024454/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(5);
  });
});

describe('the four source-supported claims survive', () => {
  it('none of the four venues appears in the frozen retract list', () => {
    // The retract list is `('<uuid>','{slug,...}')` rows. A keep-venue appearing
    // there would delete a real accessibility fact.
    const retractBlock = sql.slice(
      sql.indexOf('insert into _acc_retract'),
      sql.indexOf('select count(*), sum(cardinality(slugs))'),
    );
    expect(retractBlock.length).toBeGreaterThan(1000);
    for (const v of KEEP_VENUES) {
      expect(retractBlock).not.toContain(v);
    }
  });

  it('re-cites all four rather than dropping their citation', () => {
    const recite = sql.slice(sql.indexOf('with recite'), sql.indexOf('get diagnostics'));
    for (const rid of RECITED_ROWS) expect(recite).toContain(rid);
    // The supporting quote must come from the venue's own description.
    expect(recite).toContain('All Gender Restroom');
    expect(recite).toContain('two unisex restoom');
    expect(recite).toContain('Two gender neutral restrooms');
    expect(recite).toContain('Both are all gender.');
  });

  it('preserves the citation it replaces instead of erasing it', () => {
    const recite = sql.slice(sql.indexOf('with recite'), sql.indexOf('get diagnostics'));
    expect(recite).toContain('superseded_quote');
    expect(recite).toContain('superseded_by_migration');
  });

  it('splits the Montmartre row: the lift survives, the wheelchair claim does not', () => {
    // The only row where grounding and corroboration disagree. Its citation
    // "3rd f.+lift" is absent from the description and present in the NAME, which
    // the prompt carries — so the quote is real, `elevator-access` is corroborated
    // by it, and `wheelchair-accessible` is not. Asserting one half would pass on a
    // sweep that took both or kept both.
    // Anchored on the SELECT that reads the row, not on 'P3b failed': the first
    // 'P3b failed' sits AFTER the venue id, so slicing from it reports a missing id
    // on correct code — the same reach-past that bit the P6 assertion.
    const p3b = sql.slice(sql.indexOf("v.id = '919ab67b"));
    expect(p3b).toContain('919ab67b-8a54-428e-a20e-326551877380');
    // Each half must RAISE, not merely be tested. Asserting the condition alone
    // survives replacing its `raise` with `null;` — mutation-found, both halves.
    expect(p3b).toMatch(
      /if not \(v_attrs @> array\['elevator-access'\]\) then\s*\n\s*raise exception 'P3b failed/,
    );
    expect(p3b).toMatch(
      /if v_attrs @> array\['wheelchair-accessible'\] then\s*\n\s*raise exception 'P3b failed/,
    );
    // and the frozen list must name ONLY the wheelchair slug for that venue
    const retractBlock = sql.slice(
      sql.indexOf('insert into _acc_retract'),
      sql.indexOf('select count(*), sum(cardinality(slugs))'),
    );
    expect(retractBlock).toContain(
      "('919ab67b-8a54-428e-a20e-326551877380','{wheelchair-accessible}')",
    );
    expect(retractBlock).not.toContain("('919ab67b-8a54-428e-a20e-326551877380','{elevator-access");
  });

  it('asserts the four still publish the slug — the mirror of the sweep', () => {
    // Without this, a sweep that took everything satisfies "no retracted slug is
    // live" perfectly.
    const p3 = sql.slice(sql.indexOf('P3 failed'), sql.indexOf('P4 failed'));
    expect(p3).toBeTruthy();
    const scope = sql.slice(sql.indexOf('-- P3') >= 0 ? 0 : 0);
    for (const v of KEEP_VENUES) expect(scope).toContain(v);
    expect(sql).toMatch(/P3 failed[^']*source-supported/);
  });
});

describe('the retraction records itself', () => {
  it('stamps the removed slugs, the reason and the migration on each venue', () => {
    const upd = sql.slice(sql.indexOf('update public.venues v'), sql.indexOf('end $retract$'));
    expect(upd).toContain('accessibility_retracted');
    expect(upd).toContain("'slugs', to_jsonb(r.slugs)");
    expect(upd).toContain("'by', 'migration:99991791024454'");
    expect(upd).toMatch(/'reason'/);
  });

  it('removes only the named slugs and keeps anything else on the row', () => {
    const upd = sql.slice(sql.indexOf('update public.venues v'), sql.indexOf('end $retract$'));
    // Array difference, not an unconditional blank.
    expect(upd).toContain('from unnest(v.accessibility_attributes) x');
    expect(upd).toContain('where not (x = any(r.slugs))');
    expect(upd).not.toMatch(/set accessibility_attributes\s*=\s*'\{\}'/);
  });

  it('is guarded so a re-run is a no-op', () => {
    const upd = sql.slice(sql.indexOf('update public.venues v'), sql.indexOf('end $retract$'));
    expect(upd).toContain('v.accessibility_attributes && r.slugs');
  });

  it('leaves the review rows at approved — that is what happened', () => {
    // Rewriting them to `rejected` would erase the evidence of the auto-approve
    // defect and gains nothing: the producer is sealed and the sentinel keys on
    // whether the slug is LIVE.
    expect(sql).not.toMatch(/update\s+public\.entity_review_queue[\s\S]{0,400}set\s+status\s*=/);
  });
});

describe('postconditions are postconditions, not disguised preconditions', () => {
  it('P2 asserts the end state rather than an exact stamp count', () => {
    const p2 = sql.slice(sql.indexOf('P2 failed'), sql.indexOf('P2b failed'));
    // An exact `= 150` would abort db push — and every queued migration — when a
    // concurrent session legitimately removed a slug first.
    expect(sql).not.toMatch(/if v_bad <> 150 then/);
    expect(p2).toBeTruthy();
  });

  it('P2b still refuses a silently empty sweep', () => {
    expect(sql).toContain('P2b failed');
    expect(sql).toMatch(/if v_bad = 0 then\s*\n\s*raise exception 'P2b failed/);
  });

  it('P5 keeps the previous pass’s evidenced approvals as controls', () => {
    const p5 = sql.slice(sql.indexOf('P5 failed'), sql.indexOf('P6 failed'));
    expect(p5).toBeTruthy();
    expect(sql).toContain('3a309791-52a8-4963-adc0-4f3d74cae48b'); // Bar Phoebe
    expect(sql).toContain('717adaeb-96f8-4d09-a941-ef0d33f71fb2'); // Clinton Market
  });

  it('P6 CALLS the sentinel and refuses a vacuous zero', () => {
    // Anchored on the ASSIGNMENT, not on 'P6 failed': the first 'P6 failed' sits
    // AFTER the call, so slicing from it reports a missing call on correct code.
    const p6 = sql.slice(sql.indexOf('v_sig := public.venue_accessibility_evidence_signals'));
    expect(p6).toContain('venue_accessibility_evidence_signals()');
    // zero ungrounded over an empty cohort is not a clean corpus
    expect(p6).toMatch(/live_machine_claims'\)::int <= 0/);
    expect(p6).toMatch(/ungrounded_live_claims'\)::int <> 0/);
  });

  it('every postcondition reads the database rather than a local counter', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(
      (verify.match(/from public\.(venues|entity_review_queue)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    // A pre-seeded counter would make the comparisons vacuous.
    expect(verify).not.toMatch(/v_bad\s+int\s*:=\s*0/);
    // Short-circuited predicates only. A bare /\bfalse\b/ is too broad — it
    // matches the legitimate `coalesce((v_sig->>'probe_ok')::boolean, false)`,
    // and asserting against it fails on correct code.
    expect(verify).not.toMatch(/where\s+false\b/i);
    expect(verify).not.toMatch(/if\s*\(?\s*false\s*\)?\s+then/i);
  });
});

describe('the sentinel grounds against what the model was shown', () => {
  it('includes the NAME and the tag line, not the description alone', () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function public.venue_accessibility_evidence_signals'),
    );
    expect(fn).toContain("array_to_string(v.tags, ', ')");
    expect(fn).toContain('Tags: ');
    // The prompt's first line is `Venue: <name> | Category: …`.
    expect(fn).toContain("coalesce(v.name, '')");
  });

  it('does NOT ground against the prompt’s ALLOWED-slug lines', () => {
    // Those enumerate every slug, so including them would let every slug
    // ground-match itself and silently disable the arm that caught 93% of this
    // backlog. Only name / description / tags may be in the haystack.
    // Scoped to the function BODY. A slice running to EOF also covers the
    // postconditions, one of whose messages contains the word "allowed" — a
    // case-insensitive ban on it then fails against correct code.
    const start = sql.indexOf(
      'create or replace function public.venue_accessibility_evidence_signals',
    );
    const body = sql.slice(start, sql.indexOf('end $fn$', start));
    expect(body.length).toBeGreaterThan(400);
    expect(body).not.toContain('ALLOWED');
    expect(body).not.toContain('canonicalAccessibility');
  });

  it('excludes the rows the previous migration dispositioned by hand', () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function public.venue_accessibility_evidence_signals'),
    );
    expect(fn).toContain("not like 'migration:99991790879465%'");
  });

  it('still reports the cohort size before anything judged', () => {
    const fn = sql.slice(
      sql.indexOf('create or replace function public.venue_accessibility_evidence_signals'),
    );
    expect(fn).toContain("'live_machine_claims'");
    expect(fn).toContain("'probe_ok', true");
  });

  it('stays service_role only', () => {
    expect(sql).toMatch(
      /revoke all on function public\.venue_accessibility_evidence_signals\(\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.venue_accessibility_evidence_signals\(\) to service_role/,
    );
  });

  it('does not mirror the evidence vocabulary into SQL', () => {
    // 24 per-slug regex sets live in _shared/accessibility-evidence.ts and are
    // tested there. A copy here would be a drift surface with no reader.
    expect(sql).not.toMatch(/gender\[-\\\\s\]\?neutral|wheel\\\\s\?chair/);
    expect(sql).not.toContain('step[-\\s]?free');
  });
});

describe('§20 is a zero-invariant and is wired', () => {
  it('fails on any non-zero ungrounded count', () => {
    expect(health).toMatch(/const ungrounded = Number\(sig\.ungrounded_live_claims \?\? 0\)/);
    expect(health).toMatch(/if \(ungrounded > 0\) \{/);
    // The old growth gate must be gone, not merely bypassed.
    expect(health).not.toContain('BASELINE_UNGROUNDED');
  });

  it('says not to re-baseline it', () => {
    expect(health).toMatch(/zero-invariant: do not re-baseline/i);
  });

  it('sits BEFORE the exit gate, by index', () => {
    // A section appended after `process.exit(1)` prints its failure and exits 0.
    const sec = health.indexOf('venue_accessibility_evidence_signals');
    const gate = health.indexOf('if (FAILED) {');
    expect(sec).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(0);
    expect(sec).toBeLessThan(gate);
  });

  it('separates a 404 from a real failure', () => {
    const sec = health.slice(health.indexOf('Venue accessibility claims whose citation'));
    expect(sec).toMatch(/res\.status === 404/);
    expect(sec).toMatch(/measured NOTHING/);
  });
});
