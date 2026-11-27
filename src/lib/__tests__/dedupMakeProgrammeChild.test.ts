import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/99991795355288_dedup_review_make_programme_child.sql',
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('dedup review: make programme child', () => {
  it('stamps provenance as admin:dedup-review before writing parent_event_id', () => {
    const stamp = sql.indexOf(
      "set_config('app.programme_link_source', 'admin:dedup-review', true)",
    );
    const write = sql.indexOf('set parent_event_id = p_parent_id');
    expect(stamp).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(stamp);
  });

  it('closes the pair as rejected so the sweep never re-queues it', () => {
    expect(sql).toMatch(/set status = 'rejected'/);
  });

  it('only accepts one of the two ids in the pair as the parent', () => {
    expect(sql).toMatch(/if p_parent_id = q\.keep_id then\s+v_child := q\.drop_id;/);
    expect(sql).toMatch(/elsif p_parent_id = q\.drop_id then\s+v_child := q\.keep_id;/);
  });

  it('does not touch run_event_programme_link or bypass the depth guard', () => {
    expect(sql).not.toMatch(/run_event_programme_link/);
    expect(sql).not.toMatch(/trg_events_programme_depth|disable trigger/i);
  });

  it('routes parent_id through triage_action and keeps the function off authenticated', () => {
    expect(sql).toMatch(/PERFORM api_private\.link_dedup_review_as_child\(p_item_id/);
    expect(sql).toMatch(
      /revoke all on function api_private\.link_dedup_review_as_child\(uuid, uuid, text\) from public, anon, authenticated/,
    );
  });
});
