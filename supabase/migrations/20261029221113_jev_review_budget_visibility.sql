-- Admin-only summary of the shared production cap. No client ledger grants.
create or replace function public.get_jev_review_status(p_case_id uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_role_jwt('admin'::public.app_role)then raise exception 'Admin required'using errcode='42501';end if;
 return jsonb_build_object('enabled',(select enabled from public.admin_automations where slug='review_jev'),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]')from public.admin_review_automation_jobs j join public.admin_review_cases c on c.id=j.case_id
 where p_case_id is not null and j.case_id=p_case_id and(j.status='applied'or c.active and c.fingerprint=j.fingerprint)),
 'counts',(select jsonb_object_agg(status,n)from(select j.status,count(*)n from public.admin_review_automation_jobs j join public.admin_review_cases c on c.id=j.case_id
 where j.status='applied'or c.active and c.fingerprint=j.fingerprint group by j.status)s),
 'production_budget',(select jsonb_build_object('period',a.period,'enabled',a.enabled,'period_start',api_private.jev_budget_period_start(a.period),
  'cap_nano_usd',a.cap_nano_usd,'charged_nano_usd',coalesce(w.charged_nano_usd,0),'reserved_nano_usd',coalesce(w.reserved_nano_usd,0),
  'deferred',not a.enabled or a.cap_nano_usd-coalesce(w.charged_nano_usd,0)-coalesce(w.reserved_nano_usd,0)<2752512)
  from api_private.jev_budget_accounts a left join api_private.jev_budget_windows w on w.account=a.account and w.period_start=api_private.jev_budget_period_start(a.period)
  where a.account='production'));
end $$;
revoke all on function public.get_jev_review_status(uuid) from public,anon;
grant execute on function public.get_jev_review_status(uuid) to authenticated;
