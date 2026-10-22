-- The old planner evaluated a volatile relationship probe for 1,026 archived
-- cities before joining the 26 current verification candidates. Scan each
-- relationship once. The existing locked-row helper and trigger still recheck
-- every candidate before a real disposition; historical links are preserved.
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
