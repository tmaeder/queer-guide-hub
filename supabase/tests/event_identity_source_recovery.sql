begin;
do $$
declare a uuid; b uuid; c uuid; proof jsonb; result jsonb; started timestamptz;
begin
 insert into public.events(title,slug,city,start_date,event_type,status,data_source)
 values('Evidence fixture pride 2027','evidence-fixture-pride-2027','Test source city',now()+interval '1 year','social','active','seed:clone-from-2026') returning id into a;
 select start_date into started from public.events where id=a;
 proof:=jsonb_build_object('id',a,'title','Evidence fixture pride 2027','city','Test source city','status','verified',
  'scope','series_identity','dates_confirmed',false,'source_url','https://example.org/pride/',
  'http_status',200,'content_sha256',repeat('a',64),'checked_at',now(),'evidence_quote','Evidence fixture pride organizer');
 result:=public.apply_event_source_evidence(jsonb_build_array(proof-'status'));
 assert (result->>'skipped')::int=1,'missing verification status accepted';
 result:=public.apply_event_source_evidence(jsonb_build_array(proof||jsonb_build_object('checked_at',now()-interval '8 days')));
 assert (result->>'skipped')::int=1,'stale proof accepted';
 result:=public.apply_event_source_evidence(jsonb_build_array(proof));
 assert (result->>'attributed')::int=1,'verified identity not persisted';
 assert (select website='https://example.org/pride/' and start_date=started from public.events where id=a),'source fill changed dates';
 assert (select field_provenance#>>'{source_identity,dates_confirmed}'='false' from public.events where id=a),'identity promoted to date confirmation';
 update public.events set website='https://example.org/editor-choice/' where id=a;
 perform public.apply_event_source_evidence(jsonb_build_array(proof));
 assert (select website='https://example.org/editor-choice/' from public.events where id=a),'source fill overwrote editorial choice';
 assert (select count(*)=1 from public.event_sources where event_id=a and source_slug='editorial-evidence'),'retry duplicated source rows';
 insert into public.events(title,slug,city,start_date,event_type,status,data_source)
 values('Evidence fixture pride 2028','evidence-fixture-pride-2028','Test source city',now()+interval '2 years','social','active','seed:clone-from-2027') returning id into b;
 insert into public.events(title,slug,city,start_date,event_type,status,data_source)
 values('Evidence fixture pride 2028','evidence-fixture-pride-2028-other','Different source city',now()+interval '2 years','social','active','seed:clone-from-2026') returning id into c;
 perform public.recover_event_series_sources();
 assert (select website='https://example.org/pride/' from public.events where id=b),'exact family identity not inherited';
 assert (select website is null from public.events where id=c),'identity inherited across cities';
 assert not has_function_privilege('anon','public.apply_event_source_evidence(jsonb)','execute'),'anonymous source writer';
 assert not has_function_privilege('authenticated','public.recover_event_series_sources()','execute'),'public source propagation';
end $$;
rollback;
