-- Fix engagement_cohort_retention runtime error caught by the prod e2e.
--
-- The RETURNS TABLE OUT names (cohort_week, week_offset, users, retained) collided
-- with the CTE column names inside the body, so the RETURN QUERY raised
-- 42702 "column reference \"cohort_week\" is ambiguous" — but ONLY when executed
-- past the has_role_jwt('admin') gate. execute_sql smoke tests (no admin JWT) hit
-- 42501 before the query ran, so the bug reached prod. A real admin call via
-- PostgREST returned HTTP 400 and the cohort grid rendered its empty state.
--
-- #variable_conflict use_column makes unqualified identifiers resolve to columns.
create or replace function public.engagement_cohort_retention(p_weeks integer default 8)
returns table(cohort_week date, week_offset integer, users bigint, retained bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
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
    select fs.user_id, fs.cohort_week from first_seen fs where fs.cohort_week >= v_floor
  ),
  sizes as (
    select c.cohort_week, count(*)::bigint as users from cohort c group by c.cohort_week
  ),
  activity as (
    select
      c.cohort_week,
      ((date_trunc('week', e.created_at)::date - c.cohort_week) / 7)::int as week_offset,
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
