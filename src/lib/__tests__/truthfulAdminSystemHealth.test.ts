import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789933292_truthful_admin_system_health.sql'),
  'utf8',
);

describe('truthful admin system health', () => {
  it('does not flag classifier-confirmed unmatched news as missing coverage', () => {
    expect(sql).toContain("enrichment_status->'category'->>'via'");
    expect(sql).toContain("<> 'unmatched'");
  });

  it('hides a pipeline error only after a later successful run of that pipeline', () => {
    expect(sql).toContain('recovery.pipeline_id = failed_run.pipeline_id');
    expect(sql).toContain("recovery.status = 'completed'");
    expect(sql).toContain('recovery.completed_at > e.created_at');
  });
});
