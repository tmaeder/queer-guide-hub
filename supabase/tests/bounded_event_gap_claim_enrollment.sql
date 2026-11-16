-- Internal integration regression. All events, leases and trigger effects roll back.
begin;
set local statement_timeout='30s';
do $test$
declare ids uuid[]; selected uuid[]; first_claim uuid[]; token uuid:=gen_random_uuid();
 second_token uuid:=gen_random_uuid(); held uuid; cooldown uuid; old_hash text; before_event jsonb;
begin
 select array_agg(gen_random_uuid()) into ids from generate_series(1,6);
 insert into public.events(id,title,event_type,start_date,slug,is_public,status,website)
 select id,'Bounded image regression '||id,'social',now()+interval '2 days',
  'bounded-image-regression-'||id,false,'active','https://example.com/event/'||id from unnest(ids) id;
 select array_agg(event_id) into selected from public.claim_event_gaps('image',token,2,ids,true);
 if cardinality(selected)<>2 or exists(select from public.event_gap_queue where event_id=any(ids)) then
  raise exception 'Dry run did not remain bounded and read-only';end if;
 perform public.claim_event_gaps('image',token,0,ids,false);
 if exists(select from public.event_gap_queue where event_id=any(ids)) then raise exception 'Zero batch enrolled rows';end if;
 select array_agg(event_id) into first_claim from public.claim_event_gaps('image',token,2,ids,false);
 if cardinality(first_claim)<>2 or (select count(*) from public.event_gap_queue where event_id=any(ids))<>2 then
  raise exception 'Enrollment exceeded the claim batch';end if;
 held:=first_claim[1]; cooldown:=first_claim[2];
 select input_hash into old_hash from public.event_gap_queue where event_id=held and lane='image';
 update public.events set website='https://example.com/changed/'||id where id=held;
 select array_agg(event_id) into selected from public.claim_event_gaps('image',second_token,2,ids,false);
 if cardinality(selected)<>2 or selected&&first_claim
  or (select count(*) from public.event_gap_queue where event_id=any(ids))<>4 then
  raise exception 'Leased work was stolen or remaining enrollment starved';end if;
 if not exists(select from public.event_gap_queue where event_id=held and lane='image'
  and lease_token=token and input_hash=old_hash) then raise exception 'Active changed-input lease was overwritten';end if;
 update public.event_gap_queue set lease_token=null,lease_until=null,next_attempt_at=now()+interval '1 day'
  where event_id=cooldown and lane='image';
 perform public.claim_event_gaps('image',second_token,2,ids,false);
 if not exists(select from public.event_gap_queue where event_id=cooldown and lane='image'
  and lease_token is null and next_attempt_at>now()) then raise exception 'Unchanged cooldown was reset';end if;
 -- Changed input may reopen a cooled task once its earlier lease expires.
 update public.event_gap_queue set lease_until=now()-interval '1 second',next_attempt_at=now()+interval '1 day'
  where event_id=held and lane='image';
 select to_jsonb(e) into before_event from public.events e where id=held;
 perform public.claim_event_gaps('image',second_token,1,array[held],false);
 if not exists(select from public.event_gap_queue where event_id=held and lane='image'
  and lease_token=second_token and input_hash<>old_hash) then raise exception 'Changed input did not reopen after lease expiry';end if;
 if before_event is distinct from(select to_jsonb(e) from public.events e where id=held) then
  raise exception 'Claim mutated the event';end if;
 if exists(select from public.events e cross join(values('image'),('content'))lane(name)
  where e.id=any(ids) and public.event_gap_input(e,lane.name) is distinct from
   pg_catalog.md5(pg_catalog.jsonb_build_array(e.website,e.ticket_url,e.status,e.start_date,e.end_date,e.duplicate_of_id,
    case when lane.name='image' then pg_catalog.to_jsonb(e.images) else pg_catalog.jsonb_build_array(
     e.description,e.venue_name,e.address,e.accessibility_attributes,e.target_groups,e.age_restriction) end)::text)) then
  raise exception 'Fingerprint compatibility failed';end if;
end $test$;
select 'Bounded enrollment, dry run, zero batch, lease protection, cooldown, input reopening and fingerprint compatibility passed' result;
rollback;
