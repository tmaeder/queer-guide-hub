import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve('supabase/migrations/99991791350000_intimate_discovery_kink_filters.sql'),
  'utf8',
);

describe('intimate discovery kink filters', () => {
  it('keeps cross-user kink filtering behind the existing visibility ladder', () => {
    expect(migration).toContain('public.kink_access_rank(v_viewer, ip.id)');
    expect(migration).toContain('public.kink_tier_rank(kv.tier)');
    expect(migration).toContain("kr.rating in ('favorite', 'like', 'curious', 'maybe')");
  });

  it('preserves both unified-tag and legacy intimate profile matches', () => {
    expect(migration).toContain('ki.unified_tag_slug = any(ip.into_tags)');
    expect(migration).toContain("replace(ki.unified_tag_slug, 'intimate-', '')");
  });

  it('does not expose blocked or ineligible profiles', () => {
    expect(migration).toContain('public.is_intimate_eligible(ip.id)');
    expect(migration).toContain('not public.intimate_is_blocked(ip.id, v_viewer)');
  });
});
