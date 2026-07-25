-- Duplicate-merge core — community_groups (2026-07-25)
--
-- The last content type. community_groups is in search_documents as entity_type
-- 'group'; it had no duplicate_of_id. Adds the reversible merge core + column and
-- the search-hide guard (its indexer lacked it). No slug column → no slug redirect.

ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.community_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_groups_duplicate_of_idx
  ON public.community_groups(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._group_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.community_groups where id = p_keep_id;
  if not found then raise exception 'keep group % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep group is itself a duplicate'; end if;
  select duplicate_of_id into v_drop_dup from public.community_groups where id = p_drop_id;
  if not found then raise exception 'drop group % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop group already merged'; end if;

  -- conflict-safe (group-scoped uniques)
  update public.group_memberships m set group_id = p_keep_id where m.group_id = p_drop_id
    and not exists (select 1 from public.group_memberships k where k.group_id = p_keep_id and k.user_id = m.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_memberships', n);
  update public.group_collections c set group_id = p_keep_id where c.group_id = p_drop_id
    and not exists (select 1 from public.group_collections k where k.group_id = p_keep_id and k.slug = c.slug);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_collections', n);
  update public.trip_group_links l set group_id = p_keep_id where l.group_id = p_drop_id
    and not exists (select 1 from public.trip_group_links k where k.trip_id = l.trip_id and k.group_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_group_links', n);

  -- direct reparents (no colliding group-scoped unique)
  update public.events set group_id = p_keep_id where group_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.group_posts set group_id = p_keep_id where group_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_posts', n);
  update public.group_invites set group_id = p_keep_id where group_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_invites', n);
  update public.group_join_requests set group_id = p_keep_id where group_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_join_requests', n);
  update public.group_notifications set group_id = p_keep_id where group_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_notifications', n);

  update public.community_groups set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('group', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','group','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- Dispatcher / unmerge / chain-collapse — full definitions incl. the new 'group' branch.
CREATE OR REPLACE FUNCTION public.merge_entities(p_type text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if    p_type = 'event'         then return public._event_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'marketplace'   then return public._marketplace_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'personality'   then return public._personality_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'organization'  then return public._organization_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'milestone'     then return public._milestone_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'hotel'         then return public._hotel_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'news'          then return public._news_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'queer_village' then return public._queer_village_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'country'       then return public._country_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'group'         then return public._group_merge_core(p_keep_id, p_drop_id, v_actor);
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
    delete from public.event_slug_redirects where event_id = r.keep_id and old_slug = (select slug from public.events where id = r.drop_id);
  elsif r.entity_type = 'marketplace' then
    update public.marketplace_listings set duplicate_of_id = null, status = 'active', deprecated_at = null,
      sensitivity_flags = coalesce(sensitivity_flags,'[]'::jsonb) - 'inactive_reason' where id = r.drop_id;
    delete from public.marketplace_slug_redirects where listing_id = r.keep_id and old_slug = (select slug from public.marketplace_listings where id = r.drop_id);
  elsif r.entity_type = 'personality' then
    update public.personalities set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.personality_slug_redirects where personality_id = r.keep_id and old_slug = (select slug from public.personalities where id = r.drop_id);
  elsif r.entity_type = 'organization' then
    update public.organizations set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.org_slug_redirects where organization_id = r.keep_id and old_slug = (select slug from public.organizations where id = r.drop_id);
  elsif r.entity_type = 'milestone' then
    update public.milestones set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.milestone_slug_redirects where milestone_id = r.keep_id and old_slug = (select slug from public.milestones where id = r.drop_id);
  elsif r.entity_type = 'hotel' then
    update public.hotels set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.hotel_slug_redirects where hotel_id = r.keep_id and old_slug = (select slug from public.hotels where id = r.drop_id);
  elsif r.entity_type = 'news' then
    update public.news_articles set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.news_slug_redirects where article_id = r.keep_id and old_slug = (select slug from public.news_articles where id = r.drop_id);
  elsif r.entity_type = 'queer_village' then
    update public.queer_villages set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.village_slug_redirects where village_id = r.keep_id and old_slug = (select slug from public.queer_villages where id = r.drop_id);
  elsif r.entity_type = 'country' then
    update public.countries set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    delete from public.country_slug_redirects where country_id = r.keep_id and old_slug = (select slug from public.countries where id = r.drop_id);
  elsif r.entity_type = 'group' then
    update public.community_groups set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
  else raise exception 'unsupported entity_type %', r.entity_type;
  end if;
  update public.entity_merge_audit set undone_at = now() where id = p_audit_id;
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
                       when 'milestone' then 'milestones' when 'hotel' then 'hotels'
                       when 'queer_village' then 'queer_villages' when 'country' then 'countries'
                       when 'city' then 'cities' when 'group' then 'community_groups' else null end;
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

-- Hide merged groups from search (indexer lacked the duplicate_of_id guard).
CREATE OR REPLACE FUNCTION public.search_documents_index_groups(p_id uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $function$
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
  where g.is_private = false and g.duplicate_of_id is null
    and (p_id is null or g.id = p_id)
  on conflict (entity_type, entity_id) do update set
    title=excluded.title, description=excluded.description, search_tsv=excluded.search_tsv,
    facets=excluded.facets, is_featured=excluded.is_featured,
    image_url=excluded.image_url, city=excluded.city, updated_at=now();
$function$;

-- The group search trigger is column-scoped (unlike all other entity triggers,
-- which fire on any UPDATE) and did NOT list duplicate_of_id — so a merge, which
-- touches only duplicate_of_id, never fired the delete-then-reindex → the merged
-- group stayed in search. Add duplicate_of_id so the hide-guard actually runs.
DROP TRIGGER IF EXISTS trg_search_documents_group ON public.community_groups;
CREATE TRIGGER trg_search_documents_group
  AFTER INSERT OR DELETE OR UPDATE OF name, description, image_url, tags, is_private, featured, city, duplicate_of_id
  ON public.community_groups FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync('group');
