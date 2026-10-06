import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261006123425_cruising_map_presence.sql'),
  'utf8',
);
const accessSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261006123533_cruising_spots_authenticated_only.sql'),
  'utf8',
);

describe('cruising map presence migration', () => {
  it('requires authentication and denies anonymous execution', () => {
    expect(sql).toContain("raise exception 'authentication required'");
    expect(sql).toContain(
      'revoke all on function public.cruising_presence_areas() from public, anon',
    );
    expect(sql).toContain('anonymous role can execute cruising_spots_search');
    expect(sql).toContain('to authenticated');
  });

  it('serves cruising spots only through an authenticated, category-scoped RPC', () => {
    expect(sql).toContain('create or replace function public.cruising_spots_search');
    expect(sql).toContain('if auth.uid() is null then');
    expect(sql).toContain("where v.category = 'cruising'");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain('limit greatest(1, least(coalesce(p_limit, 40), 1200))');
    expect(accessSql).toContain('as restrictive');
    expect(accessSql).toContain('to anon');
    expect(accessSql).toContain("category is distinct from 'cruising'");
  });

  it('returns aggregate city areas without exposing person identifiers or coordinates', () => {
    const signature =
      sql.match(
        /cruising_presence_areas\(\)[\s\S]*?returns table\(([\s\S]*?)\)\nlanguage plpgsql/,
      )?.[1] ?? '';
    expect(signature).toContain('city_id uuid');
    expect(signature).toContain('active_count bigint');
    expect(signature).not.toContain('user_id');
    expect(signature).not.toContain('profile_id');
    expect(sql).toContain('group by c.id, c.name, c.slug, c.latitude, c.longitude');
  });

  it('requires explicit safety acknowledgement and expiring visibility', () => {
    expect(sql).toContain("raise exception 'safety acknowledgement required'");
    expect(sql).toContain('cm.expires_at > now()');
    expect(sql).toContain('greatest(15, least(coalesce(p_duration_minutes, 60), 240))');
  });
});
