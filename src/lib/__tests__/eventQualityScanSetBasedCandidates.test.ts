import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991793475747_event_quality_scan_candidates_set_based';
const sql = readFileSync(
  resolve(__dirname, `../../../supabase/migrations/${MIGRATION}.sql`),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const patch = code.slice(code.indexOf('do $patch$'), code.indexOf('$patch$;'));
const verify = code.slice(code.indexOf('do $verify$'), code.indexOf('$verify$;'));
const decl = (name: string) => {
  const start = patch.indexOf(`${name} constant text :=`);
  return patch.slice(start, patch.indexOf(';', patch.indexOf("'", start + name.length + 20) + 1));
};

describe('run_event_quality_scan set-based candidates', () => {
  it('patches the live definition instead of restating it', () => {
    expect(patch).toContain(
      "pg_get_functiondef('api_private.run_event_quality_scan(integer,text,boolean)'::regprocedure)",
    );
    expect(code).not.toMatch(/create or replace function api_private\.run_event_quality_scan/i);
  });

  it('aborts unless every fragment matches exactly once', () => {
    expect(patch).toMatch(/foreach v_new in array array\[v_from_old, v_issue_old, v_dq_old\] loop/);
    expect(patch).toMatch(/if v_count <> 1 then\s+raise exception/);
  });

  it('computes non-scan issue touches once, grouped per event, excluding the scan detector', () => {
    const ns = decl('v_from_new');
    expect(ns).toContain("where qi.detector<>''event-quality-scan''");
    expect(ns).toContain('group by qi.event_id');
    expect(ns).toMatch(/max\(greatest\(qi\.last_seen_at,coalesce\(qi\.resolved_at/);
    expect(ns).toContain("coalesce(qi.reviewed_at,''epoch''::timestamptz))) as touched_at");
  });

  it('computes open event dedup pairs once, over both sides of the pair', () => {
    const ns = decl('v_from_new');
    expect(ns).toContain('cross join lateral (values (dq.keep_id),(dq.drop_id)) x(event_id)');
    expect(ns).toContain("where dq.entity_type=''event'' and dq.status=''open''");
    expect(ns).toContain('max(dq.created_at) as created_at');
    expect(ns).toContain('left join ns on ns.event_id=e.id left join dqx on dqx.event_id=e.id');
  });

  it('replaces each correlated sub-query with a comparison against assessed_at', () => {
    expect(decl('v_issue_new')).toContain("E'        or ns.touched_at>qc.assessed_at\\n'");
    expect(decl('v_dq_new')).toContain("E'        or dqx.created_at>qc.assessed_at\\n'");
  });

  it('applies all three replacements', () => {
    expect(patch).toContain(
      'replace(replace(replace(v_src, v_from_old, v_from_new), v_issue_old, v_issue_new), v_dq_old, v_dq_new)',
    );
    expect(patch).toMatch(/execute v_new;/);
  });

  it('verifies the old sub-queries are gone, the joins present and the definer kept', () => {
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed']) expect(verify).toContain(p);
    expect(verify).toMatch(/and prosecdef\s*\)\s*then\s+raise exception 'P3 failed/);
  });
});
