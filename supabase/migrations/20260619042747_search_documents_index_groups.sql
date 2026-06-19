-- Index PUBLIC community groups into search_documents (omnisearch + autocomplete).
-- Private groups are never indexed. Trigger is column-scoped to EXCLUDE
-- member_count/last_activity_at => no re-index storm on join.
-- Column set matches the current embedding-less search_documents schema.

CREATE OR REPLACE FUNCTION public.search_documents_index_groups(p_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  insert into public.search_documents
    (doc_id, entity_type, entity_id, title, description, search_tsv, facets, geog,
     trust_score, liveness_status, is_featured, quality_score, closed_at,
     start_date, end_date, is_free, price_min, price_max, slug, image_url, city, country, content_language, updated_at)
  select 'group:'||g.id, 'group', g.id, g.name, g.description,
       setweight(to_tsvector('simple', unaccent(coalesce(g.name,''))),'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.city,''))),'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(array_to_string(g.tags,' '),''))),'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(g.description,''))),'D'),
    jsonb_strip_nulls(jsonb_build_object(
      'tags', to_jsonb(g.tags), 'is_featured', g.featured,
      'member_count', g.member_count, 'city', g.city)),
    null::geography,
    null::smallint, 'live', coalesce(g.featured,false), null::smallint, null::timestamptz,
    null::timestamptz, null::timestamptz, null::boolean, null::numeric, null::numeric,
    null::text, g.image_url, g.city, null::text, null::text, now()
  from public.community_groups g
  where g.is_private = false
    and (p_id is null or g.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    image_url=excluded.image_url, city=excluded.city, updated_at=now();
$$;

REVOKE ALL ON FUNCTION public.search_documents_index_groups(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents_index_groups(uuid) TO service_role;

-- Add the group branch to the central sync dispatcher (all existing branches preserved).
CREATE OR REPLACE FUNCTION public.search_documents_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
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
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end $$;

-- Add the group builder to the full rebuild.
CREATE OR REPLACE FUNCTION public.search_documents_rebuild()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
begin
  delete from public.search_documents;
  perform public.search_documents_index_venues(null);
  perform public.search_documents_index_events(null);
  perform public.search_documents_index_cities(null);
  perform public.search_documents_index_countries(null);
  perform public.search_documents_index_news(null);
  perform public.search_documents_index_marketplace(null);
  perform public.search_documents_index_personalities(null);
  perform public.search_documents_index_tags(null);
  perform public.search_documents_index_villages(null);
  perform public.search_documents_index_groups(null);
end $$;

-- Column-scoped trigger: member_count + last_activity_at are EXCLUDED so join/leave
-- churn never re-indexes. Re-index only on content/visibility changes.
DROP TRIGGER IF EXISTS trg_search_documents_group ON public.community_groups;
CREATE TRIGGER trg_search_documents_group
  AFTER INSERT OR DELETE OR UPDATE OF name, description, image_url, tags, is_private, featured, city
  ON public.community_groups
  FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync('group');

-- Backfill (public groups only; tiny set).
SELECT public.search_documents_index_groups(null);
