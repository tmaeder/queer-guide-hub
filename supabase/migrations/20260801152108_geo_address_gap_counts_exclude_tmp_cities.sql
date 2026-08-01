-- Recovered from supabase_migrations.schema_migrations.statements.
-- Applied to production via MCP apply_migration, which stamps the version from its
-- own call timestamp — so it landed at 20260801152108 (2026-08-01), sorting BELOW the
-- 20260807* files this work intended, and left a remote-only version. db push then
-- skipped ENTIRELY and no merged migration applied. This file restores the pairing.

create or replace function public.geo_address_gap_counts()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'venues', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.venues where duplicate_of_id is null
    ),
    'events', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null
                                                 and (end_date >= current_date
                                                      or (end_date is null and start_date >= current_date)))
      ) from public.events where duplicate_of_id is null
    ),
    'hotels', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.hotels
    ),
    'organizations', (
      select jsonb_build_object(
        'live',               count(*),
        'missing_country_id', count(*) filter (where country_id is null),
        'missing_state',      count(*) filter (where state is null),
        'missing_postal',     count(*) filter (where postal_code is null)
      ) from public.organizations where duplicate_of_id is null
    ),
    'cities', (
      select jsonb_build_object(
        'live',                count(*),
        'missing_region_name', count(*) filter (where region_name is null),
        'geocodable_gap',      count(*) filter (
                                 where region_name is null
                                   and latitude is not null
                                   and (slug is null or slug not like 'tmp-%'))
      ) from public.cities where duplicate_of_id is null
    ),
    'queue', (
      select jsonb_build_object(
        'depth',              count(*) filter (where attempts < 4),
        'parked',             count(*) filter (where attempts >= 4),
        'oldest_enqueued_at', min(enqueued_at) filter (where attempts < 4)
      ) from public.geo_address_queue
    )
  );
$$;

comment on function public.geo_address_gap_counts() is
  'Address-completeness gap matrix per entity type plus queue health. Powers GeoAddressQualityPanel on /admin/quality. cities.geocodable_gap excludes tmp- placeholder stubs, which the backfill skips.';

revoke all on function public.geo_address_gap_counts() from public, anon;
grant execute on function public.geo_address_gap_counts() to authenticated, service_role;
