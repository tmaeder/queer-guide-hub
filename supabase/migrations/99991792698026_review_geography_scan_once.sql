-- The old planner evaluated a volatile relationship probe for 1,026 archived
-- cities before joining the 26 current verification candidates. Scan each
-- relationship once. The existing locked-row helper and trigger still recheck
-- every candidate before a real disposition; historical links are preserved.
-- Final locked-row probes and relationship triggers still use array containment.
-- Avoid a full news table scan for every such probe (no existing city_ids index).
create index if not exists idx_news_articles_city_ids_gin
 on public.news_articles using gin(city_ids);

do $patch$
declare s text; anchor text:=$anchor$ for r in select v.* from public.geo_cms_verifications v join public.cities c on c.id=v.place_id
  where v.status in ('review','stale') and c.shell_status='ghost' and c.seo_indexable=false
   and api_private.review_inactive_city_unlinked(c.id) order by v.place_id limit v_limit for update of v skip locked loop$anchor$;
begin
 s:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then
  raise exception 'Geography candidate selector anchor changed'; end if;
 if position('where place_id=r.place_id and api_private.review_inactive_city_unlinked(r.place_id)' in s)=0 then
  raise exception 'Locked geography eligibility recheck must be retained'; end if;
 s:=replace(s,anchor,$replacement$ for r in with referenced as materialized (
 select distinct id from (select city_id id from public.venues union all select city_id from public.events
union all select city_id from public.organizations union all select city_id from public.hotels
union all select city_id from public.queer_villages union all select parent_id from public.geo_places
union all select city_id from public.news_article_cities union all select unnest(city_ids) from public.news_articles
union all select city_id from public.personalities union all select death_city_id from public.personalities
union all select city_id from public.festivals union all select city_id from public.guides
union all select city_id from public.milestones union all select host_city_id from public.competition_editions
union all select city_id from public.competition_entrants union all select city_id from public.trip_destinations
union all select city_id from public.trip_places union all select city_id from public.reservations
union all select city_id from public.city_favorites union all select city_id from public.user_place_marks
union all select city_id from public.user_presence_location union all select city_id from public.intimate_cruising_mode) links where id is not null
 )
 select v.* from public.geo_cms_verifications v join public.cities c on c.id=v.place_id
 where v.status in ('review','stale') and c.shell_status='ghost' and c.seo_indexable=false
 and c.duplicate_of_id is null and not exists(select 1 from referenced linked where linked.id=c.id)
 order by v.place_id limit v_limit for update of v skip locked loop$replacement$);
 execute s;
end $patch$;

-- Reconcile only untouched machine findings that the authoritative current
-- detector no longer emits. Lock the event with the issue and recheck after
-- locking; keep original evidence and record a machine disposition explicitly.
do $liveness$
declare s text; anchor text:=' for r in with referenced as materialized (';
begin
 s:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Scan-once selector must be present'; end if;
 if position('v_geo integer:=0;' in s)=0 or position('''geography_not_applicable'',v_geo,' in s)=0 then raise exception 'Resolution counters changed'; end if;
 s:=replace(s,'v_geo integer:=0;','v_liveness integer:=0; v_geo integer:=0;');
 s:=replace(s,anchor,$block$ for r in select i.* from public.event_quality_issues i join public.events e on e.id=i.event_id
 where i.status='open' and i.detector='event-quality-scan' and i.issue_code='LIVENESS_STALE'
 and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null
 and e.duplicate_of_id is null
 and not exists(select 1 from public.event_quality_findings(i.event_id) f where f.issue_code=i.issue_code)
 order by i.id limit v_limit for update of i,e skip locked loop
  v_liveness:=v_liveness+1;
  if not p_dry_run then
   update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=null,reviewed_by=null,
    resolution='auto-policy: current event detector no longer reports this liveness finding; no liveness verification or human review is claimed.'
   where id=r.id and not exists(select 1 from public.event_quality_findings(r.event_id) f where f.issue_code='LIVENESS_STALE')
   returning to_jsonb(event_quality_issues) into v_after;
   if v_after is null then v_liveness:=v_liveness-1; continue; end if;
   update public.event_quality_current set
    open_issue_codes=array_remove(open_issue_codes,'LIVENESS_STALE'),
    issue_codes=array_remove(issue_codes,'LIVENESS_STALE')
   where event_id=r.event_id;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('event_quality_issue',r.id,'stale_liveness_finding_cleared',to_jsonb(r),v_after);
  end if;
 end loop;
$block$||anchor);
 s:=replace(s,'''geography_not_applicable'',v_geo,','''stale_liveness_findings'',v_liveness,''geography_not_applicable'',v_geo,');
 execute s;
end $liveness$;
