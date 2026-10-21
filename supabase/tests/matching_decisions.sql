-- Behavioral regression on real schema, fully rolled back. No lasting decisions.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.user_roles where role='admin' limit 1),true);
do $$
declare e public.events; v public.venues; wrong uuid; q uuid; result jsonb; ts timestamptz;
begin
 if auth.uid() is null then raise exception 'Test requires an existing admin'; end if;
 select ev.* into strict e from public.events ev join public.review_queue r on r.entity_id=ev.id
  where r.entity_type='event' and r.review_type='venue_link_candidate' and r.status='pending'
   and ev.venue_id is null and ev.city_id is not null and exists(select 1 from public.venues vx where vx.city_id=ev.city_id and vx.closed_at is null and vx.duplicate_of_id is null and (ev.country_id is null or vx.country_id=ev.country_id)) limit 1;
 select * into strict v from public.venues where city_id=e.city_id and closed_at is null and duplicate_of_id is null and (e.country_id is null or country_id=e.country_id) limit 1;
 select id into strict q from public.review_queue where entity_id=e.id and entity_type='event' and review_type='venue_link_candidate' and status='pending' limit 1;
 result:=public.get_event_venue_review_context(e.id,v.name);
 if not ((result->'event')?'address') or result#>>'{event,address}' is distinct from e.address then raise exception 'Live source address missing from comparison'; end if;
 if not exists(select 1 from jsonb_array_elements(result->'candidates') c where c->>'id'=v.id::text) then raise exception 'Selected same-city candidate missing'; end if;
 begin
  perform public.admin_review_link_event_venue('general-review',q,v.id,e.updated_at-interval '1 second');
  raise exception 'Stale review accepted';
 exception when serialization_failure then null; end;
 select id into wrong from public.venues where city_id<>e.city_id and closed_at is null and duplicate_of_id is null limit 1;
 begin
  perform public.admin_review_link_event_venue('general-review',q,wrong,e.updated_at);
  raise exception 'Cross-city match accepted';
 exception when others then if sqlerrm not like 'Select an open canonical venue%' then raise; end if; end;
 update public.venues set closed_at=now() where id=v.id;
 begin
  perform public.admin_review_link_event_venue('general-review',q,v.id,e.updated_at);
  raise exception 'Closed venue accepted';
 exception when others then if sqlerrm not like 'Select an open canonical venue%' then raise; end if; end;
 update public.venues set closed_at=null where id=v.id;
 result:=public.admin_review_link_event_venue('general-review',q,v.id,e.updated_at,'Rolled-back matching regression');
 if result->>'ok'<>'true' or not exists(select 1 from public.events where id=e.id and venue_id=v.id) then raise exception 'Link not applied'; end if;
 if exists(select 1 from public.review_queue where id=q and status='pending') then raise exception 'General review not reconciled'; end if;
 if exists(select 1 from public.event_quality_issues where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open') then raise exception 'Sibling finding not reconciled'; end if;
 if not exists(select 1 from public.admin_review_decisions where item_id=q and actor_id=auth.uid() and decision='approve') then raise exception 'Human audit missing'; end if;
 begin
  perform public.admin_review_link_event_venue('general-review',q,v.id,e.updated_at);
  raise exception 'Repeated review accepted';
 exception when serialization_failure then null; end;
 if has_function_privilege('anon','public.admin_review_link_event_venue(text,uuid,uuid,timestamptz,text)','execute') then raise exception 'Anonymous mutation exposed'; end if;
 if has_function_privilege('authenticated','public.find_event_venue_candidates(integer,boolean)','execute') then raise exception 'Internal batch exposed'; end if;
end $$;
rollback;
