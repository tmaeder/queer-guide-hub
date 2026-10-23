-- Organization assessment captured verbatim from the deployed producer on
-- 2026-10-23. Unrelated marketplace/statistics work is outside this fixture.
create or replace function public.refresh_business_brand_quality()returns jsonb language plpgsql as $native$
declare v_org_ids uuid[];v_findings integer;
begin
  perform public.reconcile_superseded_business_findings(500,false);
  -- Controlled producer batch: eligible records plus an active positive control.
  -- Other ownership cases exercise the real repair/scope above, independently
  -- of unrelated legacy waiver-invalidation policy in the producer.
  select array_agg(o)into v_org_ids from fixture where n in(1,2,20);
  with org as (
    select o.*,public.organization_facts_only_source(o.id) source_contract,
      exists(select 1 from venues v where v.organization_id=o.id and v.duplicate_of_id is null)
      or exists(select 1 from hotels h where h.organization_id=o.id and h.duplicate_of_id is null)
      or exists(select 1 from marketplace_merchants m where m.organization_id=o.id)
      or exists(select 1 from marketplace_brands b where b.organization_id=o.id)
      or exists(select 1 from affiliate_partners a where a.organization_id=o.id)
      or exists(select 1 from news_sources n where n.organization_id=o.id) has_link
    from organizations o where o.id=ANY(v_org_ids)
  ), rows as (
    select 'organization'::text entity_type,o.id entity_id,v.dimension,
      case when v.state in ('fail','pending') and v.dimension in ('editorial','contact','media') and o.source_contract->'unavailable_dimensions' ? v.dimension
        then 'source_unavailable' else v.state end as state,
      case when v.state in ('fail','pending') and v.dimension in ('editorial','contact','media') and o.source_contract->'unavailable_dimensions' ? v.dimension
        then 'facts_only_source_'||v.dimension else v.reason_code end as reason_code,
      case when v.state in ('fail','pending') and v.dimension in ('editorial','contact','media') and o.source_contract->'unavailable_dimensions' ? v.dimension
        then v.evidence||jsonb_build_object('source_contract',o.source_contract) else v.evidence end as evidence
    from org o cross join lateral (values
      ('identity',case when nullif(btrim(o.name),'') is not null and nullif(btrim(o.slug),'') is not null then 'pass' else 'fail' end,
        case when nullif(btrim(o.name),'') is not null and nullif(btrim(o.slug),'') is not null then 'identity_complete' else 'identity_missing' end,jsonb_build_object('name',o.name,'slug',o.slug)),
      ('editorial',case when length(coalesce(btrim(o.description),''))>=80 then 'pass' else 'fail' end,
        case when length(coalesce(btrim(o.description),''))>=80 then 'description_usable' else 'description_missing_or_thin' end,jsonb_build_object('length',length(coalesce(btrim(o.description),'')))),
      ('contact',case when coalesce(o.website,o.email,o.phone) is not null or o.social<>'{}'::jsonb then 'pass' else 'fail' end,
        case when coalesce(o.website,o.email,o.phone) is not null or o.social<>'{}'::jsonb then 'contact_available' else 'contact_missing' end,jsonb_build_object('website',o.website is not null,'email',o.email is not null,'phone',o.phone is not null,'social',o.social<>'{}'::jsonb)),
      ('location',case when not(o.roles && array['venue','hotel','support','community','advocacy']::text[]) then 'not_applicable'
        when (o.city_id is not null and o.country_id is not null) or (o.latitude is not null and o.longitude is not null) then 'pass' else 'fail' end,
        case when not(o.roles && array['venue','hotel','support','community','advocacy']::text[]) then 'role_has_no_location_requirement'
          when (o.city_id is not null and o.country_id is not null) or (o.latitude is not null and o.longitude is not null) then 'location_complete' else 'location_missing' end,
        jsonb_build_object('city_id',o.city_id,'country_id',o.country_id,'coordinates',o.latitude is not null and o.longitude is not null)),
      ('media',case when o.logo_url is not null or o.cover_image_url is not null or cardinality(o.images)>0 then 'pass' else 'fail' end,
        case when o.logo_url is not null or o.cover_image_url is not null or cardinality(o.images)>0 then 'media_available' else 'media_missing' end,jsonb_build_object('logo',o.logo_url is not null,'cover',o.cover_image_url is not null,'images',cardinality(o.images))),
      ('categorization',case when cardinality(o.roles)>0 then 'pass' else 'fail' end,
        case when cardinality(o.roles)>0 then 'roles_present' else 'roles_missing' end,jsonb_build_object('roles',o.roles,'tags',o.tags,'target_groups',o.target_groups)),
      ('linkage',case when o.has_link or o.linkage_disposition in('standalone','not_applicable') then 'pass'
        when o.linkage_disposition='needs_review' then 'fail' else 'pending' end,
        case when o.has_link then 'linked_entity_present' when o.linkage_disposition='standalone' then 'verified_standalone'
          when o.linkage_disposition='not_applicable' then 'link_not_applicable' when o.linkage_disposition='needs_review' then 'expected_link_missing' else 'linkage_unresolved' end,
        jsonb_build_object('disposition',o.linkage_disposition)),
      ('provenance',case when o.field_provenance<>'{}'::jsonb then 'pass' else 'fail' end,
        case when o.field_provenance<>'{}'::jsonb then 'field_provenance_present' else 'field_provenance_missing' end,
        jsonb_build_object('fields',(select count(*) from jsonb_object_keys(o.field_provenance)))),
      ('freshness',case when o.last_verified_at is null then 'pending' when o.last_verified_at>=now()-interval '365 days' then 'pass' else 'fail' end,
        case when o.last_verified_at is null then 'never_verified' when o.last_verified_at>=now()-interval '365 days' then 'verified_within_365d' else 'verification_stale' end,jsonb_build_object('last_verified_at',o.last_verified_at))
    ) v(dimension,state,reason_code,evidence)
  )
  insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code,evidence)
  select entity_type,entity_id,dimension,state,reason_code,evidence from rows
  on conflict(entity_type,entity_id,dimension) do update set
    state=excluded.state,reason_code=excluded.reason_code,evidence=excluded.evidence,
    source=excluded.source,checked_at=now(),waived_at=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_at end,
    waived_by=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waived_by end,
    waiver_note=case when entity_quality_findings.reason_code is distinct from excluded.reason_code then null else entity_quality_findings.waiver_note end;
  get diagnostics v_findings=row_count;

  return jsonb_build_object('findings',v_findings);
end $native$;

