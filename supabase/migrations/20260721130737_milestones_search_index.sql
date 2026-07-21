-- Milestones spine (3/3): index milestones into search_documents.
--
-- Weights: A = title, B = country (EN name + original German free-text, so both
-- "Germany" and "Deutschland" match) + category, C = city/region/tags,
-- D = description. geog = city centroid only — a country-level law reform
-- appearing in "near me" at the country's geometric center is noise, so
-- country-only milestones stay geog-null (organizations precedent).
-- start_date/end_date carry the milestone date range so the existing temporal
-- facet plumbing works for free.

create or replace function public.search_documents_index_milestones(p_id uuid default null::uuid)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp' as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select 'milestone:'||m.id, 'milestone', m.id, m.title, m.description,
       setweight(to_tsvector('simple', unaccent(coalesce(m.title,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.country_name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.category,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name, m.city_name, ''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.region,''))),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(m.tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(m.description,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'entity_kind', 'milestone',
      'category', m.category,
      'impact', m.impact,
      'significance', m.significance,
      'tags', to_jsonb(m.tags))),
    case when ci.latitude is not null and ci.longitude is not null
         then st_setsrid(st_makepoint(ci.longitude::float8, ci.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(m.is_featured,false), m.quality_score, null::timestamptz,
    m.date::timestamptz, m.date_end::timestamptz, null::boolean, null::numeric, null::numeric,
    m.slug, m.image_url, coalesce(ci.name, m.city_name), coalesce(co.name, m.country_name),
    null::text, now()
  from public.milestones m
  left join public.countries co on co.id = m.country_id
  left join public.cities ci on ci.id = m.city_id
  where m.status = 'published'
    and m.duplicate_of_id is null
    and (p_id is null or m.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured, quality_score=excluded.quality_score,
    start_date=excluded.start_date, end_date=excluded.end_date,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, updated_at=now();
$$;

-- Extend the sync dispatcher with the milestone case.
-- Body copied from 20260620090100_organizations_search_index.sql (still the
-- latest full recreation as of 20260721) + the new milestone branch.
create or replace function public.search_documents_sync()
returns trigger language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
begin
  begin
    if (tg_op = 'DELETE') then
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = old.id;
    else
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = new.id;
      case tg_argv[0]
        when 'venue'         then perform public.search_documents_index_venues(new.id);
        when 'event'         then perform public.search_documents_index_events(new.id);
        when 'city'          then perform public.search_documents_index_cities(new.id);
        when 'country'       then perform public.search_documents_index_countries(new.id);
        when 'news'          then perform public.search_documents_index_news(new.id);
        when 'marketplace'   then perform public.search_documents_index_marketplace(new.id);
        when 'personality'   then perform public.search_documents_index_personalities(new.id);
        when 'tag'           then perform public.search_documents_index_tags(new.id);
        when 'queer_village' then perform public.search_documents_index_villages(new.id);
        when 'group'         then perform public.search_documents_index_groups(new.id);
        when 'organization'  then perform public.search_documents_index_organizations(new.id);
        when 'milestone'     then perform public.search_documents_index_milestones(new.id);
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_search_documents_milestone on public.milestones;
create trigger trg_search_documents_milestone
  after insert or update or delete on public.milestones
  for each row execute function public.search_documents_sync('milestone');

-- Mirror safety_gated onto search_documents rows (extends the CASE from
-- 20260623160001_safety_layer_search_gating.sql with the milestone branch).
create or replace function public.set_search_document_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := case new.entity_type
    when 'venue'        then coalesce((select safety_gated from public.venues        where id = new.entity_id), false)
    when 'event'        then coalesce((select safety_gated from public.events        where id = new.entity_id), false)
    when 'organization' then coalesce((select safety_gated from public.organizations where id = new.entity_id), false)
    when 'milestone'    then coalesce((select safety_gated from public.milestones    where id = new.entity_id), false)
    else false
  end;
  return new;
end;
$$;

-- Backfill (no-op at migration time — the table is empty until the seed import
-- runs; kept for idempotent re-runs after data exists).
select public.search_documents_index_milestones(null);
