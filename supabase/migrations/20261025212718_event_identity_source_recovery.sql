-- A verified organizer/event-family page is identity evidence, not edition-date proof.
create or replace function public.apply_event_source_evidence(p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb; e public.events%rowtype; proof jsonb; n integer:=0; skipped integer:=0;
begin
 if jsonb_typeof(p_evidence) is distinct from 'array' or jsonb_array_length(p_evidence)>250 then
  raise exception 'Expected at most 250 evidence records'; end if;
 for r in select value from jsonb_array_elements(p_evidence) loop
  if r->>'status' is distinct from 'verified' or r->>'scope' is distinct from 'series_identity' or r->>'dates_confirmed' is distinct from 'false'
    or coalesce(r->>'source_url','')!~'^https://[^/@]+/'
    or coalesce(r->>'content_sha256','')!~'^[0-9a-f]{64}$'
    or length(coalesce(r->>'evidence_quote',''))<4
    or (r->>'http_status')::integer is distinct from 200
    or coalesce((r->>'checked_at')::timestamptz,'-infinity')<now()-interval '7 days'
    or (r->>'checked_at')::timestamptz>now()+interval '5 minutes' then
   skipped:=skipped+1; continue;
  end if;
  select * into e from public.events where id=(r->>'id')::uuid for update;
  if not found or e.duplicate_of_id is not null or e.title is distinct from r->>'title'
    or e.city is distinct from r->>'city' then skipped:=skipped+1; continue; end if;
  proof:=jsonb_build_object('scope','series_identity','dates_confirmed',false,
    'source_url',r->>'source_url','quote',r->>'evidence_quote','content_sha256',r->>'content_sha256',
    'checked_at',r->>'checked_at','method','reviewed-candidate-live-http-v1');
  insert into public.event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary)
  values(e.id,'editorial-evidence',e.id::text,r->>'source_url',jsonb_build_object('identity_evidence',proof),md5(proof::text),1,false)
  on conflict(source_slug,source_entity_id) do update set source_url=excluded.source_url,
    payload=excluded.payload,payload_hash=excluded.payload_hash,last_seen_at=now()
  where event_sources.event_id=excluded.event_id;
  update public.events set website=case when nullif(btrim(website),'') is null then r->>'source_url' else website end,
    field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{source_identity}',proof),
    needs_attention=case when data_source like 'seed:%' then true else needs_attention end,updated_at=now()
  where id=e.id;
  delete from public.event_quality_current where event_id=e.id;
  n:=n+1;
 end loop;
 return jsonb_build_object('attributed',n,'skipped',skipped);
end $$;
revoke all on function public.apply_event_source_evidence(jsonb) from public,anon,authenticated;
grant execute on function public.apply_event_source_evidence(jsonb) to service_role;

create or replace function public.recover_event_series_sources()
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
 -- Exact family title AND city; never a fuzzy match across cities or broad "Pride" names.
 for r in
  select e.id,s.source_url,s.payload,s.payload_hash from public.events e
  join lateral(
   select es.source_url,es.payload,es.payload_hash from public.events parent
   join public.event_sources es on es.event_id=parent.id and es.source_slug='editorial-evidence'
   where parent.id<>e.id and parent.duplicate_of_id is null and parent.city=e.city
    and lower(btrim(regexp_replace(parent.title,'20[0-9]{2}','','g')))=lower(btrim(regexp_replace(e.title,'20[0-9]{2}','','g')))
    and es.payload#>>'{identity_evidence,scope}'='series_identity'
    and (es.payload#>>'{identity_evidence,checked_at}')::timestamptz>now()-interval '90 days'
   order by es.last_seen_at desc limit 1
  )s on true
  where e.status='active' and e.duplicate_of_id is null and e.data_source='seed:clone-from-2026'
   and nullif(btrim(e.website),'') is null and nullif(btrim(e.ticket_url),'') is null
   and not exists(select 1 from public.event_sources es where es.event_id=e.id and nullif(btrim(es.source_url),'') is not null)
  limit 100 for update of e skip locked
 loop
  insert into public.event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,confidence,is_primary)
  values(r.id,'editorial-evidence',r.id::text,r.source_url,r.payload,r.payload_hash,1,false)
  on conflict(source_slug,source_entity_id) do nothing;
  update public.events set website=r.source_url,needs_attention=true,
   field_provenance=jsonb_set(coalesce(field_provenance,'{}'),'{source_identity}',r.payload->'identity_evidence'),updated_at=now()
  where id=r.id and nullif(btrim(website),'') is null;
  delete from public.event_quality_current where event_id=r.id;
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.recover_event_series_sources() from public,anon,authenticated;
grant execute on function public.recover_event_series_sources() to service_role;
select cron.schedule('event_series_source_recovery','4 */6 * * *',$job$select public.recover_event_series_sources()$job$);

-- Keep identity coverage separate from edition verification in operational metrics.
do $$
declare def text;
begin
 select pg_get_functiondef('public.event_gap_metrics()'::regprocedure) into def;
 def:=replace(def,'select jsonb_build_object(', 'select jsonb_build_object(''identity_only_unconfirmed_editions'',(select count(*) from public.events e where e.status=''active'' and e.duplicate_of_id is null and e.data_source like ''seed:%'' and e.field_provenance#>>''{source_identity,dates_confirmed}''=''false'' and coalesce(e.field_provenance#>>''{verified_edition_date,verified}'',''false'')<>''true'' and coalesce(e.end_date,e.start_date)>=now()),''partial_source_calendars'',(select count(*) from public.events e where e.status=''active'' and e.field_provenance#>>''{source_schedule_recovery,outcome}''=''partial'' and coalesce(e.end_date,e.start_date)>=now()),');
 execute def;
end $$;
