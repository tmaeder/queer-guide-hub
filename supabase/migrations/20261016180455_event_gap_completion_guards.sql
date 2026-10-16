-- Fence unclaimed results and promptly continue recovering core gaps.
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
 if not found or p_token is null or q.lease_token is null or q.lease_until is null
   or q.lease_token is distinct from p_token or q.lease_until<=now() then
   return jsonb_build_object('outcome','lease_lost','fields','[]'::jsonb); end if;
 select * into e from public.events where id=p_event_id for update;
 old_e:=e;
 if e.duplicate_of_id is not null or e.status is distinct from 'active'
   or (coalesce(e.end_date,e.start_date)<now()) then
   update public.event_gap_queue set lease_token=null,lease_until=null,next_attempt_at=now()+interval '30 days',
     last_outcome='ineligible',updated_at=now() where event_id=p_event_id and lane=p_lane;
   return jsonb_build_object('outcome','ineligible','fields','[]'::jsonb); end if;
 v_prov:=coalesce(e.field_provenance,'{}');
 v_conf:=coalesce((p_evidence->>'confidence')::numeric,0);
 if p_outcome not in ('no_change','failed','blocked','capped','review','updated') then raise exception 'invalid outcome'; end if;
 if v_conf>=0.8 and public.event_quality_url_is_safe(p_evidence->>'source_url') then
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
 if jsonb_typeof(p_details->'extraction')='object' and p_outcome<>'review' then
   update public.events set enrichment_status=jsonb_set(coalesce(enrichment_status,'{}'),'{agentic}',
     (p_details->'extraction')||jsonb_build_object('at',now(),'source_url',p_evidence->>'source_url'))
   where id=p_event_id;
 end if;
 if p_outcome='review' then update public.events set needs_attention=true where id=p_event_id; end if;
 v_outcome:=case when cardinality(v_fields)>0 then 'updated' when p_outcome='updated' then 'no_change' else p_outcome end;
 v_streak:=case when cardinality(v_fields)>0 then 0 when v_outcome='capped' then q.no_change_streak else q.no_change_streak+1 end;
 v_delay:=case when v_outcome='updated' and p_lane='content' and length(btrim(coalesce(e.description,'')))<80 then interval '15 minutes'
   when v_outcome='updated' then interval '14 days'
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

-- Due counts use the same live image-gap predicate as the claim selector.
create or replace function public.event_gap_metrics()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('backlog',(select coalesce(jsonb_agg(t),'[]') from (
   select q.lane,count(*) as tracked,count(*) filter(where next_attempt_at<=now() and coalesce(lease_until,'-infinity')<now()
       and (q.lane='content' or cardinality(coalesce(e.images,'{}'))=0 or exists(
         select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open'
           and i.issue_code in ('IMAGE_UNREACHABLE','IMAGE_LOW_RESOLUTION','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL')))) as due,
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
