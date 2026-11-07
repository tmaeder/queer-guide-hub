-- Coordinate Jev, research, and source verification on worklist cases while retaining
-- the native review locks and each worker's own outcomes.
create table api_private.review_source_verification_leases (
  case_id uuid primary key references public.admin_review_cases(id) on delete cascade,
  fingerprint text not null,
  lease_token uuid not null,
  lease_expires_at timestamptz not null
);
alter table api_private.review_source_verification_leases enable row level security;
revoke all on api_private.review_source_verification_leases from public, anon, authenticated, service_role;

create function api_private.try_lock_review_case(p_case_id uuid)
returns boolean language sql volatile
set search_path = ''
as $$
  select pg_try_advisory_xact_lock(hashtextextended(p_case_id::text, 5140));
$$;
revoke all on function api_private.try_lock_review_case(uuid) from public, anon, authenticated;

create function public.claim_review_source_verification(
  p_case_id uuid, p_fingerprint text, p_lease_token uuid
)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
begin
  perform api_private.assert_jev_internal();
  if p_case_id is null or p_fingerprint is null or p_lease_token is null
     or not api_private.try_lock_review_case(p_case_id) then
    return false;
  end if;

  v_now := clock_timestamp();
  if not exists (
    select 1
    from public.admin_review_cases c
    where c.id = p_case_id and c.active and c.fingerprint = p_fingerprint
      and exists (
        select 1 from jsonb_array_elements(c.members) m
        where m->>'queue_type' in ('event-quality', 'business-quality')
      )
  ) or exists (
    select 1 from public.admin_review_automation_jobs j
    where j.case_id = p_case_id
      and ((j.status = 'running' and j.lease_expires_at > v_now)
        or (j.status = 'applied' and j.fingerprint = p_fingerprint))
  ) or exists (
    select 1 from public.admin_review_research_jobs j
    where j.case_id = p_case_id and j.status = 'running' and j.lease_expires_at > v_now
  ) then
    return false;
  end if;

  insert into api_private.review_source_verification_leases as lease
    (case_id, fingerprint, lease_token, lease_expires_at)
  values (p_case_id, p_fingerprint, p_lease_token, v_now + interval '20 minutes')
  on conflict (case_id) do update
    set fingerprint = excluded.fingerprint, lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at
    where lease.lease_expires_at <= v_now or lease.fingerprint <> p_fingerprint
       or lease.lease_token = p_lease_token;
  return found;
end
$$;

create function public.release_review_source_verification(p_case_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer
set search_path = ''
as $$
begin
  perform api_private.assert_jev_internal();
  delete from api_private.review_source_verification_leases
  where case_id = p_case_id and lease_token = p_lease_token;
  return found;
end
$$;

revoke all on function public.claim_review_source_verification(uuid,text,uuid),
  public.release_review_source_verification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_review_source_verification(uuid,text,uuid),
  public.release_review_source_verification(uuid,uuid) to service_role;

-- The separate statement after the transaction lock sees a lease committed by
-- a competing claim. Both scheduled and targeted workers use this guard.
create function api_private.try_claim_review_case(p_case_id uuid, p_fingerprint text, p_worker text)
returns boolean language plpgsql volatile
set search_path = ''
as $$
begin
  if not api_private.try_lock_review_case(p_case_id) then
    return false;
  end if;
  return exists (
    select 1 from public.admin_review_cases c
    where c.id = p_case_id and c.active and c.fingerprint = p_fingerprint
  ) and not exists (
    select 1 from api_private.review_source_verification_leases lease
    where lease.case_id = p_case_id and lease.fingerprint = p_fingerprint
      and lease.lease_expires_at > clock_timestamp()
  ) and not exists (
    select 1 from public.admin_review_automation_jobs j
    where p_worker = 'research' and j.case_id = p_case_id
      and j.status = 'running' and j.lease_expires_at > clock_timestamp()
  ) and not exists (
    select 1 from public.admin_review_research_jobs j
    where p_worker = 'jev' and j.case_id = p_case_id
      and j.status = 'running' and j.lease_expires_at > clock_timestamp()
  );
end
$$;
revoke all on function api_private.try_claim_review_case(uuid,text,text) from public, anon, authenticated;

create or replace function public.claim_jev_review_jobs(p_batch integer default 8)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform api_private.assert_jev_internal();
  if not exists (select 1 from public.admin_automations where slug = 'review_jev' and enabled) then
    return '[]'::jsonb;
  end if;

  insert into public.admin_review_automation_jobs as jobs (case_id, fingerprint)
  select c.id, c.fingerprint
  from public.admin_review_cases c
  where c.active
    and not exists (
      select 1
      from public.admin_review_automation_jobs j
      where j.case_id = c.id
        and j.fingerprint = c.fingerprint
        and j.policy_version = 'jev-review-v1'
    )
  on conflict (case_id) do update
  set fingerprint = excluded.fingerprint, policy_version = 'jev-review-v1',
      status = 'queued', attempts = 0, next_attempt_at = now(),
      lease_token = null, lease_expires_at = null, outcome = '{}', updated_at = now()
  where jobs.fingerprint <> excluded.fingerprint or jobs.policy_version <> 'jev-review-v1';

  update public.admin_review_automation_jobs
  set status = 'retry', lease_token = null, lease_expires_at = null,
      next_attempt_at = now() + interval '1 hour',
      outcome = jsonb_build_object('reason', 'worker_lease_expired'), updated_at = now()
  where status = 'running' and lease_expires_at < now();

  -- Preserve fair ordering across sources. Recheck the mutable job predicates
  -- on the row being locked, in case another worker already claimed it.
  with eligible as (
    select j.case_id, j.fingerprint,
           row_number() over (
             partition by c.item->>'queue_type'
             order by j.attempts, j.next_attempt_at, c.created_at, c.id
           ) as rank,
           j.attempts, j.next_attempt_at
    from public.admin_review_automation_jobs j
    join public.admin_review_cases c on c.id = j.case_id
    where c.active and c.fingerprint = j.fingerprint
      and not exists (
        select 1 from api_private.review_source_verification_leases lease
        where lease.case_id = j.case_id and lease.fingerprint = j.fingerprint
          and lease.lease_expires_at > now()
      )
      and not exists (
        select 1 from public.admin_review_research_jobs research
        where research.case_id = j.case_id and research.status = 'running'
          and research.lease_expires_at > now()
      )
      and j.status in ('queued', 'retry', 'blocked', 'preview')
      and j.next_attempt_at <= now()
  ), due as materialized (
    select j.case_id, j.fingerprint
    from eligible e
    join public.admin_review_automation_jobs j on j.case_id = e.case_id
    where j.fingerprint = e.fingerprint
      and j.status in ('queued', 'retry', 'blocked', 'preview')
      and j.next_attempt_at <= now()
    order by e.rank, e.attempts, e.next_attempt_at, j.case_id
    limit greatest(0, least(16, p_batch))
    for update of j skip locked
  ), claimable as materialized (
    select case_id, fingerprint
    from due
    where api_private.try_claim_review_case(case_id, fingerprint, 'jev')
  ), claimed as (
    update public.admin_review_automation_jobs j
    set status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid(),
        lease_expires_at = now() + interval '8 minutes', updated_at = now()
    from claimable c
    where c.case_id = j.case_id and c.fingerprint = j.fingerprint
    returning j.*
  )
  select coalesce(jsonb_agg(to_jsonb(j) || jsonb_build_object('queue_type', c.item->>'queue_type')), '[]')
  into result
  from claimed j
  join public.admin_review_cases c on c.id = j.case_id;

  return result;
end
$$;

create or replace function public.claim_jev_review_job(p_case_id uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform api_private.assert_jev_internal();
 if not exists(select 1 from public.admin_automations where slug='review_jev'and enabled)then return '[]';end if;
 with claimed as(
 insert into public.admin_review_automation_jobs as jobs(case_id,fingerprint,status,attempts,lease_token,lease_expires_at)
 select id,fingerprint,'running',1,gen_random_uuid(),now()+interval '8 minutes'from public.admin_review_cases
 where id=p_case_id and active and api_private.try_claim_review_case(id,fingerprint,'jev')
 on conflict(case_id)do update set fingerprint=excluded.fingerprint,status='running',attempts=jobs.attempts+1,
 lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,updated_at=now()
 where(jobs.status<>'running'or jobs.lease_expires_at<now())and(jobs.status<>'applied'or jobs.fingerprint<>excluded.fingerprint)
 returning jobs.*)
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('queue_type',c.item->>'queue_type')),'[]')into result
 from claimed j join public.admin_review_cases c on c.id=j.case_id;
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.claim_admin_review_research_jobs(p_batch integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_jobs jsonb;
begin
 if not exists(select 1 from public.admin_automations where slug='review_research' and enabled) then return '[]'::jsonb; end if;
 -- An expired lease consumes an attempt too; after three failures it escalates visibly.
 update public.admin_review_research_jobs set status='blocked',lease_token=null,lease_expires_at=null,
 outcome=jsonb_build_object('reason','Research worker lease expired after three attempts'),updated_at=now()
 where status='running' and lease_expires_at<now() and attempts>=3;
 with eligible as (select j.case_id,j.attempts,c.created_at,
 row_number() over(partition by c.family order by j.attempts,c.created_at,j.case_id) family_rank
 from public.admin_review_research_jobs j join public.admin_review_cases c on c.id=j.case_id
 where c.active and c.fingerprint=j.fingerprint and c.stage='research' and j.attempts<3
 and not exists (
   select 1 from api_private.review_source_verification_leases lease
   where lease.case_id=j.case_id and lease.fingerprint=j.fingerprint and lease.lease_expires_at>now()
 )
 and not exists (
   select 1 from public.admin_review_automation_jobs jev
   where jev.case_id=j.case_id and jev.status='running' and jev.lease_expires_at>now()
 )
 and (j.status in ('queued','retry') and j.next_attempt_at<=now() or j.status='running' and j.lease_expires_at<now())),
 due as materialized (
   select j.case_id,j.fingerprint from eligible x join public.admin_review_research_jobs j using(case_id)
   where (j.status in ('queued','retry') and j.next_attempt_at<=now() or j.status='running' and j.lease_expires_at<now())
     and j.attempts<3
   order by x.attempts,x.family_rank,x.created_at,x.case_id
   limit greatest(1,least(8,p_batch)) for update of j skip locked
 ),
 claimable as materialized (
   select case_id,fingerprint from due
   where api_private.try_claim_review_case(case_id,fingerprint,'research')
 ),
 claimed as (update public.admin_review_research_jobs j set status='running',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_expires_at=now()+interval '8 minutes',last_attempt_at=now(),updated_at=now()
 from claimable c where c.case_id=j.case_id and c.fingerprint=j.fingerprint
 returning j.*)
 select coalesce(jsonb_agg(to_jsonb(j)||jsonb_build_object('family',c.family,'item',c.item)),'[]'::jsonb) into v_jobs
 from claimed j join public.admin_review_cases c on c.id=j.case_id;
 return v_jobs;
end $function$;

CREATE OR REPLACE FUNCTION public.process_admin_review_local_research(p_batch integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; v_token uuid; v_outcome jsonb; v_examined integer:=0; v_repaired integer:=0; v_ready integer:=0;
begin
 if not exists(select 1 from public.admin_automations where slug='review_research' and enabled) then return jsonb_build_object('skipped','paused'); end if;
 if not pg_try_advisory_xact_lock(hashtext('review_local_research')) then return jsonb_build_object('skipped','already_running'); end if;
 for r in select j.case_id,j.fingerprint from public.admin_review_research_jobs j join public.admin_review_cases c on c.id=j.case_id
 where c.active and c.family='venue' and c.fingerprint=j.fingerprint and j.status='queued' and j.outcome->>'local_search_complete' is distinct from 'true'
 and not exists (
   select 1 from api_private.review_source_verification_leases lease
   where lease.case_id=j.case_id and lease.fingerprint=j.fingerprint and lease.lease_expires_at>now()
 )
 and not exists (
   select 1 from public.admin_review_automation_jobs jev
   where jev.case_id=j.case_id and jev.status='running' and jev.lease_expires_at>now()
 )
 order by c.created_at,j.case_id limit greatest(0,least(200,p_batch)) for update of j skip locked loop
  continue when not api_private.try_claim_review_case(r.case_id,r.fingerprint,'research');
  v_examined:=v_examined+1; v_token:=gen_random_uuid();
  update public.admin_review_research_jobs set status='running',lease_token=v_token,lease_expires_at=now()+interval '2 minutes',last_attempt_at=now() where case_id=r.case_id;
  v_outcome:=public.research_admin_review_local(r.case_id,v_token)||'{"local_search_complete":true}'::jsonb;
  insert into public.admin_review_research_attempts(case_id,fingerprint,lease_token,status,outcome)
   select case_id,fingerprint,v_token,'local_search',v_outcome from public.admin_review_research_jobs where case_id=r.case_id;
  update public.admin_review_research_jobs set status=case when v_outcome->>'repaired'='true' or v_outcome->>'decision_ready'='true' then 'completed' else 'queued' end,
   outcome=v_outcome,lease_token=null,lease_expires_at=null,next_attempt_at=now(),updated_at=now() where case_id=r.case_id;
  if v_outcome->>'repaired'='true' then
   v_repaired:=v_repaired+1; update public.admin_review_cases set active=false,updated_at=now() where id=r.case_id;
  elsif v_outcome->>'decision_ready'='true' then v_ready:=v_ready+1; end if;
 end loop;
 return jsonb_build_object('examined',v_examined,'repaired',v_repaired,'ready',v_ready);
end $function$;
