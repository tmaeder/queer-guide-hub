-- Prioritize timely events over suspicious multi-year source ranges.
create or replace function public.claim_event_gaps(
 p_lane text,p_token uuid,p_limit integer default 8,p_event_ids uuid[] default null,p_dry_run boolean default false
) returns table(event_id uuid,event jsonb,sources jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
begin
 if p_lane not in ('content','image') or p_token is null then raise exception 'invalid gap claim'; end if;
 if p_dry_run then
   return query select e.id,to_jsonb(e),coalesce((select jsonb_agg(s) from (
     select es.source_url,es.source_slug,jsonb_build_object('description',left(es.payload#>>'{raw,description}',20000)) as raw,es.last_seen_at
     from public.event_sources es where es.event_id=e.id
     order by es.is_primary desc,es.last_seen_at desc limit 3
   ) s),'[]'::jsonb)
   from public.events e
   left join public.event_gap_queue q on q.event_id=e.id and q.lane=p_lane
   where (q.event_id is null or (q.next_attempt_at<=now() and coalesce(q.lease_until,'-infinity')<now())
     or (q.input_hash<>public.event_gap_input(e,p_lane) and coalesce(q.lease_until,'-infinity')<now()))
     and e.duplicate_of_id is null and e.status='active'
     and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
     and (p_event_ids is null or e.id=any(p_event_ids))
     and (nullif(btrim(e.website),'') is not null or nullif(btrim(e.ticket_url),'') is not null
       or exists(select 1 from public.event_sources s where s.event_id=e.id))
     and case when p_lane='content' then
       length(btrim(coalesce(e.description,'')))<80 or cardinality(coalesce(e.accessibility_attributes,'{}'))=0
       or cardinality(coalesce(e.target_groups,'{}'))=0 or nullif(btrim(e.venue_name),'') is null
       or nullif(btrim(e.address),'') is null or nullif(btrim(e.age_restriction),'') is null
     else cardinality(coalesce(e.images,'{}'))=0 or exists(
       select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open'
       and i.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL')) end
   order by case when e.start_date<now()-interval '180 days' and coalesce(e.is_recurring,false)=false then 1 else 0 end,
     case when p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then 0 else 1 end,
     case when e.start_date<=now()+interval '30 days' then 0 else 1 end,
     greatest(e.start_date,now()) asc nulls last,e.id
   limit greatest(0,least(coalesce(p_limit,8),40));
   return;
 end if;
 if not p_dry_run then
   insert into public.event_gap_queue as q(event_id,lane,input_hash)
   select e.id,p_lane,public.event_gap_input(e,p_lane)
   from public.events e
   where e.duplicate_of_id is null and e.status='active'
     and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
     and (p_event_ids is null or e.id=any(p_event_ids))
     and (nullif(btrim(e.website),'') is not null or nullif(btrim(e.ticket_url),'') is not null
       or exists(select 1 from public.event_sources s where s.event_id=e.id))
     and case when p_lane='content' then
       length(btrim(coalesce(e.description,'')))<80 or cardinality(coalesce(e.accessibility_attributes,'{}'))=0
       or cardinality(coalesce(e.target_groups,'{}'))=0 or nullif(btrim(e.venue_name),'') is null
       or nullif(btrim(e.address),'') is null or nullif(btrim(e.age_restriction),'') is null
     else cardinality(coalesce(e.images,'{}'))=0 or exists(
       select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open'
       and i.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL')) end
   on conflict(event_id,lane) do update
     set input_hash=excluded.input_hash,next_attempt_at=now(),no_change_streak=0,updated_at=now()
     where q.input_hash<>excluded.input_hash and coalesce(q.lease_until,'-infinity')<now();
 end if;
 return query
 with candidates as materialized (
   select q.event_id from public.event_gap_queue q join public.events e on e.id=q.event_id
   where q.lane=p_lane and (p_lane='content' or cardinality(coalesce(e.images,'{}'))=0 or exists(
       select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open'
       and i.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL')))
     and q.next_attempt_at<=now() and coalesce(q.lease_until,'-infinity')<now()
     and e.duplicate_of_id is null and e.status='active'
     and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
     and (p_event_ids is null or e.id=any(p_event_ids))
   order by case when e.start_date<now()-interval '180 days' and coalesce(e.is_recurring,false)=false then 1 else 0 end,
     case when p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then 0 else 1 end,
     case when e.start_date<=now()+interval '30 days' then 0 else 1 end,
     greatest(e.start_date,now()) asc nulls last,q.next_attempt_at,q.event_id
   limit greatest(0,least(coalesce(p_limit,8),40)) for update of q skip locked
 ), claimed as (
   update public.event_gap_queue q set lease_token=p_token,lease_until=now()+interval '5 minutes'
   from candidates c where q.event_id=c.event_id and q.lane=p_lane and not p_dry_run
   returning q.event_id
 ), selected as (
   select c.event_id from claimed c union all select c.event_id from candidates c where p_dry_run
 )
 select e.id,to_jsonb(e),coalesce((select jsonb_agg(s) from (
   select es.source_url,es.source_slug,jsonb_build_object('description',left(es.payload#>>'{raw,description}',20000)) as raw,es.last_seen_at
   from public.event_sources es where es.event_id=e.id
   order by es.is_primary desc,es.last_seen_at desc limit 3
 ) s),'[]'::jsonb) from selected c join public.events e on e.id=c.event_id;
end $$;
revoke all on function public.claim_event_gaps(text,uuid,integer,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.claim_event_gaps(text,uuid,integer,uuid[],boolean) to service_role;

create or replace function public.event_gap_metrics()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('backlog',(select coalesce(jsonb_agg(t),'[]') from (
   select q.lane,count(*) as tracked,count(*) filter(where next_attempt_at<=now() and coalesce(lease_until,'-infinity')<now()) as due,
     count(*) filter(where lease_until>now()) as leased,sum(fields_filled) as fields_filled
   from public.event_gap_queue q join public.events e on e.id=q.event_id
   where e.duplicate_of_id is null and e.status='active' and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
   group by q.lane)t),
 'long_running_without_recurrence',(select count(*) from public.events e where e.status='active' and e.duplicate_of_id is null
   and e.start_date<now()-interval '180 days' and e.end_date>=now() and coalesce(e.is_recurring,false)=false),
 'unfillable_without_source',(select count(*) from public.events e where e.status='active' and e.duplicate_of_id is null
   and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
   and nullif(btrim(e.website),'') is null and nullif(btrim(e.ticket_url),'') is null
   and not exists(select 1 from public.event_sources s where s.event_id=e.id and nullif(btrim(s.source_url),'') is not null)),
 'sources_7d',(select coalesce(jsonb_agg(t),'[]') from (
   select e.data_source,s.details->>'lane' as lane,count(*) as attempts,
     sum(coalesce((s.details->>'ai_attempts')::integer,0)) as ai_attempts,
     sum(coalesce((s.details->>'network_requests')::integer,0)) as network_requests,
     count(*) filter(where s.details->>'outcome'='updated') as productive_attempts,
     sum(jsonb_array_length(s.details->'fields')) as fields_filled,count(*) filter(where s.details->>'outcome'='failed') as failures
   from public.event_quality_signals s join public.events e on e.id=s.event_id
   where s.source='event-gap-worker' and s.created_at>now()-interval '7 days'
   group by 1,2 order by count(*) desc)t))
$$;
revoke all on function public.event_gap_metrics() from public,anon,authenticated;
grant execute on function public.event_gap_metrics() to service_role;

-- Replace schedules only after both workers are deployed. Preserve the existing
-- authenticated, Vault-backed HTTP command and automation tracking wrappers.
do $$
declare j record; v_schedule text; v_command text;
begin
 for j in select jobid,jobname,command from cron.job
   where jobname in ('event_agentic_enrich','event_image_backfill') loop
   v_schedule:=case when j.jobname='event_agentic_enrich' then '7-59/15 * * * *' else '18 * * * *' end;
   v_command:=case when j.jobname='event_agentic_enrich'
     then regexp_replace(j.command,'"batch_limit":\s*5','"batch_limit":8')
     else regexp_replace(j.command,'"batch_size":\s*40','"batch_size":12') end;
   perform cron.alter_job(j.jobid,schedule:=v_schedule,command:=v_command);
   update public.admin_automations set schedule=v_schedule,
     action=jsonb_set(action,'{command}',to_jsonb(v_command)),updated_at=now(),
     description=case when j.jobname='event_agentic_enrich'
       then 'Every 15 minutes: closes source-backed content gaps, cheap evidence first, 60/day AI ledger cap, per-event leases and retry backoff.'
       else 'Hourly: verifies and fills event-owned artwork, preserves unrelated photos, per-event leases and retry backoff.' end
   where slug=j.jobname;
 end loop;
end $$;
