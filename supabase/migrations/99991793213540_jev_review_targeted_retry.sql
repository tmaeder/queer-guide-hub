-- An explicitly requested case can be previewed/retried without waiting behind the backlog.
create function public.claim_jev_review_job(p_case_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform api_private.assert_jev_internal();
 if not exists(select 1 from public.admin_automations where slug='review_jev'and enabled)then return '[]';end if;
 with claimed as(
 insert into public.admin_review_automation_jobs as jobs(case_id,fingerprint,status,attempts,lease_token,lease_expires_at)
 select id,fingerprint,'running',1,gen_random_uuid(),now()+interval '8 minutes'from public.admin_review_cases where id=p_case_id and active
 on conflict(case_id)do update set fingerprint=excluded.fingerprint,status='running',attempts=jobs.attempts+1,
 lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,updated_at=now()
 where(jobs.status<>'running'or jobs.lease_expires_at<now())and(jobs.status<>'applied'or jobs.fingerprint<>excluded.fingerprint)
 returning jobs.*)
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('queue_type',c.item->>'queue_type')),'[]')into result
 from claimed j join public.admin_review_cases c on c.id=j.case_id;
 return result;
end $$;
revoke all on function public.claim_jev_review_job(uuid)from public,anon,authenticated;
grant execute on function public.claim_jev_review_job(uuid)to service_role;
