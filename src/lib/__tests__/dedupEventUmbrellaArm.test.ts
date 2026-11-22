import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The umbrella dedup arm (migration 99991795346738) must stay REVIEW-ONLY.
 *
 * Festivals exist as several top-level multi-day rows (Darklands x4, IML x3,
 * BeefDip x3). The arm pairs two multi-day rows in one city whose spans overlap
 * and whose titles contain each other once years and the city name are
 * stripped. "Darklands" vs "Darklands After Parties" is an umbrella and its
 * child, not a duplicate, so the title alone cannot decide it: a human must.
 *
 * Two doors lead to an unreviewed merge and both are guarded here:
 *   1. the sweep's own is_auto, which must be the literal FALSE for this arm;
 *   2. run_dedup_review_autoapprove, which approves every OPEN pair above its
 *      default 0.80 — so the arm's 0.70 is not enough on its own, and the
 *      autoapprove excludes the reason by name.
 *
 * Text checks over COMMENT-STRIPPED SQL: the header discusses every term below
 * in prose, so a raw match passes with the statement deleted. The runtime
 * checks (existing arms' counts unchanged before vs after, no auto umbrella
 * pair) live in the migration itself, where they can reach the corpus.
 */

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '99991795346738_event_dedup_umbrella_overlap_arm.sql',
);

const raw = readFileSync(FILE, 'utf8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

/** The umbrella CTEs injected into the event branch. */
function umbrellaCtes(): string {
  const s = sql.indexOf('umb_live as (');
  const e = sql.indexOf('$u$;', s);
  expect(s, 'umb_live CTE present').toBeGreaterThan(-1);
  expect(e, 'umbrella CTE literal terminated').toBeGreaterThan(s);
  return sql.slice(s, e);
}

/** The UNION ALL branch that turns umbrella pairs into candidate rows. */
function unionBranch(): string {
  const s = sql.indexOf("v_union constant text := 'from armed'");
  const e = sql.indexOf(';', sql.indexOf("limit 1200'", s));
  expect(s, 'union literal present').toBeGreaterThan(-1);
  return sql.slice(s, e);
}

describe('umbrella_overlap_containment candidates', () => {
  const cte = umbrellaCtes();

  it('only considers multi-day rows bounded at 31 days', () => {
    expect(cte).toContain("e.end_date - e.start_date > interval '20 hours'");
    expect(cte).toContain("e.end_date - e.start_date <= interval '31 days'");
  });

  it('pairs rows in one city whose spans overlap', () => {
    expect(cte).toContain('a.city_id = b.city_id');
    expect(cte).toContain('a.start_date < b.end_date and b.start_date < a.end_date');
  });

  it('skips pairs that have both ended', () => {
    expect(cte).toContain('greatest(a.end_date, b.end_date) >= now()');
  });

  it('keys on the title minus years and the city name, by containment', () => {
    expect(cte).toContain('(19|20)[0-9]{2}');
    expect(cte).toMatch(/lower\(extensions\.unaccent\(ci\.name\)\)/);
    expect(cte).toContain('length(a.uk) >= 5 and length(b.uk) >= 5');
    expect(cte).toContain('position(a.uk in b.uk) > 0 or position(b.uk in a.uk) > 0');
  });

  it('never re-proposes a pair that is already parent and child', () => {
    expect(cte).toContain('a.parent_event_id is distinct from b.id');
    expect(cte).toContain('b.parent_event_id is distinct from a.id');
  });

  it('leaves pairs an existing arm already produced to that arm', () => {
    expect(cte).toMatch(
      /not exists \(select 1 from armed x where x\.a_id = a\.id and x\.b_id = b\.id\)/,
    );
  });
});

describe('umbrella_nested_duplicate candidates', () => {
  function nested(): string {
    const s = sql.indexOf('umb_nested as (');
    const e = sql.indexOf('$u$;', s);
    expect(s, 'umb_nested CTE present').toBeGreaterThan(-1);
    return sql.slice(s, e);
  }

  it('only looks at existing parent -> child links under a bounded umbrella', () => {
    const n = nested();
    expect(n).toContain('join public.events p on p.id = c.parent_event_id');
    expect(n).toContain("p.end_date - p.start_date > interval '20 hours'");
    expect(n).toContain("p.end_date - p.start_date <= interval '31 days'");
    expect(n).toContain('greatest(c.end_date, p.end_date) >= now()');
  });

  it('requires the child to add nothing, or to be wide and contain the parent', () => {
    const n = nested();
    expect(n).toContain('position(k.ck in k.pk) > 0');
    expect(n).toMatch(
      /position\(k\.pk in k\.ck\) > 0\s+and extract\(epoch from c\.end_date - c\.start_date\)\s+>= 0\.5 \* extract\(epoch from p\.end_date - p\.start_date\)/,
    );
    expect(n).toContain('length(k.ck) >= 5 and length(k.pk) >= 5');
  });

  it('treats gay/weekend as filler but not parade', () => {
    const n = nested();
    expect(n).toContain('\\m(gay|weekend)\\M');
    expect(n).not.toMatch(/parade/);
  });

  it('is emitted review-only and leaves pairs an existing arm produced', () => {
    expect(unionBranch()).toMatch(/false, 0\.70::numeric,'\s*\|\| ' ''umbrella_nested_duplicate''/);
    expect(nested()).toMatch(
      /x\.a_id = least\(c\.id, p\.id\) and x\.b_id = greatest\(c\.id, p\.id\)/,
    );
  });

  it('can be approved: the link is cleared only for this reason, and stamped', () => {
    const s = sql.indexOf('v_pre constant text := $p$');
    const pre = sql.slice(s, sql.indexOf('$p$;', s));
    expect(pre).toContain(
      "if q.entity_type = 'event' and q.reason = 'umbrella_nested_duplicate' then",
    );
    expect(pre).toContain('set parent_event_id = null');
    expect(pre).toContain("'unlinked_for_merge'");
    expect(pre).toContain("'parent_event_id', e.parent_event_id");
    expect(pre).toContain(
      'where e.id in (v_keep, v_drop) and e.parent_event_id in (v_keep, v_drop)',
    );
    expect(sql).toMatch(/= 0 then\s+raise exception 'P8 failed/);
  });
});

describe('the arm is review-only', () => {
  const u = unionBranch();

  it('emits is_auto = FALSE and a confidence below every auto threshold', () => {
    // Anchored on the reason: two union branches share the select prefix, so a
    // bare match is satisfied by the other branch's FALSE.
    expect(u).toMatch(/b_title, false, 0\.70::numeric,'\s*\|\| ' ''umbrella_overlap_containment''/);
    expect(u).toContain('from umbrella');
  });

  it('asserts at apply time that no umbrella pair is auto-eligible', () => {
    expect(sql).toContain(
      "count(*) filter (where is_auto and reason in (''umbrella_overlap_containment'', ''umbrella_nested_duplicate''))",
    );
    expect(sql).toMatch(/if v_auto <> 0 then\s+raise exception 'P3 failed/);
  });

  it('excludes the reason from run_dedup_review_autoapprove by name', () => {
    expect(sql).toContain(
      "AND coalesce(q.reason, '''') NOT IN (''umbrella_overlap_containment'', ''umbrella_nested_duplicate'')",
    );
    expect(sql).toMatch(/= 0 then\s+raise exception 'P6 failed/);
  });
});

describe('the patch cannot move the existing arms', () => {
  it('replaces inside the event branch only, at exactly-once anchors', () => {
    expect(sql).toContain('replace(replace(v_q, v_anchor_a, v_umbrella), v_anchor_b, v_union)');
    expect(sql).not.toMatch(/replace\(replace\(v_src, v_anchor_a/);
    expect(sql).toMatch(/if v_n <> 1 then raise exception 'anchor A/);
    expect(sql).toMatch(/if v_n <> 1 then raise exception 'anchor B/);
  });

  it('compares per-arm counts before and after and raises on any difference', () => {
    expect(sql).toMatch(
      /if \(v_after - 'umbrella_overlap_containment' - 'umbrella_nested_duplicate'\) <> v_before then\s+raise exception 'P0 failed/,
    );
  });
});

describe('reviewer payload', () => {
  it('carries the span and the programme on both payload builders', () => {
    const start = sql.indexOf('function public._dedup_event_cluster_side');
    const side = sql.slice(start, sql.indexOf('$function$;', start));
    for (const f of ['start_date', 'end_date', 'programme_children', 'part_of', 'source']) {
      expect(side, `cluster side carries ${f}`).toContain(`'${f}'`);
    }
    expect(sql).toContain("''programme_children'', (select count(*) from public.events k");
    expect(sql).toContain("''part_of'', (select p.title from public.events p");
  });

  it('shows them in the compare frame', () => {
    const tsx = readFileSync(
      join(process.cwd(), 'src', 'components', 'admin', 'triage', 'DedupPairCompare.tsx'),
      'utf8',
    );
    const line = tsx.split('\n').find((l) => l.trimStart().startsWith('event:')) ?? '';
    expect(line).toContain("'end_date'");
    expect(line).toContain("'programme_children'");
    expect(line).toContain("'part_of'");
  });
});
