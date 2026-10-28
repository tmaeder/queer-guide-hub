-- Preserve the staff identity invariant while admitting explicitly labelled machine decisions.
alter table public.admin_review_decisions add column actor_kind text not null default 'staff';
alter table public.admin_review_decisions alter column actor_id drop not null;
alter table public.admin_review_decisions add constraint admin_review_decision_actor_kind_check
 check((actor_kind='staff'and actor_id is not null)or(actor_kind='automation'and actor_id is null));
do $patch$declare s text;anchor text;begin
 s:=pg_get_functiondef('public.finish_jev_review_job(uuid,uuid,text,jsonb,jsonb,boolean)'::regprocedure);
 anchor:=$old$insert into public.admin_review_decisions(queue_key,item_id,actor_id,decision,notes)values(c.item->>'queue_type',(c.item->>'id')::uuid,null,$old$;
 if position(anchor in s)=0 then raise exception 'Jev machine audit anchor changed';end if;
 execute replace(s,anchor,$new$insert into public.admin_review_decisions(queue_key,item_id,actor_id,actor_kind,decision,notes)values(c.item->>'queue_type',(c.item->>'id')::uuid,null,'automation',$new$);
end $patch$;

-- Explicit service policies document the boundary; browser roles still have no table grants.
create policy jev_jobs_service on public.admin_review_automation_jobs for all to service_role using(true)with check(true);
create policy jev_audit_service_read on public.admin_review_automation_audit for select to service_role using(true);
create policy jev_audit_service_append on public.admin_review_automation_audit for insert to service_role with check(true);

create or replace function public.get_jev_review_status(p_case_id uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_role_jwt('admin'::public.app_role)then raise exception 'Admin required'using errcode='42501';end if;
 return jsonb_build_object('enabled',(select enabled from public.admin_automations where slug='review_jev'),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(j)),'[]')from public.admin_review_automation_jobs j join public.admin_review_cases c on c.id=j.case_id
 where p_case_id is not null and j.case_id=p_case_id and(j.status='applied'or c.active and c.fingerprint=j.fingerprint)),
 'counts',(select jsonb_object_agg(status,n)from(select j.status,count(*)n from public.admin_review_automation_jobs j join public.admin_review_cases c on c.id=j.case_id
 where j.status='applied'or c.active and c.fingerprint=j.fingerprint group by j.status)s));
end $$;
