-- A spend limit is deferred work, never evidence that the event is uneditable.
create or replace function public.retry_event_description_job(p_id uuid,p_issue text)
returns void language sql security invoker set search_path='' as $$
  update api_private.event_description_jobs set
    state=case when p_issue in ('budget_unavailable','budget_exhausted') then 'editorial' when attempts>=3 then 'review' else 'editorial' end,
    attempts=case when p_issue in ('budget_unavailable','budget_exhausted') then greatest(0,attempts-1) else attempts end,
    issues=array[p_issue],
    available_at=case when p_issue='budget_exhausted' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day 5 minutes' else now()+interval '1 hour' end,
    updated_at=now()
    where event_id=p_id and state='working' and stage='editorial';
$$;
revoke all on function public.retry_event_description_job(uuid,text) from public,anon,authenticated;
grant execute on function public.retry_event_description_job(uuid,text) to service_role;
