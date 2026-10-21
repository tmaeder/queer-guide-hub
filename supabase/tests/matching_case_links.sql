-- Run on the real schema; every fixture, link, disposition and audit rolls back.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.user_roles where role='admin' limit 1),true);
do $$
declare e public.events; v public.venues; q uuid; issue uuid; m jsonb; sibling jsonb;
 c uuid:=gen_random_uuid(); result jsonb; member_ids jsonb;
begin
 if auth.uid() is null then raise exception 'Existing admin fixture required'; end if;
 select ev.* into strict e from public.events ev
 where ev.venue_id is null and ev.duplicate_of_id is null and ev.city_id is not null and ev.country_id is not null
 and exists(select 1 from public.review_queue r where r.entity_id=ev.id and r.entity_type='event' and r.review_type='venue_link_candidate' and r.status='pending')
 and exists(select 1 from public.event_quality_issues i where i.event_id=ev.id and i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open')
 and exists(select 1 from public.venues vx where vx.city_id=ev.city_id and vx.country_id=ev.country_id and vx.closed_at is null and vx.duplicate_of_id is null)
 and not exists(select 1 from public.events other where other.id<>ev.id and other.start_date=ev.start_date and public.normalize_name(other.title)=public.normalize_name(ev.title) and other.status<>'archived')
 order by ev.id limit 1;
 select * into strict v from public.venues where city_id=e.city_id and country_id=e.country_id and closed_at is null and duplicate_of_id is null
 and (latitude is null or longitude is null or e.latitude is null or e.longitude is null or public.haversine_m(latitude,longitude,e.latitude::numeric,e.longitude::numeric)<=500000)
 order by id limit 1;
 select id into strict q from public.review_queue where entity_id=e.id and entity_type='event' and review_type='venue_link_candidate' and status='pending' order by id limit 1;
 select id into strict issue from public.event_quality_issues where event_id=e.id and issue_code='NAMED_VENUE_UNLINKED' and status='open' order by id limit 1;
 m:=public.admin_review_item('general-review',q);
 sibling:=public.admin_review_item('event-quality',issue);
 if m is null or sibling is null then raise exception 'Source fixture unavailable'; end if;
 member_ids:=jsonb_build_array(q::text,issue::text);
 insert into public.admin_review_cases(id,case_key,family,stage,required_role,item,members,fingerprint,created_at)
 values(c,'matching-case-regression:'||c,'venue','ready','admin',m,jsonb_build_array(m,sibling),'matching-case-test',now());
 begin
  perform public.decide_admin_review_case(c,'stale-fingerprint','approve','Rolled-back case regression',true,jsonb_build_object('venue_id',v.id,'member_ids',member_ids,'expected_updated_at',e.updated_at));
  raise exception 'Stale case fingerprint accepted';
 exception when serialization_failure then null; end;
 result:=public.decide_admin_review_case(c,'matching-case-test','approve','Rolled-back case regression',true,
  jsonb_build_object('venue_id',v.id,'member_ids',member_ids,'expected_updated_at',e.updated_at));
 if result->>'ok'<>'true' or not exists(select 1 from public.events where id=e.id and venue_id=v.id) then raise exception 'Case did not apply actual venue link'; end if;
 if exists(select 1 from public.review_queue where id=q and status='pending') then raise exception 'Case left the sibling general review pending'; end if;
 if exists(select 1 from public.event_quality_issues where id=issue and status='open') then raise exception 'Case left sibling quality finding open'; end if;
 if exists(select 1 from public.admin_review_cases where id=c and active) then raise exception 'Case remained active'; end if;
 if not exists(select 1 from public.admin_review_decisions where item_id=c and actor_id=auth.uid() and decision='approve') then raise exception 'Case audit absent'; end if;
end $$;
select 'matching_case_link_regression_passed' result;
rollback;
