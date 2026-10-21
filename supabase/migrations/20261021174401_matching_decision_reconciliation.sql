-- Candidate batches must contain matchable events, not the same newest unmatched rows.
create or replace function public.find_event_venue_candidates(
 p_limit integer default 500,p_active_only boolean default true)
returns table(event_id uuid,venue_id uuid,event_venue_name text,venue_name text,name_exact boolean,distance_m numeric)
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 with candidates as materialized (
 select e.id event_id,v.id venue_id,e.venue_name event_venue_name,v.name venue_name,
  public.normalize_name(v.name)=public.normalize_name(e.venue_name) name_exact,e.start_date,
  case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null
   then round((2*6371000*asin(least(1.0::float8,sqrt(
    power(sin(radians((v.latitude-e.latitude)::float8)/2),2)+cos(radians(e.latitude::float8))*cos(radians(v.latitude::float8))*
    power(sin(radians((v.longitude-e.longitude)::float8)/2),2)))))::numeric,1) end distance_m
 from public.events e join public.venues v on v.city_id=e.city_id
  and v.duplicate_of_id is null and v.closed_at is null
  and (e.country_id is null or v.country_id=e.country_id)
 where e.venue_id is null and nullif(btrim(e.venue_name),'') is not null and e.duplicate_of_id is null
  and e.is_public and coalesce(e.status,'active') not in ('archived','cancelled')
  and (not p_active_only or e.start_date is null or e.start_date>=now()-interval '1 year')
  and not exists(select 1 from public.cities c where c.duplicate_of_id is null and lower(btrim(c.name))=lower(btrim(e.venue_name)))
  and not exists(select 1 from public.queer_villages q where lower(btrim(q.name))=lower(btrim(e.venue_name)))
  and public.normalize_name(e.venue_name)<>''
  and (public.normalize_name(v.name)=public.normalize_name(e.venue_name)
   or extensions.similarity(coalesce(v.name_normalized,public.normalize_name(v.name)),public.normalize_name(e.venue_name))>=0.80)
 ), batch as (
  select c.event_id from candidates c group by c.event_id
  order by (count(*) filter(where name_exact)=1) desc,max(start_date) desc nulls last,c.event_id
  limit greatest(0,least(coalesce(p_limit,500),2000))
 )
 select c.event_id,c.venue_id,c.event_venue_name,c.venue_name,c.name_exact,c.distance_m
 from candidates c join batch b using(event_id)
 order by c.event_id,c.name_exact desc,c.distance_m nulls last,c.venue_id
$$;
revoke all on function public.find_event_venue_candidates(integer,boolean) from public,anon,authenticated;
grant execute on function public.find_event_venue_candidates(integer,boolean) to service_role;

-- Keep all existing event collision checks, but never select one surviving candidate
-- from an ambiguous exact-name set merely because the other candidate is farther away.
do $patch$
declare src text; before_text text:='WHERE name_exact AND (distance_m IS NULL OR distance_m < 100000)';
 after_text text:='WHERE name_exact AND (distance_m IS NULL OR distance_m < 500)
      AND (SELECT count(*) FROM cand all_exact WHERE all_exact.event_id=cand.event_id AND all_exact.name_exact)=1';
 n integer;
begin
 select pg_get_functiondef('public.link_event_venues(integer,boolean,boolean)'::regprocedure) into src;
 n:=(length(src)-length(replace(src,before_text,'')))/length(before_text);
 if n<>2 then raise exception 'Expected two matcher guards; got %',n; end if;
 execute replace(src,before_text,after_text);
end $patch$;

create function public.reconcile_event_venue_quality_reviews(p_batch integer default 500,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
 perform public.assert_admin_or_internal();
 if not pg_try_advisory_xact_lock(hashtext('event_venue_review_cleanup')) then return jsonb_build_object('skipped',true); end if;
 for r in select i.id,i.event_id from public.event_quality_issues i
  where i.status='open' and i.issue_code='NAMED_VENUE_UNLINKED'
   and not exists(select 1 from public.event_quality_findings(i.event_id) f where f.issue_code=i.issue_code)
  order by i.detected_at limit greatest(0,least(coalesce(p_batch,500),2000)) for update of i skip locked loop
  n:=n+1;
  if not p_dry_run then
   update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=now(),reviewed_by=null,
    resolution='auto-reconcile: current linkage detector no longer reports this issue; no human verification claimed' where id=r.id;
   update public.event_quality_current c set open_issue_codes=coalesce((select array_agg(i.issue_code order by i.issue_code)
    from public.event_quality_issues i where i.event_id=r.event_id and i.status='open'),'{}'::text[]) where c.event_id=r.event_id;
  end if;
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'resolved_venue_findings',n);
end $$;
revoke all on function public.reconcile_event_venue_quality_reviews(integer,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_event_venue_quality_reviews(integer,boolean) to service_role;

-- Reuse the existing enabled/paused automation and its run log. Cleanup executes
-- after successful linking within the same transaction, including five-minute runs.
do $patch$
declare src text; anchor text:='v_result := public.link_event_venues(500, true, false);';
begin
 select pg_get_functiondef('public.run_event_venue_link()'::regprocedure) into src;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Venue automation anchor changed'; end if;
 execute replace(src,anchor,anchor||E'\n  v_result := v_result || public.reconcile_event_venue_quality_reviews(500,false);');
end $patch$;

create function public.get_event_venue_review_context(p_event_id uuid,p_search text default null)
returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare e public.events; result jsonb;
begin
 if auth.uid() is null or not public.has_role_jwt('admin'::public.app_role) then raise exception 'Admin account required' using errcode='42501'; end if;
 select * into strict e from public.events where id=p_event_id;
 select jsonb_build_object('event',jsonb_build_object('id',e.id,'venue_name',e.venue_name,'venue_id',e.venue_id,
  'city_id',e.city_id,'country_id',e.country_id,'updated_at',e.updated_at,'source_url',coalesce(e.website,e.ticket_url)),
  'city',(select name from public.cities where id=e.city_id),
  'country',(select name from public.countries where id=e.country_id),
  'candidates',coalesce((select jsonb_agg(to_jsonb(c)) from (
   select v.id,v.name,v.address,v.website,v.city_id,v.country_id,
    public.normalize_name(v.name)=public.normalize_name(e.venue_name) name_exact,
    case when e.latitude is not null and e.longitude is not null and v.latitude is not null and v.longitude is not null
     then round((2*6371000*asin(least(1.0::float8,sqrt(power(sin(radians((v.latitude-e.latitude)::float8)/2),2)+
      cos(radians(e.latitude::float8))*cos(radians(v.latitude::float8))*power(sin(radians((v.longitude-e.longitude)::float8)/2),2)))))::numeric,1) end distance_m
   from public.venues v where v.city_id=e.city_id and v.duplicate_of_id is null and v.closed_at is null
    and (e.country_id is null or v.country_id=e.country_id)
    and case when nullif(btrim(p_search),'') is not null then position(lower(btrim(p_search)) in lower(v.name))>0
      else extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name))>=0.35 end
   order by (public.normalize_name(v.name)=public.normalize_name(e.venue_name)) desc,
    extensions.similarity(public.normalize_name(v.name),public.normalize_name(e.venue_name)) desc,v.id limit 20
  ) c),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_event_venue_review_context(uuid,text) from public,anon;
grant execute on function public.get_event_venue_review_context(uuid,text) to authenticated,service_role;

create function public.admin_review_link_event_venue(p_queue_type text,p_item_id uuid,p_venue_id uuid,p_expected_updated_at timestamptz,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event_id uuid; e public.events; v public.venues; changed integer;
begin
 if auth.uid() is null or not public.has_role_jwt('admin'::public.app_role) then raise exception 'Admin account required' using errcode='42501'; end if;
 if p_queue_type='general-review' then
  select entity_id into v_event_id from public.review_queue where id=p_item_id and entity_type='event' and review_type='venue_link_candidate' and status='pending';
 elsif p_queue_type='event-quality' then
  select q.event_id into v_event_id from public.event_quality_issues q where id=p_item_id and issue_code='NAMED_VENUE_UNLINKED' and status='open';
 else raise exception 'Unsupported venue review source'; end if;
 if v_event_id is null then raise exception 'This item is no longer pending. Refresh the queue.' using errcode='40001'; end if;
 select * into strict e from public.events where id=v_event_id for update;
 -- Lock in event-first order, matching the event's linkage trigger, then recheck
 -- pending membership to serialize decisions arriving through sibling queues.
 if p_queue_type='general-review' then
  perform 1 from public.review_queue where id=p_item_id and status='pending' for update;
 else
  perform 1 from public.event_quality_issues where id=p_item_id and status='open' for update;
 end if;
 if not found then raise exception 'This item is no longer pending. Refresh the queue.' using errcode='40001'; end if;
 if e.updated_at is distinct from p_expected_updated_at then raise exception 'Event changed since comparison. Reload the candidates.' using errcode='40001'; end if;
 if e.venue_id is not null or e.duplicate_of_id is not null then raise exception 'Event already linked or merged. Refresh the queue.'; end if;
 select * into strict v from public.venues where id=p_venue_id for share;
 if e.city_id is null or v.city_id is distinct from e.city_id or (e.country_id is not null and v.country_id is distinct from e.country_id)
  or v.closed_at is not null or v.duplicate_of_id is not null then raise exception 'Select an open canonical venue in the event city and country'; end if;
 if exists(select 1 from public.events other where other.id<>e.id and other.venue_id=v.id
  and lower(btrim(other.title))=lower(btrim(e.title)) and other.start_date=e.start_date and other.status<>'archived') then
  raise exception 'This link would conflict with another event occurrence. Review duplicates first'; end if;
 update public.events set venue_id=v.id,updated_at=now(),field_provenance=coalesce(field_provenance,'{}'::jsonb)||
  jsonb_build_object('venue_id',jsonb_build_object('source','admin_matching_review','value',v.id,'reviewer_id',auth.uid(),'reviewed_at',now(),'note',p_notes)) where id=e.id;
 -- The existing event trigger closes general-review rows. Reconcile its sibling issue here.
 update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=now(),reviewed_by=auth.uid(),
  resolution='Venue linked after catalogue comparison: '||coalesce(p_notes,'') where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open';
 update public.event_quality_current c set open_issue_codes=coalesce((select array_agg(i.issue_code order by i.issue_code)
  from public.event_quality_issues i where i.event_id=e.id and i.status='open'),'{}'::text[]) where c.event_id=e.id;
 insert into public.admin_review_decisions(queue_key,item_id,actor_id,decision,notes) values(p_queue_type,p_item_id,auth.uid(),'approve',p_notes);
 return jsonb_build_object('ok',true,'event_id',e.id,'venue_id',v.id);
end $$;
revoke all on function public.admin_review_link_event_venue(text,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_review_link_event_venue(text,uuid,uuid,timestamptz,text) to authenticated,service_role;

-- Small deterministic batches run every five minutes, following the existing
-- enabled/paused switch. This changes cadence, not its authorization policy.
update public.admin_automations set schedule='*/5 * * * *' where slug='event_venue_link';
select cron.schedule('event_venue_link','*/5 * * * *','SELECT public.run_event_venue_link();');

