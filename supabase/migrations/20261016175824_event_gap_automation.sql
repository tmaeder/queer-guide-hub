-- Durable gap closure for the existing content/image workers. No public access.
create table public.event_gap_queue (
  event_id uuid not null references public.events(id) on delete cascade,
  lane text not null check(lane in ('content','image')),
  input_hash text not null,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  no_change_streak integer not null default 0,
  last_outcome text,
  last_details jsonb not null default '{}',
  fields_filled integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(event_id,lane)
);
alter table public.event_gap_queue enable row level security;
revoke all on public.event_gap_queue from public,anon,authenticated;
grant all on public.event_gap_queue to service_role;
create index event_gap_queue_due on public.event_gap_queue(lane,next_attempt_at,lease_until);

create or replace function public.event_gap_input(p_event public.events,p_lane text)
returns text language sql immutable set search_path=public,pg_temp as $$
 select md5(jsonb_build_array(p_event.website,p_event.ticket_url,p_event.status,
   p_event.start_date,p_event.end_date,p_event.duplicate_of_id,
   case when p_lane='image' then to_jsonb(p_event.images) else
     jsonb_build_array(p_event.description,p_event.venue_name,p_event.address,
       p_event.accessibility_attributes,p_event.target_groups,p_event.age_restriction) end)::text)
$$;
revoke all on function public.event_gap_input(public.events,text) from public,anon,authenticated;
grant execute on function public.event_gap_input(public.events,text) to service_role;

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
   order by case when p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then 0 else 1 end,
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
   order by case when p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then 0 else 1 end,
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

-- Apply under row locks, rechecking current values. Lease ownership and expiry
-- fence late workers; curated edits cannot be overwritten by stale snapshots.
create or replace function public.finish_event_gap(
 p_event_id uuid,p_lane text,p_token uuid,p_patch jsonb default '{}',p_evidence jsonb default '{}',
 p_outcome text default 'no_change',p_details jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.event_gap_queue; e public.events; old_e public.events;
 v_fields text[]:='{}'; v_field text; v_value jsonb; v_prov jsonb;
 v_conf numeric; v_delay interval; v_streak integer; v_outcome text;
begin
 -- All functions acquire queue then event locks in the same order.
 select * into q from public.event_gap_queue where event_id=p_event_id and lane=p_lane for update;
 if not found or q.lease_token is distinct from p_token or q.lease_until<=now() then
   return jsonb_build_object('outcome','lease_lost','fields','[]'::jsonb); end if;
 select * into e from public.events where id=p_event_id for update;
 old_e:=e;
 if e.duplicate_of_id is not null or e.status<>'active'
   or (coalesce(e.end_date,e.start_date)<now()) then
   update public.event_gap_queue set lease_token=null,lease_until=null,next_attempt_at=now()+interval '30 days',
     last_outcome='ineligible',updated_at=now() where event_id=p_event_id and lane=p_lane;
   return jsonb_build_object('outcome','ineligible','fields','[]'::jsonb); end if;
 v_prov:=coalesce(e.field_provenance,'{}');
 v_conf:=coalesce((p_evidence->>'confidence')::numeric,0);
 if p_outcome not in ('no_change','failed','blocked','capped','review','updated') then raise exception 'invalid outcome'; end if;
 if v_conf>=0.8 and nullif(btrim(p_evidence->>'source_url'),'') is not null then
   if p_lane='content' then
     if length(btrim(coalesce(e.description,'')))<80 and length(btrim(coalesce(p_patch->>'description','')))>=80 then
       e.description:=left(btrim(p_patch->>'description'),20000); v_fields:=array_append(v_fields,'description'); end if;
     if v_conf>=0.9 and nullif(btrim(e.venue_name),'') is null and nullif(btrim(p_patch->>'venue_name'),'') is not null then
       e.venue_name:=left(btrim(p_patch->>'venue_name'),500); v_fields:=array_append(v_fields,'venue_name'); end if;
     if v_conf>=0.9 and nullif(btrim(e.address),'') is null and nullif(btrim(p_patch->>'address'),'') is not null then
       e.address:=left(btrim(p_patch->>'address'),1000); v_fields:=array_append(v_fields,'address'); end if;
     if nullif(btrim(e.age_restriction),'') is null and nullif(btrim(p_patch->>'age_restriction'),'') is not null then
       e.age_restriction:=p_patch->>'age_restriction'; v_fields:=array_append(v_fields,'age_restriction'); end if;
     foreach v_field in array array['accessibility_attributes','target_groups'] loop
       v_value:=p_patch->v_field;
       if jsonb_typeof(v_value)='array' and jsonb_array_length(v_value)>0
         and coalesce(cardinality(case when v_field='accessibility_attributes' then e.accessibility_attributes else e.target_groups end),0)=0 then
         if v_field='accessibility_attributes' then
           e.accessibility_attributes:=array(select jsonb_array_elements_text(v_value));
         else e.target_groups:=array(select jsonb_array_elements_text(v_value)); end if;
         v_fields:=array_append(v_fields,v_field);
       end if;
     end loop;
     if nullif(btrim(e.website),'') is null and nullif(btrim(p_patch->>'website'),'') is not null
       and public.event_quality_url_is_safe(p_patch->>'website') then
       e.website:=p_patch->>'website'; v_fields:=array_append(v_fields,'website'); end if;
   elsif p_lane='image' and jsonb_typeof(p_patch->'images')='array' and jsonb_array_length(p_patch->'images')>0
     and (cardinality(coalesce(e.images,'{}'))=0 or to_jsonb(e.images)=p_evidence->'previous_images')
     and not exists(select 1 from jsonb_array_elements_text(p_patch->'images') u where not public.event_quality_url_is_safe(u)) then
     e.images:=array(select jsonb_array_elements_text(p_patch->'images')) || array(
       select u from unnest(coalesce(e.images,'{}')) u where not exists(
         select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open'
           and i.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL')
           and i.evidence->>'url'=u));
     v_fields:=array_append(v_fields,'images');
   end if;
 end if;
 if cardinality(v_fields)>0 then
   update public.events set description=e.description,venue_name=e.venue_name,address=e.address,website=e.website,
     age_restriction=e.age_restriction,accessibility_attributes=e.accessibility_attributes,
     target_groups=e.target_groups,images=e.images,updated_at=now() where id=p_event_id returning * into e;
   v_prov:=coalesce(e.field_provenance,'{}');
   -- Taxonomy triggers may discard unknown values. Count only persisted changes.
   v_fields:=array(select f from unnest(v_fields) f where (to_jsonb(e)->f) is distinct from (to_jsonb(old_e)->f));
   foreach v_field in array v_fields loop
     v_prov:=jsonb_set(v_prov,array[v_field],jsonb_build_object('source','event-gap-worker',
       'source_url',p_evidence->>'source_url','confidence',v_conf,'observed_at',now(),
       'value',to_jsonb(e)->v_field,'previous_value',to_jsonb(old_e)->v_field));
   end loop;
   if cardinality(v_fields)>0 then
     update public.events set field_provenance=v_prov where id=p_event_id;
     -- Existing scanner owns issue reconciliation; invalidate only its snapshot.
     delete from public.event_quality_current where event_id=p_event_id;
   end if;
 end if;
 if p_outcome='review' then update public.events set needs_attention=true where id=p_event_id; end if;
 v_outcome:=case when cardinality(v_fields)>0 then 'updated' when p_outcome='updated' then 'no_change' else p_outcome end;
 v_streak:=case when cardinality(v_fields)>0 then 0 when v_outcome='capped' then q.no_change_streak else q.no_change_streak+1 end;
 v_delay:=case when v_outcome='updated' then interval '14 days'
   when v_outcome='capped' then interval '1 hour'
   when v_outcome='review' then interval '30 days'
   when v_outcome='failed' then interval '1 hour'*least(168,power(2,least(v_streak,8)))
   else interval '1 day'*least(30,power(2,least(v_streak,5))) end;
 update public.event_gap_queue set lease_token=null,lease_until=null,attempts=attempts+1,
   input_hash=public.event_gap_input(e,p_lane),next_attempt_at=now()+v_delay,no_change_streak=v_streak,
   last_outcome=v_outcome,last_details=coalesce(p_details,'{}')||jsonb_build_object('fields',v_fields),
   fields_filled=fields_filled+cardinality(v_fields),updated_at=now()
 where event_id=p_event_id and lane=p_lane;
 insert into public.event_quality_signals(event_id,signal_type,value,source,details)
 values(p_event_id,'enrichment',case when cardinality(v_fields)>0 then 1 else 0 end,'event-gap-worker',
   coalesce(p_details,'{}')||jsonb_build_object('lane',p_lane,'outcome',v_outcome,'fields',v_fields,
     'source_url',p_evidence->>'source_url'));
 return jsonb_build_object('outcome',v_outcome,'fields',v_fields,'next_attempt_at',now()+v_delay);
end $$;
revoke all on function public.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb) to service_role;

create or replace function public.event_gap_metrics()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('backlog',(select coalesce(jsonb_agg(t),'[]') from (
   select q.lane,count(*) as tracked,count(*) filter(where next_attempt_at<=now() and coalesce(lease_until,'-infinity')<now()) as due,
     count(*) filter(where lease_until>now()) as leased,sum(fields_filled) as fields_filled
   from public.event_gap_queue q join public.events e on e.id=q.event_id
   where e.duplicate_of_id is null and e.status='active' and (coalesce(e.end_date,e.start_date)>=now() or coalesce(e.end_date,e.start_date) is null)
   group by q.lane)t),
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

-- Serialize budget reservations in the existing ledger, including a caller's
-- optional lower ceiling. Missing budget configuration denies inference.
create or replace function public.consume_event_gap_budget(p_cap integer default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_allowed boolean;
begin
 update public.llm_budget b set
   spent_today=(case when b.window_start<current_date then 0 else b.spent_today end)+1,
   window_start=current_date,updated_at=now()
 where b.caller_key='event-agentic-enrich'
   and (case when b.window_start<current_date then 0 else b.spent_today end)
     < least(b.daily_cap,coalesce(greatest(p_cap,0),b.daily_cap))
 returning true into v_allowed;
 return coalesce(v_allowed,false);
end $$;
revoke all on function public.consume_event_gap_budget(integer) from public,anon,authenticated;
grant execute on function public.consume_event_gap_budget(integer) to service_role;

-- New source evidence reopens a cooled-down task without stealing an active lease.
create or replace function public.reopen_event_gaps_from_source()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new.payload_hash is not distinct from old.payload_hash
   and new.source_url is not distinct from old.source_url then return new; end if;
 update public.event_gap_queue set next_attempt_at=now(),no_change_streak=0,updated_at=now()
 where event_id=new.event_id and coalesce(lease_until,'-infinity')<now();
 return new;
end $$;
revoke all on function public.reopen_event_gaps_from_source() from public,anon,authenticated;
create trigger event_gap_source_changed after insert or update of payload_hash,source_url on public.event_sources
for each row execute function public.reopen_event_gaps_from_source();
