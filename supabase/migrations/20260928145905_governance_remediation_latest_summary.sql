-- Expose the latest immutable Governance Engine remediation accounting to
-- authorized staff without granting direct table access.
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
    when current_user in ('postgres','service_role')
      or public.has_role_jwt('admin'::public.app_role)
    then public.governance_remediation_summary((select id from latest))
    else null
  end;
$$;

revoke all on function public.latest_governance_remediation_summary()
  from public,anon;
grant execute on function public.latest_governance_remediation_summary()
  to authenticated,service_role;
