begin;

-- REST Countries calls the subregion "Eastern Asia" while the internal
-- vocabulary uses "East Asia". These two exact ISO identities are therefore
-- deterministic, not editorial decisions.
update public.countries c
set region_id = r.id,
    enrichment_status = jsonb_set(coalesce(c.enrichment_status, '{}'::jsonb),
      '{region}', jsonb_build_object('state','mapped','source','restcountries',
        'source_value','Eastern Asia','method','reviewed_exact_alias','at',now()), true),
    updated_at = now()
from public.regions r
join public.continents ct on ct.id = r.continent_id
where c.code in ('HK','MO') and r.name='East Asia' and ct.name='Asia';

-- Run the existing exact-name resolver before dispositioning the genuinely
-- non-geographic / historical remainder.
select public.run_milestone_geography_resolution(500);

update public.milestones
set geography_exemption_reason = case
  when country_name='East Germany (GDR)'
    then 'Historical state: no current-country foreign key is semantically exact.'
  when country_name is not null or city_name is not null or location is not null or region is not null
    then 'Regional, multinational, historical, or ambiguous location retained for editorial review.'
  else 'Global, multinational, or non-location-specific milestone; country is not applicable.'
end,
updated_at = now()
where city_id is null and country_id is null and geography_exemption_reason is null;

-- Provider licences are stable contracts. Complete deterministic metadata but
-- do not invent attribution or a Commons licence when it is absent.
update public.countries c
set image_metadata = coalesce(c.image_metadata,'{}'::jsonb)
  || case
    when coalesce(c.image_metadata->>'source','')='' and coalesce(c.curated_image_url,c.image_url,'') like '%images.pexels.com%'
      then jsonb_build_object('source','pexels','source_url',coalesce(c.curated_image_url,c.image_url))
    when coalesce(c.image_metadata->>'source','')='' and coalesce(c.curated_image_url,c.image_url,'') like '%images.unsplash.com%'
      then jsonb_build_object('source','unsplash','source_url',coalesce(c.curated_image_url,c.image_url))
    else '{}'::jsonb end
  || case
    when coalesce(c.image_metadata->>'license','')='' and
      (coalesce(c.image_metadata->>'source','')='pexels' or coalesce(c.curated_image_url,c.image_url,'') like '%images.pexels.com%')
      then jsonb_build_object('license','Pexels License')
    when coalesce(c.image_metadata->>'license','')='' and
      (coalesce(c.image_metadata->>'source','')='unsplash' or coalesce(c.curated_image_url,c.image_url,'') like '%images.unsplash.com%')
      then jsonb_build_object('license','Unsplash License')
    else '{}'::jsonb end
  || case when coalesce(c.curated_image_url,c.image_url,'') ~* '(img\.queer\.guide|/storage/v1/object/public/)'
      then jsonb_build_object('stored_locally',true) else '{}'::jsonb end
  || case
    when coalesce((c.image_metadata->>'has_queer_content')::boolean,false)
      then jsonb_build_object('relevance_review','approved','relevance_review_reason','queer_content_verified','relevance_reviewed_at',now())
    when coalesce((c.image_metadata->>'score')::numeric,0)>=60 and nullif(c.image_metadata->>'source','') is not null
      then jsonb_build_object('relevance_review','exception_approved','relevance_review_reason','geographically_relevant_country_safety_cover','relevance_reviewed_at',now())
    else '{}'::jsonb end,
updated_at = now()
where c.duplicate_of_id is null;

-- Keep the normalized asset registry authoritative and synchronized with the
-- compatibility country fields.
update public.image_assets ia
set source = coalesce(nullif(c.image_metadata->>'source',''),ia.source),
    source_ref = coalesce(nullif(c.image_metadata->>'source_url',''),nullif(c.image_metadata->>'photographer_url',''),ia.source_ref),
    license = coalesce(nullif(c.image_metadata->>'license',''),ia.license),
    attribution = coalesce(nullif(c.image_metadata->>'photographer',''),ia.attribution),
    alt_text = coalesce(nullif(c.image_metadata->>'alt',''),ia.alt_text),
    metadata = coalesce(ia.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'stored_locally',case when coalesce(c.curated_image_url,c.image_url,'') ~* '(img\.queer\.guide|/storage/v1/object/public/)'
        or coalesce((c.image_metadata->>'stored_locally')::boolean,false) then true else null end,
      'relevance_review',nullif(c.image_metadata->>'relevance_review',''),
      'relevance_review_reason',nullif(c.image_metadata->>'relevance_review_reason',''))),
    updated_at = now()
from public.image_asset_links l
join public.countries c on c.id=l.entity_id
where l.asset_id=ia.id and l.entity_type='country' and l.role='cover';

update public.ai_suggestions s
set status='applied', approved_at=now(), applied_at=now(),
    review_notes=concat_ws(' ',s.review_notes,'Delegated production review: existing cover relevance verified or documented exception approved.'),
    updated_at=now()
from public.countries c
where s.entity_type='country' and s.entity_id=c.id
  and s.suggestion_type='image_replacement' and s.status='pending'
  and s.proposed_value->>'action'='review_country_cover_relevance'
  and c.image_metadata->>'relevance_review' in ('approved','exception_approved');

-- The original backlog counted null foreign keys even after they had received
-- a terminal review/global/unknown disposition. Report only undispositioned
-- records so the operational number is actionable.
create or replace function public.country_quality_health()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $function$
  with q as materialized (select * from public.country_quality_profile),
  issues as (select issue_code,count(*)::integer affected
    from q cross join lateral unnest(q.issue_codes) as issue_code group by issue_code),
  dimensions as (
    select d.name,round(avg(d.score),1) average from q cross join lateral(values
      ('identity',q.identity_score),('hierarchy',q.hierarchy_score),('editorial',q.editorial_score),
      ('rights',q.rights_score),('imagery',q.imagery_score),('relationships',q.relationships_score),
      ('provenance',q.provenance_score),('translation',q.translation_score)) d(name,score)
    group by d.name
  )
  select jsonb_build_object(
    'probe_ok',true,'generated_at',now(),
    'totals',jsonb_build_object('countries',(select count(*) from q),'indexable',(select count(*) from q where seo_indexable),
      'publication_ready',(select count(*) from q where publication_ready),'blocked',(select count(*) from q where cardinality(blockers)>0)),
    'dimensions',coalesce((select jsonb_object_agg(name,average order by name) from dimensions),'{}'::jsonb),
    'issues',coalesce((select jsonb_object_agg(issue_code,affected order by issue_code) from issues),'{}'::jsonb),
    'backlogs',jsonb_build_object(
      'editorial_review',(select count(*) from public.editorial_drafts where entity_type='country' and status='pending'),
      'translation_review',(select count(*) from public.ai_suggestions where entity_type='countries' and suggestion_type='translation' and status='pending'),
      'image_review',(select count(*) from public.ai_suggestions where entity_type='country' and suggestion_type='image_replacement' and status='pending'),
      'category_other',(select sum(other_venues+other_events) from q),
      'region_review',(select count(*) from public.countries where duplicate_of_id is null and enrichment_status->'region'->>'state'='review'),
      'unresolved_geography',(
        (select count(*) from public.venues where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        +(select count(*) from public.events where duplicate_of_id is null and city_id is null and country_id is null and venue_id is null and enrichment_status->'geography'->>'state' is null)
        +(select count(*) from public.organizations where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        +(select count(*) from public.personalities where duplicate_of_id is null and city_id is null and country_id is null and enrichment_status->'geography'->>'state' is null)
        +(select count(*) from public.milestones where city_id is null and country_id is null and geography_exemption_reason is null)
      )),
    'samples',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'blockers',blockers,'warnings',warnings))
      from (select * from q where cardinality(issue_codes)>0 order by cardinality(blockers) desc,name limit 30) s),'[]'::jsonb)
  )
$function$;
revoke all on function public.country_quality_health() from public, anon;
grant execute on function public.country_quality_health() to authenticated, service_role;

commit;
