-- City cases previously returned current_record=null. Supply the stored identity,
-- conflicting source coordinates and all relationship counts before a decision.
create function api_private.admin_review_city_context(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'id',c.id,'name',c.name,'country',co.name,'country_code',co.code,
  'region_name',c.region_name,'region_code',c.region_code,'latitude',c.latitude,'longitude',c.longitude,
  'shell_status',c.shell_status,'seo_indexable',c.seo_indexable,'wikidata_qid',c.wikidata_qid,
  'wikipedia_title',c.wikipedia_title,'official_website',c.official_website,'data_source',c.data_source,
  'updated_at',c.updated_at,'classification',c.field_provenance->'city_place_audit',
  'source_coordinates',c.field_provenance#>'{coords,value}',
  'retracted_identity',jsonb_build_object('qid',c.field_provenance#>>'{wikidata_repair_retracted,from_qid}',
   'title',c.field_provenance#>>'{wikidata_repair_retracted,from_title}',
   'reason',c.field_provenance#>>'{wikidata_repair_retracted,reason}'),
  'geography',jsonb_build_object('status',v.status,'checks',v.checks,'sources',v.sources),
  'relationship_counts',jsonb_build_object(
   'venues',(select count(*)from public.venues where city_id=c.id),
   'events',(select count(*)from public.events where city_id=c.id),
   'organizations',(select count(*)from public.organizations where city_id=c.id),
   'hotels',(select count(*)from public.hotels where city_id=c.id),
   'neighbourhoods',(select count(*)from public.queer_villages where city_id=c.id),
   'child_places',(select count(*)from public.geo_places where parent_id=c.id),
   'news_articles',(select count(*)from (select article_id from public.news_article_cities where city_id=c.id
    union select id from public.news_articles where city_ids @>array[c.id]) n),
   'birthplaces',(select count(*)from public.personalities where city_id=c.id),
   'death_places',(select count(*)from public.personalities where death_city_id=c.id),
   'festivals',(select count(*)from public.festivals where city_id=c.id),
   'guides',(select count(*)from public.guides where city_id=c.id),
   'milestones',(select count(*)from public.milestones where city_id=c.id),
   'competition_editions',(select count(*)from public.competition_editions where host_city_id=c.id),
   'competition_entrants',(select count(*)from public.competition_entrants where city_id=c.id),
   'saved_and_private_links',
    (select count(*)from public.trip_destinations where city_id=c.id)+
    (select count(*)from public.trip_places where city_id=c.id)+
    (select count(*)from public.reservations where city_id=c.id)+
    (select count(*)from public.city_favorites where city_id=c.id)+
    (select count(*)from public.user_place_marks where city_id=c.id)+
    (select count(*)from public.user_presence_location where city_id=c.id)+
    (select count(*)from public.intimate_cruising_mode where city_id=c.id)))
 from public.cities c left join public.countries co on co.id=c.country_id
 left join public.geo_cms_verifications v on v.place_id=c.id where c.id=p_id;
$fn$;
revoke all on function api_private.admin_review_city_context(uuid) from public,anon,authenticated;
grant execute on function api_private.admin_review_city_context(uuid) to service_role;

do $context$
declare definition text;anchor text:=$anchor$'members',v_members,'candidates',v_candidates,$anchor$;
begin
 definition:=pg_get_functiondef('api_private.get_admin_review_case_details(uuid)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Case detail contract changed';end if;
 -- Preserve the existing staff-role, per-case and per-source authorization.
 if position('review_case_sources_authorized(c.members)'in definition)=0
  or position('review_case_can_read(c.required_role)'in definition)=0
 then raise exception 'Case authorization contract changed';end if;
 execute replace(definition,anchor,$replacement$'members',v_members,'city_context',case when c.family='city_identity'
  then api_private.admin_review_city_context((c.item->>'entity_id')::uuid) else null end,'candidates',v_candidates,$replacement$);
end $context$;
