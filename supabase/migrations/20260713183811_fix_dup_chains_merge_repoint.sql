-- dup_integrity gate breach (2026-07-13): 8 venues chained duplicate_of_id
-- (child → tombstone → survivor) after an admin merge at /admin/duplicates where
-- the merge target already had children pointing at it. Root cause: no merge core
-- re-points the dropped entity's existing duplicate children to the survivor, so
-- merging a venue that already absorbed others leaves their pointers chained.
--
-- 1. Data fix: recursive collapse of venue chains to the ultimate survivor
--    (idempotent, self-pointer guarded, no hardcoded ids).
-- 2. Root cause: every merge core (venue/event/marketplace/personality/city) now
--    re-points rows with duplicate_of_id = drop to keep at merge time, counted in
--    the audit as dup_children.
-- 3. collapse_entity_dup_chains learns 'venue' + 'news' and gains a self-pointer
--    guard.

-- ---------------------------------------------------------------------------
-- 1. Collapse existing venue chains.
-- ---------------------------------------------------------------------------
with recursive walk as (
  select v.id as node, v.duplicate_of_id as target, 1 as depth
  from public.venues v where v.duplicate_of_id is not null
  union all
  select w.node, r.duplicate_of_id, w.depth + 1
  from walk w join public.venues r on r.id = w.target
  where r.duplicate_of_id is not null and w.depth < 25
),
ultimate as (
  select distinct on (node) node, target as ult from walk order by node, depth desc
)
update public.venues v
   set duplicate_of_id = u.ult, updated_at = now()
  from ultimate u
 where v.id = u.node and u.ult is not null and u.ult <> v.id
   and v.duplicate_of_id is distinct from u.ult;

-- ---------------------------------------------------------------------------
-- 2. collapse_entity_dup_chains: + venue/news, + self-pointer guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collapse_entity_dup_chains(p_type text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_tbl text; n int;
begin
  perform public.assert_admin_or_internal();
  v_tbl := case p_type when 'event' then 'events' when 'marketplace' then 'marketplace_listings'
                       when 'personality' then 'personalities' when 'venue' then 'venues'
                       when 'news' then 'news_articles' else null end;
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
-- 3. _venue_merge_core: re-point drop's duplicate children to keep.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._venue_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select duplicate_of_id into v_keep_dup from public.venues where id = p_keep_id;
  if not found then raise exception 'keep venue % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep venue is itself a duplicate'; end if;

  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.venues where id = p_drop_id;
  if not found then raise exception 'drop venue % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop venue already merged'; end if;

  update public.events set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.marketplace_listings set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listings', n);
  update public.trip_places set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);
  update public.venue_checkins set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_checkins', n);

  update public.venue_reviews r set venue_id = p_keep_id where r.venue_id = p_drop_id
    and not exists (select 1 from public.venue_reviews k where k.venue_id = p_keep_id and k.user_id = r.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_reviews', n);

  update public.venue_personal_visits v set venue_id = p_keep_id where v.venue_id = p_drop_id
    and not exists (select 1 from public.venue_personal_visits k where k.venue_id = p_keep_id and k.user_id = v.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_personal_visits', n);

  update public.venue_guide_picks g set venue_id = p_keep_id where g.venue_id = p_drop_id
    and not exists (select 1 from public.venue_guide_picks k where k.venue_id = p_keep_id and k.guide_id = g.guide_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_guide_picks', n);

  update public.venue_sources s set venue_id = p_keep_id where s.venue_id = p_drop_id
    and not exists (select 1 from public.venue_sources k where k.venue_id = p_keep_id
                    and k.source_slug = s.source_slug and k.source_entity_id is not distinct from s.source_entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_sources', n);

  if v_drop_slug is not null then
    insert into public.venue_slug_redirects (old_slug, venue_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set venue_id = excluded.venue_id;
  end if;

  update public.venues set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  -- venues merged INTO the dropped venue earlier must follow it to the survivor,
  -- else their pointers chain (critical dup_integrity gate)
  update public.venues set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.venue_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 4. _event_merge_core: same re-point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._event_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.events where id = p_keep_id;
  if not found then raise exception 'keep event % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep event is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.events where id = p_drop_id;
  if not found then raise exception 'drop event % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop event already merged'; end if;

  -- conflict-safe (unique-scoped) reparents
  update public.event_attendees a set event_id = p_keep_id where a.event_id = p_drop_id
    and not exists (select 1 from public.event_attendees k where k.event_id = p_keep_id and k.user_id = a.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_attendees', n);

  update public.event_guide_picks g set event_id = p_keep_id where g.event_id = p_drop_id
    and not exists (select 1 from public.event_guide_picks k where k.event_id = p_keep_id and k.guide_id = g.guide_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_guide_picks', n);

  update public.event_occurrences o set master_event_id = p_keep_id where o.master_event_id = p_drop_id
    and not exists (select 1 from public.event_occurrences k where k.master_event_id = p_keep_id and k.occurrence_start = o.occurrence_start);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_occurrences', n);

  -- direct reparents (no colliding unique on the FK column)
  update public.event_sources set event_id = p_keep_id where event_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_sources', n);
  update public.trip_places set event_id = p_keep_id where event_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

  if v_drop_slug is not null then
    insert into public.event_slug_redirects (old_slug, event_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set event_id = excluded.event_id;
  end if;

  update public.events set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  update public.events set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('event', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','event','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 5. _marketplace_merge_core: same re-point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._marketplace_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.marketplace_listings where id = p_keep_id;
  if not found then raise exception 'keep listing % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep listing is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.marketplace_listings where id = p_drop_id;
  if not found then raise exception 'drop listing % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop listing already merged'; end if;

  update public.marketplace_collection_items c set listing_id = p_keep_id where c.listing_id = p_drop_id
    and not exists (select 1 from public.marketplace_collection_items k where k.collection_id = c.collection_id and k.listing_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_collection_items', n);

  update public.marketplace_favorites f set listing_id = p_keep_id where f.listing_id = p_drop_id
    and not exists (select 1 from public.marketplace_favorites k where k.listing_id = p_keep_id and k.user_id = f.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_favorites', n);

  update public.marketplace_guide_picks g set listing_id = p_keep_id where g.listing_id = p_drop_id
    and not exists (select 1 from public.marketplace_guide_picks k where k.guide_id = g.guide_id and k.listing_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_guide_picks', n);

  update public.marketplace_reviews r set listing_id = p_keep_id where r.listing_id = p_drop_id
    and not exists (select 1 from public.marketplace_reviews k where k.listing_id = p_keep_id and k.user_id = r.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_reviews', n);

  update public.wishlist_items w set listing_id = p_keep_id where w.listing_id = p_drop_id
    and not exists (select 1 from public.wishlist_items k where k.wishlist_id = w.wishlist_id and k.listing_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('wishlist_items', n);

  update public.marketplace_listing_sources set listing_id = p_keep_id where listing_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listing_sources', n);
  update public.trip_packing_items set marketplace_listing_id = p_keep_id where marketplace_listing_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_packing_items', n);
  update public.wishlists set cover_listing_id = p_keep_id where cover_listing_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('wishlists', n);

  if v_drop_slug is not null then
    insert into public.marketplace_slug_redirects (old_slug, listing_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set listing_id = excluded.listing_id;
  end if;

  update public.marketplace_listings
    set duplicate_of_id = p_keep_id, status = 'inactive', deprecated_at = now(),
        sensitivity_flags = coalesce(sensitivity_flags, '[]'::jsonb)
          || jsonb_build_object('inactive_reason','duplicate','dedup_survivor_id', p_keep_id::text)
    where id = p_drop_id;

  update public.marketplace_listings set duplicate_of_id = p_keep_id
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('marketplace', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','marketplace','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 6. _personality_merge_core: same re-point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._personality_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.personalities where id = p_keep_id;
  if not found then raise exception 'keep personality % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep personality is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.personalities where id = p_drop_id;
  if not found then raise exception 'drop personality % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop personality already merged'; end if;

  update public.personality_internal_notes set personality_id = p_keep_id where personality_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_internal_notes', n);
  update public.personality_sources set personality_id = p_keep_id where personality_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_sources', n);

  update public.personality_coverage_gaps c set personality_id = p_keep_id where c.personality_id = p_drop_id
    and not exists (select 1 from public.personality_coverage_gaps k where k.personality_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_coverage_gaps', n);

  -- relationships: repoint both endpoints, dropping self-loops + duplicates
  update public.personality_relationships r set source_personality_id = p_keep_id where r.source_personality_id = p_drop_id
    and r.target_personality_id <> p_keep_id
    and not exists (select 1 from public.personality_relationships k where k.source_personality_id = p_keep_id and k.target_personality_id = r.target_personality_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_relationships_src', n);
  update public.personality_relationships r set target_personality_id = p_keep_id where r.target_personality_id = p_drop_id
    and r.source_personality_id <> p_keep_id
    and not exists (select 1 from public.personality_relationships k where k.target_personality_id = p_keep_id and k.source_personality_id = r.source_personality_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_relationships_tgt', n);

  if v_drop_slug is not null then
    insert into public.personality_slug_redirects (old_slug, personality_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set personality_id = excluded.personality_id;
  end if;

  update public.personalities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  update public.personalities set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('personality', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','personality','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 7. merge_cities: same re-point (cities not in the gate, same bug class).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_cities(p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_keep_name text; v_keep_dup uuid;
  v_drop_name text; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if v_actor is not null
     and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select name, duplicate_of_id into v_keep_name, v_keep_dup from public.cities where id = p_keep_id;
  if not found then raise exception 'keep city % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep city is itself a duplicate'; end if;

  select name, duplicate_of_id into v_drop_name, v_drop_dup from public.cities where id = p_drop_id;
  if not found then raise exception 'drop city % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop city already merged'; end if;

  -- denormalized city text on the high-value content tables → canonical name,
  -- scoped to the dropped city's rows (keeps the search trigger churn minimal).
  update public.venues set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;
  update public.events set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;

  -- content children with no city-scoped unique: straight reparent
  update public.venues            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);
  update public.events            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals         set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.hotels            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('hotels', n);
  update public.queer_villages    set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('queer_villages', n);
  update public.trip_places       set city_id = p_keep_id where city_id = p_drop_id;
  update public.trips             set primary_city_id = p_keep_id where primary_city_id = p_drop_id;
  update public.event_guides      set city_id = p_keep_id where city_id = p_drop_id;
  update public.venue_guides      set city_id = p_keep_id where city_id = p_drop_id;
  update public.marketplace_guides set city_id = p_keep_id where city_id = p_drop_id;
  update public.geo_sources       set city_id = p_keep_id where city_id = p_drop_id;
  update public.reservations      set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_cruising_mode set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_profiles set discovery_city_id = p_keep_id where discovery_city_id = p_drop_id;
  update public.user_travel_preferences set home_city_id = p_keep_id where home_city_id = p_drop_id;
  update public.ingestion_events  set city_id = p_keep_id where city_id = p_drop_id;
  update public.flyer_scans       set matched_city_id = p_keep_id where matched_city_id = p_drop_id;
  update public.trip_geo_review_queue set resolved_city_id = p_keep_id where resolved_city_id = p_drop_id;
  update public.venue_coord_fixes set city_id = p_keep_id where city_id = p_drop_id;
  update public.venue_event_staging set city_id = p_keep_id where city_id = p_drop_id;
  update public.user_place_marks  set city_id = p_keep_id where city_id = p_drop_id;
  update public.personalities     set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personalities', n);
  update public.personalities     set death_city_id = p_keep_id where death_city_id = p_drop_id;

  -- junction/user tables with a city-scoped unique: reparent only where it won't
  -- collide with an existing canonical row; leftover conflicts stay on the dup.
  update public.news_article_cities a set city_id = p_keep_id where a.city_id = p_drop_id
    and not exists (select 1 from public.news_article_cities k where k.city_id = p_keep_id and k.article_id = a.article_id);
  update public.city_favorites f set city_id = p_keep_id where f.city_id = p_drop_id
    and not exists (select 1 from public.city_favorites k where k.city_id = p_keep_id and k.user_id = f.user_id);
  update public.source_coverage_targets s set city_id = p_keep_id where s.city_id = p_drop_id
    and not exists (select 1 from public.source_coverage_targets k where k.city_id = p_keep_id
                    and k.source_slug = s.source_slug and k.entity_type = s.entity_type
                    and k.accommodation_type is not distinct from s.accommodation_type);
  update public.event_coverage_gaps g set city_id = p_keep_id where g.city_id = p_drop_id
    and not exists (select 1 from public.event_coverage_gaps k where k.city_id = p_keep_id);

  -- carry the dropped city's aliases over, then register its own name as an alias
  update public.city_aliases al set city_id = p_keep_id where al.city_id = p_drop_id
    and not exists (select 1 from public.city_aliases k where k.city_id = p_keep_id and k.alias_key = al.alias_key);
  if v_drop_name is not null and v_drop_name <> v_keep_name then
    insert into public.city_aliases (city_id, alias)
    values (p_keep_id, v_drop_name)
    on conflict (city_id, alias_key) do nothing;
  end if;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now()
    where duplicate_of_id = p_drop_id and id <> p_keep_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

  insert into public.city_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, v_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;
