/**
 * Guards for the item-level audit layer.
 *
 * Every assertion here is scoped to the ONE statement it is about. This file's
 * subjects quote their own defects verbatim in comments and in RAISE messages —
 * `entity_audit_timeline` names `audit:llm_calls_unlinked` in both the gap CTE
 * and the verification block — so an assertion over the whole file matches the
 * prose while the executable line is gone. That is the vacuous-assertion class
 * this repo has recorded repeatedly; the `stripComments` + statement-scoping
 * below is what stops it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

const TIMELINE = '99991790360304_entity_audit_timeline.sql';
const REGISTRY = '99991790360298_audit_entity_registry.sql';
const EXPLANATIONS = '99991790358904_pipeline_explanations_registry.sql';
const SIGNALS = '99991790362392_audit_inspector_signals.sql';
const TRIAGE = '99991790362096_triage_confirm_and_org_link.sql';

function read(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/**
 * Comments removed LINE-ANCHORED. A mid-line `--` inside a string literal (and
 * these files contain several) must not truncate the statement.
 */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
}

/** The body of the function, excluding the migration's own verify blocks. */
function functionBody(sql: string): string {
  const stripped = stripComments(sql);
  const end = stripped.indexOf('do $verify$');
  return end === -1 ? stripped : stripped.slice(0, end);
}

describe('migration files exist under the versions the code and docs cite', () => {
  it('all five are present', () => {
    const files = readdirSync(MIGRATIONS);
    for (const f of [TIMELINE, REGISTRY, EXPLANATIONS, SIGNALS, TRIAGE]) {
      expect(files, `${f} is missing — a renumber moved it without updating this test`).toContain(f);
    }
  });
});

describe('entity_audit_timeline is a definer with a gate', () => {
  const body = functionBody(read(TIMELINE));

  it('is SECURITY DEFINER', () => {
    expect(body).toMatch(/security\s+definer/i);
  });

  it('gates on admin or moderator as its first act, and raises 42501', () => {
    // Scoped to the guard, not to the whole file: the header explains the gate
    // at length and would satisfy a bare search on its own.
    const guard = body.slice(body.indexOf('begin'), body.indexOf('p_limit :='));
    expect(guard).toContain('has_any_role_jwt');
    expect(guard).toContain("'42501'");
  });

  it('raises 22023 for an unregistered entity type rather than returning empty', () => {
    // An empty result for a typo reads as "nothing ever happened to this record".
    expect(body).toMatch(/if not found then[\s\S]{0,300}errcode\s*=\s*'22023'/i);
  });

  it('clamps p_limit — an unbounded limit is a timeout vector', () => {
    expect(body).toMatch(/p_limit\s*:=\s*least\(greatest\(/i);
  });

  it('carries its own statement_timeout below the 8s gateway ceiling', () => {
    const ms = body.match(/set\s+statement_timeout\s+to\s+'(\d+)ms'/i);
    expect(ms, 'no function-level statement_timeout').not.toBeNull();
    expect(Number(ms![1])).toBeLessThan(8000);
  });

  it('carries #variable_conflict use_column', () => {
    // RETURNS TABLE makes every output column a plpgsql variable, and this
    // function's outputs are named `source`, `field`, `kind`, `raw`. Without
    // the directive it fails at RUN time with 42702 — not at CREATE time,
    // because plpgsql bodies are parsed and not planned. It shipped broken once
    // for exactly this reason.
    expect(body).toContain('#variable_conflict use_column');
  });
});

describe('the timeline tells the truth about what it cannot show', () => {
  const body = functionBody(read(TIMELINE));
  const gapCte = body.slice(body.indexOf('gaps as ('), body.indexOf('all_ev as ('));

  it('emits coverage-gap rows in bucket 0', () => {
    expect(gapCte).toContain('0::smallint');
    expect(gapCte).toContain("'gap'::text");
  });

  it('states the four gaps that are true of every record', () => {
    for (const key of [
      'audit:llm_calls_unlinked',
      'audit:revisions_begin_at_enablement',
      'audit:automation_unlinked',
      'audit:no_node_timing',
    ]) {
      expect(gapCte, `${key} is not emitted by the gap CTE`).toContain(key);
    }
  });

  it('makes the shape-dependent gaps conditional on the registry, not hardcoded', () => {
    expect(gapCte).toMatch(/audit:no_provenance_surface'\s+where r\.provenance_mode\s*=\s*'none'/);
    expect(gapCte).toMatch(/audit:provenance_undated'\s+where r\.provenance_mode\s*=\s*'jsonb_column'/);
    expect(gapCte).toMatch(/audit:no_consensus_table'\s+where r\.consensus_table is null/);
  });

  it('never truncates gap rows away with p_limit', () => {
    // They sort first (bucket 0) AND the limit carries headroom for all of them.
    expect(body).toMatch(/limit p_limit \+ \d+/);
  });
});

describe('explanation_status is three-valued', () => {
  const body = functionBody(read(TIMELINE));

  it('distinguishes not_applicable from unregistered', () => {
    // Two-valued conflates "this kind explains itself" with "we have a key and
    // nobody wrote prose for it". Only the second must look broken.
    const branch = body.slice(body.indexOf('case when a.ekey is null'));
    expect(branch).toContain("'not_applicable'");
    expect(branch).toContain("'unregistered'");
    expect(branch).toContain("'registered'");
  });

  it('joins explanations with LEFT JOIN so an unmatched key survives as a row', () => {
    expect(body).toMatch(/left join public\.pipeline_explanations pe/i);
  });

  it('never derives prose from the key', () => {
    // The whole point. `pe.title` may be NULL; there must be no coalesce to a
    // prettified key anywhere in the select list.
    const selectList = body.slice(body.indexOf('from all_ev a') - 900, body.indexOf('from all_ev a'));
    expect(selectList).not.toMatch(/coalesce\(\s*pe\.(title|body)/i);
    expect(selectList).not.toMatch(/replace\(\s*a\.ekey/i);
  });
});

describe('per-branch limits — a global limit after an unbounded union is the timeout path', () => {
  const body = functionBody(read(TIMELINE));

  it('bounds every scanning branch, not just the final select', () => {
    // Counted, not spot-checked: a single surviving `limit p_limit` would
    // satisfy a bare search while nine branches ran unbounded.
    const occurrences = body.match(/limit p_limit\b/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(8);
  });
});

describe('the registry declares the venues asymmetry and is bound to the catalog', () => {
  const sql = read(REGISTRY);
  const body = functionBody(sql);

  it('venues are side_table, not jsonb_column', () => {
    // venues has no field_provenance column. A generic reader returns NULL for
    // it and makes every venue timeline look provenance-clean.
    expect(body).toMatch(/'venues',\s*'venues',\s*'venue',\s*null,\s*'venue_merge_audit',\s*\n?\s*'side_table'/);
  });

  it('milestones declare enrichment_mode none', () => {
    // The one type with field_provenance and NO enrichment_status. Assuming the
    // two travel together made the helper read a column that does not exist.
    expect(body).toMatch(/'milestones',\s*'milestones',\s*null,\s*'milestone',\s*'entity_merge_audit',\s*\n?\s*'jsonb_column',\s*'none'/);
  });

  it('asserts BOTH directions of provenance against the catalog', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain("r.provenance_mode = 'jsonb_column' and not exists");
    // The inverse is the one that bites: claiming 'none' while the column exists
    // means real provenance is skipped and the timeline looks clean.
    expect(verify).toContain("r.provenance_mode <> 'jsonb_column' and exists");
  });

  it('asserts BOTH directions of enrichment against the catalog', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain("r.enrichment_mode = 'jsonb_column' and not exists");
    expect(verify).toContain("r.enrichment_mode = 'none' and exists");
  });

  it('asserts the mirror: every review type has a registry row', () => {
    // Without this, a review type with no row renders no review section, which
    // reads as "nobody ever proposed a change to this record". It caught a real
    // omission (marketplace) on the first run.
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain('review_field_registry rfr');
    expect(verify).toContain('but no audit_entity_registry row claims it');
  });
});

describe('the provenance helpers raise rather than return null', () => {
  const body = functionBody(read(REGISTRY));

  it('field_provenance_of raises 22023 for an unknown table', () => {
    const fn = body.slice(body.indexOf('function public.field_provenance_of'));
    const scoped = fn.slice(0, fn.indexOf('function public.enrichment_status_of'));
    expect(scoped).toMatch(/else raise exception[\s\S]{0,200}'22023'/);
  });

  it('enrichment_status_of raises 22023 for an unknown table', () => {
    const fn = body.slice(body.indexOf('function public.enrichment_status_of'));
    expect(fn).toMatch(/else raise exception[\s\S]{0,200}'22023'/);
  });

  it('field_provenance_of has no venues branch', () => {
    // venues has no such column; a branch for it would not compile, and a
    // silent NULL would be worse.
    const fn = body.slice(body.indexOf('function public.field_provenance_of'));
    const scoped = fn.slice(0, fn.indexOf('function public.enrichment_status_of'));
    expect(scoped).not.toMatch(/when 'venues'/);
  });

  it('enrichment_status_of has no milestones branch', () => {
    const fn = body.slice(body.indexOf('function public.enrichment_status_of'));
    expect(fn).not.toMatch(/when 'milestones'/);
  });
});

describe('pipeline_explanations cannot be seeded with a non-explanation', () => {
  const body = functionBody(read(EXPLANATIONS));

  it('requires a body of at least 20 characters', () => {
    expect(body).toMatch(/body\s+text not null check \(length\(btrim\(body\)\) >= 20\)/);
  });

  it('constrains the key shape to <producer>:<code>', () => {
    expect(body).toMatch(/key ~ '\^\[a-z0-9_-\]\+:\[A-Za-z0-9_\.-\]\+\$'/);
  });

  it('is not readable by anon', () => {
    expect(body).toContain('revoke all on public.pipeline_explanations from anon');
  });

  it('binds the signal vocabulary to the live CHECK constraints', () => {
    // The anti-drift half. Without it a new signal_type renders as a raw code
    // forever with nothing reporting it.
    const verify = read(EXPLANATIONS).slice(read(EXPLANATIONS).indexOf('do $verify$'));
    expect(verify).toContain('pg_constraint');
    expect(verify).toContain('signal types present in a live CHECK but unexplained');
  });

  it('seeds with ON CONFLICT DO NOTHING so a replay cannot clobber a rewrite', () => {
    const inserts = body.match(/on conflict \(key\) do nothing/g) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the sentinel reports whether it looked, separately from what it found', () => {
  const body = functionBody(read(SIGNALS));

  it('returns probe_ok', () => {
    expect(body).toContain("'probe_ok', true");
    expect(body).toContain("'probe_ok', false");
  });

  it('reports registry_rows so zero drift over an empty registry is not read as clean', () => {
    expect(body).toContain("'registry_rows'");
  });

  it('is revoked from authenticated', () => {
    // A definer aggregate granted to authenticated is granted to every member.
    expect(body).toMatch(/revoke all on function public\.audit_inspector_signals\(\) from public, anon, authenticated/);
    expect(body).toMatch(/grant execute on function public\.audit_inspector_signals\(\) to service_role/);
  });

  it('checks the role gate the anon-grants script is blind to', () => {
    expect(body).toContain("'timeline_has_role_gate'");
  });
});

describe('the health script wires the sentinel in and fails closed', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

  it('calls the RPC by URL, not merely by name in a comment', () => {
    // Anchor on the call that does the work: a name in prose satisfies a bare
    // search while the fetch is gone.
    expect(script).toContain('rpc/audit_inspector_signals');
  });

  it('treats a non-404 failure as a hard fail', () => {
    const section = script.slice(script.indexOf('rpc/audit_inspector_signals'));
    expect(section).toMatch(/A broken probe must not read as a clean corpus/);
  });

  it('carves out only the 404 undeployed case', () => {
    const section = script.slice(script.indexOf('rpc/audit_inspector_signals'));
    expect(section).toMatch(/res\.status === 404/);
    expect(section).toMatch(/absence of a check, not absence of defects/i);
  });
});

describe('triage: p_confirm reaches all five quality queues', () => {
  const sql = read(TRIAGE);
  const body = functionBody(sql);

  it('drops the two-argument wrappers rather than overloading them', () => {
    // A defaulted third argument alongside the 2-arg form leaves two candidates
    // and PostgREST resolves BY ARGUMENT NAME — a named call then 42725s.
    for (const fn of [
      'approve_venue_review',
      'approve_village_review',
      'approve_personality_review',
      'approve_marketplace_review',
    ]) {
      expect(body, `${fn} 2-arg form not dropped`).toContain(`drop function if exists public.${fn}(uuid, text)`);
    }
  });

  it('forwards p_confirm into approve_entity_review in every wrapper', () => {
    const calls = body.match(/select public\.approve_entity_review\(p_id, p_note, p_confirm\);/g) ?? [];
    expect(calls.length).toBe(4);
  });

  it('asserts the reached state, so a re-run that changes nothing still passes', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain('p_id uuid, p_note text, p_confirm boolean');
    expect(verify).toContain('a named call would be ambiguous');
  });

  it('refuses to guess when the substitution anchor is not unique', () => {
    const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('do $verify$'));
    expect(patch).toContain('refusing to guess');
    expect(patch).toContain('could not find a unique editorial branch');
  });
});
