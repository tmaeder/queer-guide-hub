import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/99991795379147_resolve_spot.sql', 'utf8')
  .replace(/--[^\n]*/g, '')
  .toLowerCase();

describe('resolve_spot migration', () => {
  it('reads the profile tables, never the ungranted spots spine', () => {
    expect(sql).not.toMatch(/from public\.spots\b/);
    expect(sql).toContain(
      'from public.venues v where v.slug = p_slug and v.duplicate_of_id is null',
    );
  });

  it('prefers a place over an organisation sharing the slug', () => {
    expect(sql.indexOf("then 'place'")).toBeLessThan(sql.indexOf("then 'organization'"));
  });

  it('is a definer function with a pinned search_path, callable by anon and nothing wider', () => {
    expect(sql).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
    expect(sql).toContain('revoke execute on function public.resolve_spot(text) from public');
    expect(sql).toContain(
      'grant execute on function public.resolve_spot(text) to anon, authenticated',
    );
  });
});
