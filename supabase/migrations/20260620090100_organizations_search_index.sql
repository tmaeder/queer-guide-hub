-- Index organizations into search_documents so outlets & shops are discoverable in search.

create or replace function public.search_documents_index_organizations(p_id uuid default null::uuid)
returns void language sql security definer
set search_path to 'public','extensions','pg_temp' as $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'organization:'||o.id, 'organization', o.id, o.name,
       coalesce(o.editorial_hook, o.description),
       setweight(to_tsvector('simple', unaccent(coalesce(o.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(o.website_domain,''))),'B')
    || setweight(to_tsvector('simple', unaccent(array_to_string(o.roles,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(array_to_string(o.tags,' '))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(o.editorial_hook, o.description, ''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'roles', to_jsonb(o.roles), 'tags', to_jsonb(o.tags), 'entity_kind', 'organization')),
    (select st_setsrid(st_makepoint(v.longitude::float8, v.latitude::float8), 4326)::geography
       from public.venues v
       where v.id = o.primary_venue_id and v.longitude is not null and v.latitude is not null),
    o.trust_score::smallint, 'live', false, o.completeness_score::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    o.slug, coalesce(o.logo_url, o.cover_image_url), null::text, null::text, null::text, now()
  from public.organizations o
  where o.status = 'active' and (p_id is null or o.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$$;

-- Extend the sync dispatcher with the organization case.
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
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_search_documents_organization on public.organizations;
create trigger trg_search_documents_organization
  after insert or update or delete on public.organizations
  for each row execute function public.search_documents_sync('organization');

-- Backfill existing organizations.
select public.search_documents_index_organizations(null);
