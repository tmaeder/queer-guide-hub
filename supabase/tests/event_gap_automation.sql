-- Run against the production schema after the migration, or the minimal harness.
-- Every fixture and mutation rolls back.
begin;
do $$
declare
 a uuid; b uuid; ongoing uuid; dead uuid; t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid();
 r jsonb; n integer; selected uuid; description_text text:=repeat('Evidence grounded event description. ',4);
begin
 insert into public.events(title,slug,start_date,end_date,description,website,status,data_source)
 values('Gap fixture A','gap-fixture-a',now()+interval '1 day',now()+interval '1 day 2 hours','',
 'https://events.example.org/a','active','gap-fixture') returning id into a;
 insert into public.events(title,slug,start_date,end_date,description,website,status,data_source)
 values('Gap fixture B','gap-fixture-b',now()+interval '100 days',now()+interval '100 days 2 hours','',
 'https://events.example.org/b','active','gap-fixture') returning id into b;
 insert into public.events(title,slug,start_date,end_date,description,website,status,data_source)
 values('Gap ongoing','gap-fixture-ongoing',now()-interval '3 days',now()+interval '2 days','',
 'https://events.example.org/ongoing','active','gap-fixture') returning id into ongoing;
 insert into public.events(title,slug,start_date,end_date,description,website,status,data_source)
 values('Gap cancelled','gap-fixture-cancelled',now()+interval '1 day',now()+interval '2 days','',
 'https://events.example.org/dead','cancelled','gap-fixture') returning id into dead;
 select count(*) into n from public.claim_event_gaps('content',t,10,array[a,b,ongoing,dead],true);
 assert n=3,'dry-run must preview eligible events before queue exists';
 assert not exists(select 1 from public.event_gap_queue where event_id=any(array[a,b,ongoing,dead])),
 'dry-run must not enqueue or lease';
 select event_id into selected from public.claim_event_gaps('content',t,1,array[a,b,ongoing,dead]);
 assert selected=ongoing,'ongoing events must rank ahead of distant future';
 r:=public.finish_event_gap(ongoing,'content',null,'{}','{}','no_change');
 assert r->>'outcome'='lease_lost','null token completed a leased item';
 select count(*) into n from public.claim_event_gaps('content',t2,10,array[ongoing]);
 assert n=0,'second worker claimed leased task';
 r:=public.finish_event_gap(ongoing,'content',t2,jsonb_build_object('description',description_text),
 '{"confidence":1,"source_url":"https://events.example.org/ongoing"}','updated');
 assert r->>'outcome'='lease_lost','foreign token updated event';
 r:=public.finish_event_gap(ongoing,'content',t,'{}','{}','updated');
 assert r->>'outcome'='no_change','zero-field attempt counted as productive';
 assert (select next_attempt_at>now()+interval '1 day' from public.event_gap_queue where event_id=ongoing and lane='content'),
 'no-change did not back off';
 select count(*) into n from public.claim_event_gaps('content',t,10,array[ongoing]);
 assert n=0,'explicit IDs bypassed cooldown';
 update public.events set website='https://events.example.org/new-ongoing' where id=ongoing;
 select count(*) into n from public.claim_event_gaps('content',t,10,array[ongoing]);
 assert n=1,'changed input failed to reopen work';
 -- A curated edit after claiming wins over a stale proposed fill.
 update public.events set description=description_text where id=ongoing;
 r:=public.finish_event_gap(ongoing,'content',t,jsonb_build_object('description',repeat('Stale content. ',10)),
 '{"confidence":1,"source_url":"https://events.example.org/ongoing"}','updated');
 assert r->>'outcome'='no_change','stale fill overwrote a curated description';
 assert (select description=description_text from public.events where id=ongoing),'curated edit lost';
 perform * from public.claim_event_gaps('content',t,10,array[a]);
 insert into public.event_quality_current(event_id,rubric_version,event_scope,completeness_score,
   validity_score,linkage_score,provenance_score,media_score,freshness_score,overall_score,quality_tier,input_updated_at)
 values(a,1,'current',50,50,50,50,50,50,50,'warn',now()) on conflict do nothing;
 r:=public.finish_event_gap(a,'content',t,jsonb_build_object('description',description_text,'venue_name','Named Venue'),
 '{"confidence":1,"source_url":"https://events.example.org/a"}','updated');
 assert r->>'outcome'='updated','evidence-backed fill failed';
 assert (r->'fields') ? 'description','persisted description not counted';
 assert (select field_provenance->'description'->>'source_url'='https://events.example.org/a' from public.events where id=a),
 'fill has no attributable provenance';
 assert not exists(select 1 from public.event_quality_current where event_id=a),'changed event assessment was not invalidated';
 perform * from public.claim_event_gaps('image',t,10,array[b]);
 update public.events set images=array['https://events.example.org/curated.jpg'] where id=b;
 r:=public.finish_event_gap(b,'image',t,'{"images":["https://events.example.org/stale.jpg"]}',
 '{"confidence":1,"source_url":"https://events.example.org/b","previous_images":null}','updated');
 assert r->>'outcome'='no_change','stale image replacement overwrote editor';
 -- Failed leases recover automatically after expiry.
 perform * from public.claim_event_gaps('content',t,10,array[b]);
 update public.event_gap_queue set lease_until=now()-interval '1 second' where event_id=b and lane='content';
 select count(*) into n from public.claim_event_gaps('content',t2,10,array[b]);
 assert n=1,'expired lease was not recovered';
 r:=public.finish_event_gap(b,'content',t,'{}','{}','no_change');
 assert r->>'outcome'='lease_lost','expired owner completed reclaimed work';
 r:=public.finish_event_gap(b,'content',t2,'{}','{}','capped','{"reason":"daily_budget"}');
 assert (r->>'next_attempt_at')::timestamptz=(current_date+1)::timestamptz+interval '5 minutes',
 'spent budget retries before the next daily window';
 -- Budget cannot be bypassed by explicit IDs, concurrent workers or lower cap.
 insert into public.llm_budget(caller_key,daily_cap,spent_today,window_start)
 values('event-agentic-enrich',60,0,current_date)
 on conflict(caller_key) do update set daily_cap=60,spent_today=0,window_start=current_date;
 assert public.consume_event_gap_budget(1),'first budget reservation failed';
 assert not public.consume_event_gap_budget(1),'lower budget cap bypassed';
 assert not public.consume_event_gap_budget(0),'zero budget cap bypassed';
 assert public.consume_event_gap_budget(),'default null cap incorrectly denied spend';
 update public.llm_budget set spent_today=60 where caller_key='event-agentic-enrich';
 assert not public.consume_event_gap_budget(),'daily ledger cap bypassed';
 update public.llm_budget set window_start=current_date-1 where caller_key='event-agentic-enrich';
 assert public.consume_event_gap_budget(),'daily window failed to reset';
 assert not has_function_privilege('anon','public.claim_event_gaps(text,uuid,integer,uuid[],boolean)','execute'),
 'anonymous callers can claim internal work';
 assert not has_table_privilege('authenticated','public.event_gap_queue','select'),'queue exposed to users';
end $$;
rollback;
