begin;

create or replace function public.compute_personality_quality_dimensions(p_id uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare
  p public.personalities%rowtype;
  v_sources int;
  v_claims int;
  v_image boolean;
  v_canonical_tags int;
  v_failures text[];
  v_identity int;
  v_sourcing int;
  v_content int;
  v_image_score int;
  v_taxonomy int;
  v_links int;
  v_freshness int;
  v_safety int;
  v_score int;
begin
  select * into p from public.personalities where id=p_id;
  if not found then return null; end if;

  select count(*) into v_sources from public.personality_sources s where s.personality_id=p.id;
  select count(*) into v_claims from public.personality_claim_sources c
    where c.personality_id=p.id and c.verification_status in ('pending','verified');
  select exists(
    select 1 from public.image_asset_links l join public.image_assets a on a.id=l.asset_id
    where l.entity_type='personality' and l.entity_id=p.id and l.role='cover'
      and a.status='active' and a.optimization_status in ('optimized','cdn_optimized')
      and coalesce(a.optimized_url,a.thumbnail_url) is not null
  ) into v_image;
  select count(*) into v_canonical_tags
  from public.tag_assignments_norm ta join public.unified_tags u on u.id=ta.tag_id
  where ta.entity_type='personality' and ta.entity_id=p.id
    and u.status='active' and u.merged_into_id is null;
  v_failures := public.personality_publication_failures(p.id);

  v_identity := case
    when p.wikidata_status='resolved' and p.wikidata_qid is not null then 100
    when v_sources >= 2 then 80 when v_sources = 1 then 60 else 20 end;
  v_sourcing := least(100, case when v_sources>0 then 50 else 0 end
    + case when v_claims>0 then 40 else 0 end
    + case when coalesce(p.field_provenance,'{}'::jsonb) <> '{}'::jsonb then 10 else 0 end);
  v_content := least(100,
    case when length(btrim(coalesce(p.description,''))) between 120 and 240 then 50
         when length(btrim(coalesce(p.description,'')))>0 then 25 else 0 end
    + case when length(btrim(coalesce(p.bio,'')))>120 then 50
           when length(btrim(coalesce(p.bio,'')))>0 then 25 else 0 end);
  v_image_score := case when p.image_status='unavailable' then 100 when v_image then 100
    when p.image_url is not null and p.image_status <> 'rejected' then 50 else 0 end;
  v_taxonomy := least(100,
    case when p.profession is not null and p.profession=public.normalize_profession(p.profession) then 45 else 0 end
    + case when cardinality(coalesce(p.roles,'{}'::text[]))>0 then 25 else 0 end
    + case when v_canonical_tags>0 then 30 else 0 end);
  v_links := least(100,
    case when p.birth_place is null or p.city_id is not null or p.country_id is not null then 35 else 0 end
    + case when p.death_place is null or p.death_city_id is not null or p.death_country_id is not null then 25 else 0 end
    + case when v_sources>0 then 40 else 0 end);
  v_freshness := case when p.last_refreshed_at is null then 20
    when p.last_refreshed_at > now()-interval '90 days' then 100
    when p.last_refreshed_at > now()-interval '365 days' then 60 else 20 end;
  v_safety := greatest(0, 100 - cardinality(v_failures)*20);

  if p.is_adult then
    v_score := round(0.25*v_identity + 0.25*v_sourcing + 0.15*v_content
      + 0.15*v_image_score + 0.10*v_taxonomy + 0.10*v_safety);
  else
    v_score := round(0.20*v_identity + 0.20*v_sourcing + 0.20*v_content
      + 0.15*v_image_score + 0.10*v_taxonomy + 0.05*v_links
      + 0.05*v_freshness + 0.05*v_safety);
  end if;

  return jsonb_build_object(
    'version',2, 'cohort',case when p.is_adult then 'adult' else 'encyclopedia' end,
    'score',v_score, 'identity',v_identity, 'sourcing',v_sourcing,
    'content',v_content, 'image',v_image_score, 'taxonomy',v_taxonomy,
    'links',v_links, 'freshness',v_freshness, 'safety',v_safety,
    'hard_failures',to_jsonb(v_failures)
  );
end;
$$;

revoke all on function public.compute_personality_quality_dimensions(uuid)
  from public, anon, authenticated;
grant execute on function public.compute_personality_quality_dimensions(uuid) to service_role;

commit;
