import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('correction pipeline routing', () => {
  it('keeps corrections in the submissions triage view', () => {
    const sql = read('supabase/migrations/20260724150000_triage_sources_registry.sql');
    const exclusions = sql.match(/content_type\s+NOT IN\s*\(([^)]+)\)/i)?.[1] ?? '';

    expect(exclusions).toContain('feedback');
    expect(exclusions).not.toContain('correction');
  });

  it('does not bridge corrections into ingestion staging', () => {
    const source = read('supabase/functions/source-community-submissions/index.ts');
    const targetTableMap =
      source.match(/const TARGET_TABLE:[\s\S]*?=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(targetTableMap).toContain('venue:');
    expect(targetTableMap).not.toContain('correction');
  });

  it('widens anonymous inserts without widening anonymous reads', () => {
    const sql = read('supabase/migrations/99991791473539_community_submission_corrections.sql');

    expect(sql).toMatch(/with check \(content_type in \('feedback', 'correction'\)\)/i);
    expect(sql).not.toMatch(/create policy[^;]+for select/is);
    expect(sql).toMatch(/v_correction_read_policies/i);
    expect(sql).toMatch(/coalesce\(qual, ''\) ilike '%correction%'/i);
  });
});
