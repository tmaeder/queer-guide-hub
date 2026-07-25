-- Duplicate-merge cores — Phase 1: organizations, milestones, hotels (2026-07-25)
--
-- Extends the generic reversible soft-merge (20260623123927) to three more types
-- so the registry-driven /admin/duplicates console can merge them. Each follows
-- the proven _event_merge_core pattern: conflict-safe child reparent, set
-- duplicate_of_id (the stack-wide "hidden" flag), record a slug redirect, audit
-- to entity_merge_audit (reversible). Merge/unmerge routed through the existing
-- merge_entities / unmerge_entities dispatcher.
--
-- Hide mechanism (verified): the search_documents_sync trigger delete-then-reindexes
-- on every change; a row stays out of search only if its indexer WHERE excludes it.
-- The milestones indexer already guards duplicate_of_id (auto-hides). The
-- organizations indexer did NOT — this migration adds the guard. Hotels are not in
-- search_documents (they surface as venues), so they get a dedicated finder and are
-- hidden from public surfaces by a duplicate_of_id filter in their read hooks.

-- ---------------------------------------------------------------------------
-- 0. Columns (milestones already has duplicate_of_id) + slug-redirect + audit RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS organizations_duplicate_of_idx
  ON public.organizations(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.hotels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS hotels_duplicate_of_idx
  ON public.hotels(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.org_slug_redirects (
  old_slug text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.milestone_slug_redirects (
  old_slug text PRIMARY KEY,
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hotel_slug_redirects (
  old_slug text PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1. _organization_merge_core — reparent org children, set duplicate_of_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._organization_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.organizations where id = p_keep_id;
  if not found then raise exception 'keep organization % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep organization is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.organizations where id = p_drop_id;
  if not found then raise exception 'drop organization % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop organization already merged'; end if;

  -- direct reparents (organization_id is a nullable FK, no colliding unique)
  update public.venues set organization_id = p_keep_id where organization_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);
  update public.marketplace_merchants set organization_id = p_keep_id where organization_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_merchants', n);
  update public.news_sources set organization_id = p_keep_id where organization_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_sources', n);

  if v_drop_slug is not null then
    insert into public.org_slug_redirects (old_slug, organization_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set organization_id = excluded.organization_id;
  end if;

  update public.organizations set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('organization', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','organization','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. _milestone_merge_core — reparent links/proposals conflict-safely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._milestone_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.milestones where id = p_keep_id;
  if not found then raise exception 'keep milestone % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep milestone is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.milestones where id = p_drop_id;
  if not found then raise exception 'drop milestone % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop milestone already merged'; end if;

  -- conflict-safe on UNIQUE(milestone_id, entity_type, entity_id)
  update public.milestone_links l set milestone_id = p_keep_id where l.milestone_id = p_drop_id
    and not exists (select 1 from public.milestone_links k
      where k.milestone_id = p_keep_id and k.entity_type = l.entity_type and k.entity_id = l.entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('milestone_links', n);

  update public.milestone_link_proposals p set milestone_id = p_keep_id where p.milestone_id = p_drop_id
    and not exists (select 1 from public.milestone_link_proposals k
      where k.milestone_id = p_keep_id and k.entity_type = p.entity_type and k.entity_id = p.entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('milestone_link_proposals', n);

  if v_drop_slug is not null then
    insert into public.milestone_slug_redirects (old_slug, milestone_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set milestone_id = excluded.milestone_id;
  end if;

  update public.milestones set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('milestone', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','milestone','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 3. _hotel_merge_core — reparent trip_places, set duplicate_of_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hotel_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.hotels where id = p_keep_id;
  if not found then raise exception 'keep hotel % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep hotel is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.hotels where id = p_drop_id;
  if not found then raise exception 'drop hotel % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop hotel already merged'; end if;

  update public.trip_places set hotel_id = p_keep_id where hotel_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

  if v_drop_slug is not null then
    insert into public.hotel_slug_redirects (old_slug, hotel_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set hotel_id = excluded.hotel_id;
  end if;

  update public.hotels set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('hotel', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','hotel','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 4. Extend the dispatcher / unmerge / chain-collapse (live definitions + new branches).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_entities(p_type text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if    p_type = 'event'        then return public._event_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'marketplace'  then return public._marketplace_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'personality'  then return public._personality_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'organization' then return public._organization_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'milestone'    then return public._milestone_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'hotel'        then return public._hotel_merge_core(p_keep_id, p_drop_id, v_actor);
  else raise exception 'unsupported merge type % (use merge_venues / merge_cities for those)', p_type;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.unmerge_entities(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid(); r record;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into r from public.entity_merge_audit where id = p_audit_id and undone_at is null;
  if not found then raise exception 'merge audit % not found or already undone', p_audit_id; end if;

  if r.entity_type = 'event' then
    update public.events set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.event_slug_redirects where event_id = r.keep_id
      and old_slug = (select slug from public.events where id = r.drop_id);
  elsif r.entity_type = 'marketplace' then
    update public.marketplace_listings
      set duplicate_of_id = null, status = 'active', deprecated_at = null,
          sensitivity_flags = coalesce(sensitivity_flags,'[]'::jsonb) - 'inactive_reason'
      where id = r.drop_id;
    delete from public.marketplace_slug_redirects where listing_id = r.keep_id
      and old_slug = (select slug from public.marketplace_listings where id = r.drop_id);
  elsif r.entity_type = 'personality' then
    update public.personalities set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.personality_slug_redirects where personality_id = r.keep_id
      and old_slug = (select slug from public.personalities where id = r.drop_id);
  elsif r.entity_type = 'organization' then
    update public.organizations set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.org_slug_redirects where organization_id = r.keep_id
      and old_slug = (select slug from public.organizations where id = r.drop_id);
  elsif r.entity_type = 'milestone' then
    update public.milestones set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.milestone_slug_redirects where milestone_id = r.keep_id
      and old_slug = (select slug from public.milestones where id = r.drop_id);
  elsif r.entity_type = 'hotel' then
    update public.hotels set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.hotel_slug_redirects where hotel_id = r.keep_id
      and old_slug = (select slug from public.hotels where id = r.drop_id);
  else raise exception 'unsupported entity_type %', r.entity_type;
  end if;

  update public.entity_merge_audit set undone_at = now() where id = p_audit_id;
  -- Reparented children remain on the canonical (v1; mirrors unmerge_venues).
  return jsonb_build_object('undone', true, 'entity_type', r.entity_type, 'drop_id', r.drop_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.collapse_entity_dup_chains(p_type text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_tbl text; n int;
begin
  perform public.assert_admin_or_internal();
  v_tbl := case p_type when 'event' then 'events' when 'marketplace' then 'marketplace_listings'
                       when 'personality' then 'personalities' when 'venue' then 'venues'
                       when 'news' then 'news_articles' when 'organization' then 'organizations'
                       when 'milestone' then 'milestones' when 'hotel' then 'hotels' else null end;
  if v_tbl is null then raise exception 'unsupported type %', p_type; end if;
  execute format($f$
    with recursive walk as (
      select v.id as node, v.duplicate_of_id as target, 1 as depth from public.%1$I v where v.duplicate_of_id is not null
      union all
      select w.node, r.duplicate_of_id, w.depth + 1 from walk w join public.%1$I r on r.id = w.target
        where r.duplicate_of_id is not null and w.depth < 25
    ), ultimate as (select distinct on (node) node, target as ult from walk order by node, depth desc)
    update public.%1$I v set duplicate_of_id = u.ult from ultimate u
      where v.id = u.node and u.ult is not null and u.ult <> v.id
        and v.duplicate_of_id is distinct from u.ult
  $f$, v_tbl);
  get diagnostics n = row_count; return n;
end; $function$;

-- ---------------------------------------------------------------------------
-- 5. Hide merged organizations from search (add the duplicate_of_id guard the
--    org indexer was missing; other indexers already have it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_documents_index_organizations(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
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
  where o.status = 'active' and o.duplicate_of_id is null and (p_id is null or o.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, geog=excluded.geog, trust_score=excluded.trust_score,
    quality_score=excluded.quality_score, slug=excluded.slug, image_url=excluded.image_url, updated_at=now();
$function$;

-- ---------------------------------------------------------------------------
-- 6. find_hotel_duplicate_clusters — hotels aren't in search_documents, so the
--    generic find_duplicate_clusters can't see them. Same output shape (Cluster[]).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_hotel_duplicate_clusters(p_limit integer DEFAULT 200)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform public.assert_admin_or_internal();
  with norm as (
    select h.id, h.name as title, h.slug, h.city, h.country,
           lower(unaccent(coalesce(h.name,''))) as nt,
           lower(unaccent(coalesce(h.city,''))) as nc
    from public.hotels h
    where h.duplicate_of_id is null and coalesce(h.name,'') <> ''
  ), grp as (
    select nt, nc, count(*) as cnt,
           jsonb_agg(jsonb_build_object('id', id, 'title', title, 'slug', slug, 'city', city, 'country', country)
                     order by title) as members
    from norm group by nt, nc having count(*) > 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'city', nc, 'count', cnt, 'normalized_title', nt, 'members', members) order by cnt desc), '[]'::jsonb)
    into v_result
  from (select * from grp order by cnt desc limit p_limit) g;
  return v_result;
end; $function$;

GRANT EXECUTE ON FUNCTION public.find_hotel_duplicate_clusters(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Hide merged hotels from public/admin PostgREST reads (hotels aren't in
--    search_documents; this is their equivalent of the indexer duplicate_of_id
--    guard). service_role backends bypass RLS; unmerge_entities is SECURITY
--    DEFINER, so reversal is unaffected. Single-point — covers list, detail,
--    map, filter-meta hooks at once.
-- ---------------------------------------------------------------------------
ALTER POLICY "Public read hotels" ON public.hotels USING (duplicate_of_id IS NULL);
