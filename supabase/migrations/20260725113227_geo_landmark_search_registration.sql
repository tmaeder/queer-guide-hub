-- Geo Hierarchy Unification — P1: register the landmark type everywhere a
-- public entity type must exist: search_documents (indexer + sync trigger +
-- safety_gated mirror), boundaries CHECK, and seed the 6 legacy
-- notable_landmarks strings as needs_review rows.

-- ---------------------------------------------------------------------------
-- Indexer. Weights follow the milestones precedent: A name, B country+kind,
-- C city/village/tags, D description. needs_review and duplicate rows are
-- never indexed.
-- ---------------------------------------------------------------------------
create or replace function public.search_documents_index_landmarks(p_id uuid default null::uuid)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp' as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max,
     slug, image_url, city, country, content_language, updated_at)
  select 'landmark:'||g.id, 'landmark', g.id, g.name, g.description,
       setweight(to_tsvector('simple', unaccent(coalesce(g.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(co.name,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(lp.landmark_kind,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(ci.name,''))),'C')
    || setweight(to_tsvector('simple', unaccent(case when g.parent_type = 'village' then pv.name else '' end)),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(lp.tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.description,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'entity_kind', 'landmark',
      'landmark_kind', lp.landmark_kind,
      'tags', to_jsonb(lp.tags))),
    case when g.latitude is not null and g.longitude is not null
         then st_setsrid(st_makepoint(g.longitude::float8, g.latitude::float8),4326)::geography end,
    null::smallint, 'live', coalesce(lp.featured,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    g.slug, g.image_url, ci.name, co.name,
    null::text, now()
  from public.geo_places g
  join public.geo_landmark_profiles lp on lp.place_id = g.id
  left join public.geo_places ci on ci.id = g.city_id
  left join public.geo_places co on co.id = g.country_id
  left join public.geo_places pv on pv.id = g.parent_id and g.parent_type = 'village'
  where g.place_type = 'landmark'
    and g.duplicate_of_id is null
    and lp.needs_review = false
    and (p_id is null or g.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog,
    is_featured=excluded.is_featured,
    slug=excluded.slug, image_url=excluded.image_url, city=excluded.city,
    country=excluded.country, updated_at=now();
$$;

-- ---------------------------------------------------------------------------
-- Sync dispatcher: full recreation (body from 20260721130737, latest) + the
-- landmark branch.
-- ---------------------------------------------------------------------------
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
        when 'landmark'      then perform public.search_documents_index_landmarks(new.id);
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

-- Spine changes for landmark rows (WHEN clauses because other geo types have
-- their own city/country indexers driven from the typed tables).
drop trigger if exists trg_search_documents_landmark_ins on public.geo_places;
create trigger trg_search_documents_landmark_ins
  after insert or update on public.geo_places
  for each row when (new.place_type = 'landmark')
  execute function public.search_documents_sync('landmark');
drop trigger if exists trg_search_documents_landmark_del on public.geo_places;
create trigger trg_search_documents_landmark_del
  after delete on public.geo_places
  for each row when (old.place_type = 'landmark')
  execute function public.search_documents_sync('landmark');

-- Profile changes (kind/tags/needs_review flips) re-index too. The sync fn
-- keys off new.id, so a wrapper maps place_id -> spine id.
create or replace function public.search_documents_sync_landmark_profile()
returns trigger language plpgsql security definer
set search_path to 'public','extensions','pg_temp' as $$
begin
  begin
    delete from public.search_documents where entity_type = 'landmark' and entity_id = coalesce(new.place_id, old.place_id);
    if tg_op <> 'DELETE' then
      perform public.search_documents_index_landmarks(new.place_id);
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_search_documents_landmark_profile on public.geo_landmark_profiles;
create trigger trg_search_documents_landmark_profile
  after insert or update or delete on public.geo_landmark_profiles
  for each row execute function public.search_documents_sync_landmark_profile();

-- ---------------------------------------------------------------------------
-- safety_gated mirror: extend the CASE with the landmark branch.
-- ---------------------------------------------------------------------------
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
    when 'landmark'     then coalesce((select safety_gated from public.geo_places    where id = new.entity_id), false)
    else false
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- boundaries may now describe landmarks too.
-- ---------------------------------------------------------------------------
alter table public.boundaries drop constraint if exists boundaries_entity_type_check;
alter table public.boundaries add constraint boundaries_entity_type_check
  check (entity_type in ('country','city','village','landmark'));

-- ---------------------------------------------------------------------------
-- Seed: the 6 legacy notable_landmarks strings on villages become needs_review
-- landmark rows (excluded from search + public pages until approved).
-- ---------------------------------------------------------------------------
with seeds as (
  select qv.id as village_id, trim(l.name) as name,
         trim(both '-' from regexp_replace(lower(unaccent(trim(l.name) || ' ' || qv.slug)), '[^a-z0-9]+', '-', 'g')) as slug
  from public.queer_villages qv
  cross join lateral unnest(qv.notable_landmarks) as l(name)
  where trim(l.name) <> ''
), ins as (
  insert into public.geo_places (place_type, parent_id, name, slug)
  select distinct on (s.slug) 'landmark', s.village_id, s.name, s.slug
  from seeds s
  where not exists (select 1 from public.geo_places g where g.place_type = 'landmark' and g.slug = s.slug)
  returning id
)
insert into public.geo_landmark_profiles (place_id, needs_review)
select id, true from ins;
