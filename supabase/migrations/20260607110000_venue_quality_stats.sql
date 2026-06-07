-- Live venue content-quality observability.
--
-- The stored venues.quality_score is computed once at ingest against staging data and never
-- recomputed, so it does not reflect the live row (avg ~59 while 80-97% of content fields are
-- empty). This adds:
--   1. venue_completeness(...) — an immutable, field-weighted 0-100 completeness score over the
--      actual venue columns. Reusable by a quality_score backfill and the stats RPC.
--   2. venue_quality_stats() — a pure-SQL aggregate (no writes) returning live field coverage,
--      regression KPIs, coverage gaps, and DB headroom, to power an admin VenueQualityPanel.

create or replace function public.venue_completeness(
  p_description text,
  p_latitude numeric,
  p_longitude numeric,
  p_category text,
  p_tags text[],
  p_hours jsonb,
  p_website text,
  p_phone text,
  p_email text,
  p_images text[],
  p_relevance numeric
) returns smallint
language sql immutable set search_path to 'public' as $$
  select (
      case when p_latitude is not null and p_longitude is not null then 15 else 0 end
    + case when length(coalesce(p_description,'')) >= 20 then 15 else 0 end
    + case when coalesce(lower(p_category),'') not in ('', 'other', 'unknown') then 12 else 0 end
    + case when coalesce(array_length(p_tags,1),0) >= 1 then 10 else 0 end
    + case when p_hours is not null and p_hours <> '{}'::jsonb and p_hours <> 'null'::jsonb then 10 else 0 end
    + case when coalesce(p_website,'') <> '' then 8 else 0 end
    + case when coalesce(p_phone,'') <> '' or coalesce(p_email,'') <> '' then 10 else 0 end
    + case when coalesce(array_length(p_images,1),0) >= 1 then 15 else 0 end
    + case when p_relevance is not null then 5 else 0 end
  )::smallint;
$$;

comment on function public.venue_completeness is
  'Field-weighted live completeness 0-100 for a venue. Reusable for quality_score backfill + stats.';

create or replace function public.venue_quality_stats()
returns jsonb
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with live as (
    select * from public.venues where closed_at is null and duplicate_of_id is null
  ),
  scored as (
    select *, public.venue_completeness(
      description, latitude, longitude, category, tags, hours, website, phone, email, images, lgbti_relevance_score
    ) as completeness
    from live
  ),
  gaps as (
    select coalesce(nullif(btrim(city),''),'Unknown') as city, count(*) as thin_count
    from scored where completeness < 50
    group by 1 order by count(*) desc limit 8
  )
  select jsonb_build_object(
    'live_venues', (select count(*) from live),
    'avg_completeness', (select round(avg(completeness),1) from scored),
    'avg_stored_quality', (select round(avg(quality_score),1) from live),
    'missing', jsonb_build_object(
      'images',      (select count(*) from live where images is null or array_length(images,1) is null),
      'hours',       (select count(*) from live where hours is null or hours = '{}'::jsonb or hours = 'null'::jsonb),
      'tags',        (select count(*) from live where tags is null or array_length(tags,1) is null),
      'category',    (select count(*) from live where coalesce(lower(category),'') in ('', 'other', 'unknown')),
      'description', (select count(*) from live where length(coalesce(description,'')) < 20),
      'phone_email', (select count(*) from live where coalesce(phone,'')='' and coalesce(email,'')=''),
      'website',     (select count(*) from live where coalesce(website,'')=''),
      'coords',      (select count(*) from live where latitude is null or longitude is null)
    ),
    'needs_attention',     (select count(*) from live where needs_attention),
    'never_refreshed',     (select count(*) from live where last_refreshed_at is null),
    'relevance_null',      (select count(*) from live where lgbti_relevance_score is null),
    'stale_quality_score', (select count(*) from scored where abs(coalesce(quality_score,0) - completeness) >= 15),
    'coverage_gaps',       (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'thin_count', thin_count)), '[]'::jsonb) from gaps),
    'db_mb',               round(pg_database_size(current_database())/1024.0/1024.0),
    'db_headroom_mb',      round(6300 - pg_database_size(current_database())/1024.0/1024.0)
  );
$$;

comment on function public.venue_quality_stats is
  'Live venue content-quality summary (coverage, regression KPIs, gaps, DB headroom). Read-only.';

grant execute on function public.venue_completeness(text,numeric,numeric,text,text[],jsonb,text,text,text,text[],numeric) to authenticated, service_role;
grant execute on function public.venue_quality_stats() to authenticated, service_role;
