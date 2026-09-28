-- SECURITY DEFINER changes current_user to the function owner, so caller
-- authorization must come from the JWT rather than a current_user shortcut.
create or replace function public.governance_remediation_summary(p_run uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select case
    when public.has_role_jwt('admin'::public.app_role)
      or coalesce(auth.jwt()->>'role','')='service_role'
    then jsonb_build_object(
      'run',(select to_jsonb(r) from public.governance_remediation_runs r where r.id=p_run),
      'by_engine',(select coalesce(jsonb_agg(to_jsonb(x) order by engine,resolution_state),'[]'::jsonb)
        from (select engine,resolution_state,count(*) items
          from public.governance_remediation_items where run_id=p_run
          group by engine,resolution_state) x),
      'open_by_finding',(select coalesce(jsonb_agg(to_jsonb(x) order by items desc,finding_key),'[]'::jsonb)
        from (select finding_key,count(*) items
          from public.governance_remediation_items
          where run_id=p_run and resolution_state in ('open','in_progress')
          group by finding_key) x)
    )
    else null
  end;
$$;

create or replace function public.latest_governance_remediation_summary()
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with latest as (
    select id
    from public.governance_remediation_runs
    order by captured_at desc
    limit 1
  )
  select case
    when public.has_role_jwt('admin'::public.app_role)
      or coalesce(auth.jwt()->>'role','')='service_role'
    then public.governance_remediation_summary((select id from latest))
    else null
  end;
$$;

revoke all on function public.governance_remediation_summary(uuid)
  from public,anon;
grant execute on function public.governance_remediation_summary(uuid)
  to authenticated,service_role;
revoke all on function public.latest_governance_remediation_summary()
  from public,anon;
grant execute on function public.latest_governance_remediation_summary()
  to authenticated,service_role;
