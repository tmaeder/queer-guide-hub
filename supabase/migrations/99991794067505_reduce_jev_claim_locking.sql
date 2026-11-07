-- ON CONFLICT locks even rows that its WHERE clause ultimately skips.
-- Select only new or changed cases before trying to synchronize jobs.
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
      and j.status in ('queued', 'retry', 'blocked', 'preview')
      and j.next_attempt_at <= now()
  ), due as (
    select j.case_id
    from eligible e
    join public.admin_review_automation_jobs j on j.case_id = e.case_id
    where j.fingerprint = e.fingerprint
      and j.status in ('queued', 'retry', 'blocked', 'preview')
      and j.next_attempt_at <= now()
    order by e.rank, e.attempts, e.next_attempt_at, j.case_id
    limit greatest(0, least(16, p_batch))
    for update of j skip locked
  ), claimed as (
    update public.admin_review_automation_jobs j
    set status = 'running', attempts = attempts + 1, lease_token = gen_random_uuid(),
        lease_expires_at = now() + interval '8 minutes', updated_at = now()
    from due
    where due.case_id = j.case_id
    returning j.*
  )
  select coalesce(jsonb_agg(to_jsonb(j) || jsonb_build_object('queue_type', c.item->>'queue_type')), '[]')
  into result
  from claimed j
  join public.admin_review_cases c on c.id = j.case_id;

  return result;
end
$$;
