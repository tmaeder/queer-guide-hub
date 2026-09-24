-- The scorecard wrapper must cross the RLS boundary to read its private
-- snapshot cache. Keep the cache itself service-only and make the wrapper the
-- audited staff entry point: authenticate the invoker from JWT claims before
-- any privileged read, then execute as the function owner.

create or replace function public.city_quality_scorecard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_scorecard jsonb;
  v_captured_at timestamptz;
  v_automation jsonb;
  v_trends jsonb;
begin
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select s.scorecard, s.captured_at
  into v_scorecard, v_captured_at
  from public.city_quality_snapshots s
  where s.captured_at >= now() - interval '2 days'
    and s.scorecard->>'probe_ok' = 'true'
  order by s.captured_at desc
  limit 1;

  if v_scorecard is not null then
    select coalesce(jsonb_build_object(
      'last_run_at', a.last_run_at,
      'last_run_status', coalesce(a.last_run_status, 'never'),
      'fresh', coalesce(a.last_run_at >= now() - interval '2 days', false)
    ), jsonb_build_object(
      'last_run_at', null,
      'last_run_status', 'missing',
      'fresh', false
    ))
    into v_automation
    from (select 1) seed
    left join public.admin_automations a on a.slug = 'city_quality_issue_sync';

    select coalesce(jsonb_agg(jsonb_build_object(
      'date', t.snapshot_date,
      'publication_blocked', t.scorecard#>'{totals,publication_blocked}',
      'publication_ready', t.scorecard#>'{totals,publication_ready}'
    ) order by t.snapshot_date desc), '[]'::jsonb)
    into v_trends
    from (
      select snapshot_date, scorecard
      from public.city_quality_snapshots
      order by snapshot_date desc
      limit 12
    ) t;

    return v_scorecard || jsonb_build_object(
      'served_from_snapshot', true,
      'snapshot_captured_at', v_captured_at,
      'automation', v_automation,
      'trends', v_trends
    );
  end if;

  return public._city_quality_scorecard()
    || jsonb_build_object('served_from_snapshot', false, 'snapshot_captured_at', null);
end
$function$;

revoke all on function public.city_quality_scorecard() from public, anon;
grant execute on function public.city_quality_scorecard() to authenticated, service_role;

comment on function public.city_quality_scorecard() is
  'Security-definer staff/service scorecard. Verifies the caller JWT before reading the service-only snapshot cache.';
