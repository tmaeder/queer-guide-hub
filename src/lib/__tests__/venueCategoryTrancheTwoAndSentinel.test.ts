// Guards 99991791183126_venue_category_tranche_two_and_sentinel.sql and its §25 in
// scripts/check-pipeline-health.mjs.
//
// THE DEFECT THIS EXISTS FOR IS THAT A HEALTHY ENGINE AND A BLIND ONE NOW RETURN THE SAME
// NUMBER. 99991791179763 fixed a visit-once cursor that made run_venue_category_reclassify
// examine ZERO rows for months; verified on prod after it applied, the FIXED engine also
// returns `examined: 0`, because the work is drained. So `mappable_still_other` is the only
// signal separating the two, and three things must stay true of it: the sentinel exists and
// is service_role-only, the health script READS it before process.exit(1) (a section
// appended after the exit prints its failure and still exits 0 — recorded in CLAUDE.md),
// and nobody baselines it.
//
// Assertions run over COMMENT-STRIPPED sql, because the migration's header names every
// refused family and quotes the invariant, so an unstripped toContain passes with the
// statement deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791183126_venue_category_tranche_two_and_sentinel.sql';
const DIR = join(process.cwd(), 'supabase', 'migrations');
const HEALTH = join(process.cwd(), 'scripts', 'check-pipeline-health.mjs');

const raw = readFileSync(join(DIR, MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const health = readFileSync(HEALTH, 'utf8');

const between = (from: string, to: string, hay = sql) => {
  const a = hay.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = hay.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return hay.slice(a, b);
};

const mappingInsert = () =>
  between(
    'insert into public.venue_category_source_tags(provider_tag, category, note) values',
    'on conflict (provider_tag) do nothing;',
  );
const noiseInsert = () =>
  between(
    'insert into public.venue_category_source_tag_noise(token) values',
    'on conflict (token) do nothing;',
  );
const sentinel = () =>
  between('create or replace function public.venue_category_signals()', '$fn$;');
const verify = () => between('do $verify$', 'end $verify$;');

const REFUSED = ['theaters', 'spas', 'ice cream', 'restaurants'];

describe('the migration is present and executable', () => {
  it('exists', () => {
    expect(readdirSync(DIR)).toContain(MIGRATION);
  });

  it('still has statements after comments are stripped', () => {
    // A file whose body is all prose satisfies every negative assertion below.
    expect(sql).toContain('create or replace function public.venue_category_signals()');
    expect(sql.length).toBeGreaterThan(1500);
  });
});

describe('tranche two maps only the two exhaustively-read families', () => {
  it('maps mall to shop and vacation rentals to hotel', () => {
    const ins = mappingInsert();
    expect(ins).toContain("('mall','shop'");
    expect(ins).toContain("('vacation rentals','hotel'");
  });

  it('adds exactly two mapping rows', () => {
    // A third would be a family nobody read end to end.
    expect(mappingInsert().match(/\n\s*\('/g)?.length).toEqual(2);
  });

  it.each(REFUSED)('does not map the refused family %s', (tag) => {
    expect(mappingInsert()).not.toContain(`('${tag}'`);
  });
});

// The P2 block is the span between P1's message and P2's own. Slicing BACKWARDS from
// `indexOf('P2 failed')` by a fixed width goes NEGATIVE when P2 sits near the start, and a
// negative slice start counts from the END of the string — which yields '' and makes every
// assertion scoped to it vacuous. Anchor between two fixed points instead.
const p2Block = () => between('P1 failed', 'P2 failed', verify());

describe('the refusals are enforced, not merely written down', () => {
  it('asserts every refused tag is absent from the MAPPING', () => {
    const p2 = p2Block();
    expect(verify()).toContain('P2 failed');
    for (const tag of REFUSED) expect(p2).toContain(`'${tag}'`);
  });

  it('checks the mapping rather than the data, because fresh data is clean for the wrong reason', () => {
    expect(p2Block()).toContain('from public.venue_category_source_tags');
  });

  it('names every refused tag in the sentinel too', () => {
    const s = sentinel();
    for (const tag of REFUSED) expect(s).toContain(`'${tag}'`);
    expect(s).toContain('rejected_tag_in_mapping');
  });
});

describe('the noise tokens are the leaked prompt labels', () => {
  it("adds 'creative tags' and 'audience'", () => {
    const n = noiseInsert();
    expect(n).toContain("('creative tags')");
    expect(n).toContain("('audience')");
  });

  it('also strips the degenerate refusal strings', () => {
    expect(noiseInsert()).toContain("('creative tags: none mentioned')");
  });
});

describe('the sentinel separates DRAINED from BLIND', () => {
  it('reports mappable_still_other', () => {
    expect(sentinel()).toContain("'mappable_still_other', v_stuck");
  });

  it('computes it as sole-provider-category AND resolvable by the mapping', () => {
    // Either half alone is a different quantity: without the sole-category test it counts
    // grab bags, without the mapping test it counts every unmappable row.
    const s = sentinel();
    const stuck = s.slice(s.indexOf('select count(*) into v_stuck'));
    expect(stuck).toContain("v.category = 'other'");
    expect(stuck).toContain(') = 1');
    expect(stuck).toContain('from public.venue_category_source_tags m');
    expect(stuck).toContain('venue_category_source_tag_noise');
  });

  it('is AGE-gated on the last recorded run, not level-gated', () => {
    // 12,228 of 12,275 venues created in a measured week arrived 17:00-20:00 UTC and are
    // legitimately uncategorised until 03:35, so a bare count > 0 reds the gate on rows
    // minutes old whenever someone dispatches the check manually. The anchor is the RUN,
    // which needs no arbitrary interval.
    const stuck = sentinel().slice(sentinel().indexOf('select count(*) into v_stuck'));
    expect(stuck).toContain('v.created_at <');
    expect(stuck).toContain("a.slug = 'venue_category_reclassify'");
    expect(stuck).toContain('last_run_at');
    // An interval literal here would be the hand-picked window the run anchor replaces.
    expect(stuck).not.toMatch(/interval\s+'\d+\s*(hour|day)/i);
  });

  it('reports the age anchor so a NULL is visible rather than read as clean', () => {
    const s = sentinel();
    expect(s).toContain("'last_reclassify_at'");
    const sec = health.slice(
      health.indexOf('rest/v1/rpc/venue_category_signals'),
      health.lastIndexOf('if (FAILED) {'),
    );
    expect(sec).toContain('last_reclassify_at');
    expect(sec).toMatch(/NEVER RECORDED/);
    // Absence of the anchor WARNS; it is the registry's problem, not the tier's.
    expect(sec).toMatch(/if \(!sig\.last_reclassify_at\) \{[\s\S]{0,500}?console\.warn/);
  });

  it('reports the denominators BEFORE the counts', () => {
    // Zero stuck rows over an emptied mapping is a disabled tier, not a clean corpus.
    const s = sentinel();
    const ret = s.slice(s.indexOf('return jsonb_build_object'));
    expect(ret.indexOf("'mapping_rows'")).toBeGreaterThan(-1);
    expect(ret.indexOf("'mapping_rows'")).toBeLessThan(ret.indexOf("'mappable_still_other'"));
    expect(ret.indexOf("'noise_rows'")).toBeLessThan(ret.indexOf("'mappable_still_other'"));
  });

  it('is service_role only', () => {
    expect(sql).toContain(
      'revoke all on function public.venue_category_signals() from public, anon, authenticated',
    );
    // Anchored to the END of the statement: a bare toContain('… to service_role') still
    // matches `to service_role, authenticated`, which is the leak this asserts against.
    expect(sql).toMatch(
      /grant execute on function public\.venue_category_signals\(\) to service_role;/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.venue_category_signals\(\)[^;]*authenticated/,
    );
  });

  it('asserts its own grants, because a later CREATE OR REPLACE drops them silently', () => {
    const v = verify();
    expect(v).toContain("has_function_privilege('service_role'");
    // Each half must RAISE, and each is asserted by its OWN message. 'P6 failed' appears
    // in both, so a shared-prefix match passes with either branch gutted — and a windowed
    // `[\s\S]{0,200}` after the anon condition reaches the service_role raise 190 chars
    // later, which is how this first passed with the anon branch replaced by `null;`.
    expect(v).toContain("has_function_privilege('anon'");
    expect(v).toContain("has_function_privilege('authenticated'");
    expect(v).toContain(
      "raise exception 'P6 failed: venue_category_signals() is reachable by anon or authenticated'",
    );
    expect(v).toContain(
      "raise exception 'P6 failed: service_role cannot execute venue_category_signals()'",
    );
  });

  it('asserts the invariant is zero and the mapping non-empty', () => {
    const v = verify();
    expect(v).toMatch(/mappable_still_other'\)::int, -1\) <> 0 then/);
    expect(v).toMatch(/mapping_rows'\)::int, 0\) < 5 then/);
  });
});

describe('tranche one is asserted to survive', () => {
  it('fails if the source_tag stamp count drops below 134', () => {
    // Widening the noise list changes which rows count as sole-tag, so a mistake there
    // could strand the 134 rows tranche one categorised.
    const v = verify();
    expect(v).toMatch(/if v_bad < 134 then/);
    expect(v).toContain('P4 failed');
  });

  it('asserts the new tranche actually landed', () => {
    const v = verify();
    expect(v).toContain("'source_tag:mall'");
    expect(v).toContain("'source_tag:vacation rentals'");
    expect(v).toContain('P3 failed');
  });

  it('pins no exact total', () => {
    // The cohort grows whenever ingest adds a tripadvisor listing; 202 -> 205 happened
    // between measuring and validating tranche one.
    const v = verify();
    expect(v).not.toMatch(/v_bad (<>|=) (44|178|4\d)\b/);
  });

  it('drains on examined=0 and is bounded', () => {
    const a = between('do $apply$', 'end $apply$;');
    expect(a).toContain("exit when coalesce((v_res->>'examined')::int, 0) = 0 or v_pass >= 6");
  });

  it('does not neuter its own checks', () => {
    const v = verify();
    expect(v).not.toMatch(/where false/i);
    expect(v).not.toMatch(/if false/i);
    expect(v).not.toMatch(/v_bad\s+int\s*:=\s*0/);
  });
});

describe('the health script reads the sentinel, and does so before it exits', () => {
  it('calls the RPC by URL, not merely names it in a comment', () => {
    expect(health).toContain('rest/v1/rpc/venue_category_signals');
  });

  it('is positioned BEFORE the final process.exit(1)', () => {
    // A section appended after the exit prints its failure and still exits 0.
    //
    // lastIndexOf, NOT indexOf: the script has an early `process.exit(1)` env guard near
    // the top (offset ~969), so indexOf compares against that and this assertion fails on
    // correct code — which is how it failed when first written.
    const call = health.indexOf('rest/v1/rpc/venue_category_signals');
    const exit = health.lastIndexOf('process.exit(1)');
    expect(call).toBeGreaterThan(-1);
    expect(exit).toBeGreaterThan(-1);
    expect(call).toBeLessThan(exit);
    // And that last exit really is the terminal gate, not another early guard.
    expect(health.slice(exit, exit + 400)).toContain('Pipeline health check passed');
  });

  it('hard-fails on the invariant, on a broken probe and on an empty mapping', () => {
    const sec = health.slice(
      health.indexOf('rest/v1/rpc/venue_category_signals'),
      health.indexOf('if (FAILED) {'),
    );
    expect(sec).toMatch(/sig\.mappable_still_other > 0[\s\S]{0,500}?FAILED = true/);
    expect(sec).toMatch(/probe_ok !== true[\s\S]{0,400}?FAILED = true/);
    expect(sec).toMatch(/sig\.mapping_rows > 0\)[\s\S]{0,600}?FAILED = true/);
    expect(sec).toMatch(/rejected_tag_in_mapping > 0[\s\S]{0,600}?FAILED = true/);
  });

  it('carves out only a 404, and treats any other non-ok status as measuring nothing', () => {
    const sec = health.slice(
      health.indexOf('rest/v1/rpc/venue_category_signals'),
      health.lastIndexOf('if (FAILED) {'),
    );
    expect(sec).toContain('res.status === 404');
    // The non-ok branch must set FAILED ITSELF. A loose `[\s\S]{0,400}` window reaches
    // forward to the NEXT branch's `FAILED = true`, so replacing this one with a
    // console.warn passes — which is exactly what it did when first written.
    expect(sec).toMatch(
      /\}\s*else if \(!res\.ok\) \{[\s\S]{0,320}?console\.error[\s\S]{0,200}?\n\s*FAILED = true\n\s*\}/,
    );
    expect(sec).toMatch(/returned HTTP \$\{res\.status\}/);
  });

  it('tells the reader not to baseline the invariant', () => {
    const sec = health.slice(
      health.indexOf('rest/v1/rpc/venue_category_signals'),
      health.indexOf('if (FAILED) {'),
    );
    expect(sec).toMatch(/not baseline/i);
  });
});
