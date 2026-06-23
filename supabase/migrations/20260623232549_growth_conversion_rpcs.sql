-- Recovered orphan migration (drift repair, 2026-06-23).
--
-- This migration was originally applied to prod via the Supabase MCP with an
-- apply-time version (20260623232549) but its SQL was never committed as a file,
-- leaving a remote-only history row that made `supabase db push` skip with a
-- drift warning. The SQL below is recovered VERBATIM from
-- schema_migrations.statements for version 20260623232549 (md5
-- a8a7b342e74bb927c169dae3ebbbcd85). Because the file version equals the version
-- already in remote history, committing it de-orphans the row with no history
-- edit and no re-run. All three functions are CREATE OR REPLACE / idempotent.
--
-- Admin growth + conversion analytics RPCs (save -> trip -> booking funnel,
-- affiliate revenue trend, engagement cohort retention).

create or replace function public.growth_funnel_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_saves bigint;
  v_trip_adds bigint;
  v_booking_clicks bigint;
  v_impressions bigint;
begin
  if not has_role_jwt('admin'::app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  p_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_since := now() - make_interval(days => p_days);

  select
    (select count(*) from event_favorites      where created_at >= v_since)
  + (select count(*) from city_favorites        where created_at >= v_since)
  + (select count(*) from country_favorites     where created_at >= v_since)
  + (select count(*) from tag_favorites         where created_at >= v_since)
  + (select count(*) from marketplace_favorites where created_at >= v_since)
  + (select count(*) from news_favorites        where created_at >= v_since)
  into v_saves;

  select count(*) into v_trip_adds
  from user_activity_events
  where event_type = 'trip.created' and created_at >= v_since;

  select
    count(*) filter (where kind = 'click'),
    count(*) filter (where kind = 'impression')
  into v_booking_clicks, v_impressions
  from affiliate_clicks
  where clicked_at >= v_since;

  return jsonb_build_object(
    'window_days', p_days,
    'saves', v_saves,
    'trip_adds', v_trip_adds,
    'booking_clicks', v_booking_clicks,
    'impressions', v_impressions,
    'save_to_trip_pct',     round(100.0 * v_trip_adds      / nullif(v_saves, 0), 1),
    'trip_to_booking_pct',  round(100.0 * v_booking_clicks / nullif(v_trip_adds, 0), 1),
    'affiliate_ctr_pct',    round(100.0 * v_booking_clicks / nullif(v_impressions, 0), 1),
    'generated_at', now()
  );
end;
$$;

create or replace function public.affiliate_revenue_trend(
  p_days integer default 30,
  p_bucket text default 'day'
)
returns table(bucket date, clicks bigint, impressions bigint, ctr numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_bucket text;
begin
  if not has_role_jwt('admin'::app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  p_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_since := now() - make_interval(days => p_days);
  v_bucket := case lower(coalesce(p_bucket, 'day'))
                when 'week' then 'week'
                when 'month' then 'month'
                else 'day'
              end;

  return query
  select
    date_trunc(v_bucket, ac.clicked_at)::date as bucket,
    count(*) filter (where ac.kind = 'click')      as clicks,
    count(*) filter (where ac.kind = 'impression') as impressions,
    round(
      100.0 * count(*) filter (where ac.kind = 'click')
      / nullif(count(*) filter (where ac.kind = 'impression'), 0),
      1
    ) as ctr
  from affiliate_clicks ac
  where ac.clicked_at >= v_since
  group by 1
  order by 1;
end;
$$;

create or replace function public.engagement_cohort_retention(p_weeks integer default 8)
returns table(cohort_week date, week_offset integer, users bigint, retained bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_floor date;
begin
  if not has_role_jwt('admin'::app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  p_weeks := greatest(1, least(coalesce(p_weeks, 8), 52));
  v_floor := (date_trunc('week', now()) - make_interval(weeks => p_weeks))::date;

  return query
  with first_seen as (
    select e.user_id, date_trunc('week', min(e.created_at))::date as cohort_week
    from user_activity_events e
    where e.user_id is not null
    group by e.user_id
  ),
  cohort as (
    select user_id, cohort_week from first_seen where cohort_week >= v_floor
  ),
  sizes as (
    select c.cohort_week, count(*)::bigint as users from cohort c group by c.cohort_week
  ),
  activity as (
    select
      c.cohort_week,
      (extract(epoch from (date_trunc('week', e.created_at)::date - c.cohort_week)) / 604800)::int as week_offset,
      e.user_id
    from cohort c
    join user_activity_events e on e.user_id = c.user_id
  )
  select s.cohort_week, a.week_offset, s.users, count(distinct a.user_id)::bigint as retained
  from sizes s
  join activity a on a.cohort_week = s.cohort_week
  where a.week_offset >= 0
  group by s.cohort_week, a.week_offset, s.users
  order by s.cohort_week, a.week_offset;
end;
$$;

grant execute on function public.growth_funnel_summary(integer) to authenticated;
grant execute on function public.affiliate_revenue_trend(integer, text) to authenticated;
grant execute on function public.engagement_cohort_retention(integer) to authenticated;