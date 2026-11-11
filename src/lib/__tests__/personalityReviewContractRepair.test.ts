import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrations = join(process.cwd(), 'supabase', 'migrations');

function repairMigration(): string {
  return readFileSync(
    join(migrations, '99991794376327_personality_review_contract_repair.sql'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

describe('personality review contract repair', () => {
  const sql = repairMigration();
  const apply = sql.slice(0, sql.indexOf('create or replace function public.get_admin_counts'));
  const counts = sql.slice(sql.indexOf('create or replace function public.get_admin_counts'));

  it('normalizes object proposals through the registry value key', () => {
    expect(apply).toMatch(/jsonb_typeof\(p_proposed\)\s*=\s*'object'/i);
    expect(apply).toMatch(/v_val\s*:=\s*p_proposed\s*->\s*p_reg\.value_key/i);
    expect(apply).toMatch(/v_text\s*:=\s*p_proposed\s*->>\s*p_reg\.value_key/i);
  });

  it('normalizes scalar proposals without object extraction', () => {
    expect(apply).toMatch(/else[\s\S]*?v_val\s*:=\s*p_proposed/i);
    expect(apply).toMatch(/v_text\s*:=\s*p_proposed\s*#>>\s*'\{\}'/i);
  });

  it('retains the jsonb shallow-merge mode added after the generic function', () => {
    expect(apply).toMatch(/when\s+'jsonb_shallow_merge'/i);
    expect(apply).toContain('jsonb_build_object($1::text, $2::text)');
  });

  it('keeps the internal writer inaccessible to API roles', () => {
    expect(apply).toMatch(
      /revoke\s+(?:all|execute)\s+on\s+function\s+public\._apply_review_value\(public\.review_field_registry,\s*uuid,\s*jsonb\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
  });

  it('defines the personality badge from the canonical triage source', () => {
    expect(counts).toMatch(
      /'quality_personality'\s*,\s*\(select count\(\*\) from public\.triage_src_quality_personality\)/i,
    );
    expect(counts).not.toMatch(/'quality_personality'[\s\S]{0,300}?p\.needs_attention/i);
  });

  it('preserves the admin role gate and event-quality keys', () => {
    expect(counts).toContain('has_any_role_jwt');
    expect(counts).toContain("'quality_event'");
    expect(counts).toContain("'quality_event_overdue'");
  });
});
