-- ============================================================================
-- Unified Guides (drop-legacy): after the soak window (freeze 20260726150400,
-- live 2026-07-25 → 2026-08-01), remove the 15 write-frozen legacy tables the
-- unified `guides` family replaced, plus the two dead tables editorial_tasks
-- and news_challenges, the legacy RPCs, and their trigger functions.
--
-- pg_depend / prosrc audit (2026-07-26, live DB):
--   * NO views depend on any of the 17 tables.
--   * Only external FK in: community_submissions.quest_id → quests (dropped here).
--   * Functions still referencing legacy tables — rewired below BEFORE the
--     drops: _event/_marketplace/_venue_merge_core (legacy *_guide_picks →
--     polymorphic guide_picks), _news_merge_core (quests.recap_article_id →
--     guides.recap_article_id), merge_cities (3 legacy guide tables →
--     guides.city_id), local_supporter_score + user_local_supporter_cities
--     (marketplace_guide_reads/_picks → guide_reads/guide_picks).
--   * quest_progress / quest_public_contributors / quest_create_recap_stub /
--     active_quest_guide already read the new tables — untouched.
--   * editorial_entity_type enum KEPT (editorial_covers/editorial_drafts use it).
--   * user_news_reads / news_reading_streak KEPT (same source migration as
--     news_challenges, still live).

-- ---------------------------------------------------------------------------
-- 1. Rewire merge cores: legacy per-type guide-pick reparents → polymorphic
--    guide_picks. Colliding leftovers (canonical already picked in the same
--    guide) stay on the dup and are deleted by the nightly guide_picks_maintain
--    janitor, which follows duplicate_of_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._event_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  update public.guide_picks g set entity_id = p_keep_id
    where g.entity_type = 'event' and g.entity_id = p_drop_id
    and not exists (select 1 from public.guide_picks k
                    where k.guide_id = g.guide_id and k.entity_type = 'event' and k.entity_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

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

CREATE OR REPLACE FUNCTION public._marketplace_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  update public.guide_picks g set entity_id = p_keep_id
    where g.entity_type = 'marketplace' and g.entity_id = p_drop_id
    and not exists (select 1 from public.guide_picks k
                    where k.guide_id = g.guide_id and k.entity_type = 'marketplace' and k.entity_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

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

CREATE OR REPLACE FUNCTION public._venue_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  update public.guide_picks g set entity_id = p_keep_id
    where g.entity_type = 'venue' and g.entity_id = p_drop_id
    and not exists (select 1 from public.guide_picks k
                    where k.guide_id = g.guide_id and k.entity_type = 'venue' and k.entity_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

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

CREATE OR REPLACE FUNCTION public._news_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.news_articles where id = p_keep_id;
  if not found then raise exception 'keep article % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep article is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.news_articles where id = p_drop_id;
  if not found then raise exception 'drop article % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop article already merged'; end if;
  update public.news_article_cities c set article_id = p_keep_id where c.article_id = p_drop_id
    and not exists (select 1 from public.news_article_cities k where k.article_id = p_keep_id and k.city_id = c.city_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities', n);
  update public.news_article_countries c set article_id = p_keep_id where c.article_id = p_drop_id
    and not exists (select 1 from public.news_article_countries k where k.article_id = p_keep_id and k.country_id = c.country_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_countries', n);
  update public.news_article_entities e set article_id = p_keep_id where e.article_id = p_drop_id
    and not exists (select 1 from public.news_article_entities k where k.article_id = p_keep_id and k.entity_type = e.entity_type and k.entity_id = e.entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_entities', n);
  update public.news_story_articles s set article_id = p_keep_id where s.article_id = p_drop_id
    and not exists (select 1 from public.news_story_articles k where k.story_id = s.story_id and k.article_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_story_articles', n);
  update public.user_news_reads u set article_id = p_keep_id where u.article_id = p_drop_id
    and not exists (select 1 from public.user_news_reads k where k.user_id = u.user_id and k.article_id = p_keep_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('user_news_reads', n);
  update public.news_stories set hero_article_id = p_keep_id where hero_article_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_stories_hero', n);
  update public.guides set recap_article_id = p_keep_id where recap_article_id = p_drop_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guides_recap', n);
  if v_drop_slug is not null then
    insert into public.news_slug_redirects (old_slug, article_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set article_id = excluded.article_id;
  end if;
  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('news', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','news','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

CREATE OR REPLACE FUNCTION public.merge_cities(p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  update public.guides            set city_id = p_keep_id where city_id = p_drop_id;
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

-- ---------------------------------------------------------------------------
-- 2. Rewire local-supporter scoring: marketplace_guide_reads/_picks →
--    guide_reads + polymorphic guide_picks (entity_type='marketplace').
--    Same join shape and weights; only the tables changed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.local_supporter_score(p_user_id uuid, p_city_id uuid)
 RETURNS TABLE(score integer, tier text, favorites integer, guide_reads integer, reviews integer, weeks_decay integer, last_active_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_fav INT := 0; v_reads INT := 0; v_reviews INT := 0; v_last TIMESTAMPTZ; v_weeks INT := 0; v_raw INT; v_final INT; v_tier TEXT;
BEGIN
  IF p_user_id IS NULL OR p_city_id IS NULL THEN
    score := 0; tier := 'Visitor'; favorites := 0; guide_reads := 0; reviews := 0; weeks_decay := 0; last_active_at := NULL;
    RETURN NEXT; RETURN;
  END IF;
  SELECT COUNT(*) INTO v_fav FROM marketplace_favorites f
    JOIN marketplace_listings l ON l.id = f.listing_id JOIN venues v ON v.id = l.venue_id
    WHERE f.user_id = p_user_id AND v.city_id = p_city_id AND l.community_owned_tags @> ARRAY['queer_owned']::text[];
  SELECT COUNT(*) INTO v_reads FROM public.guide_reads r
    JOIN public.guide_picks p ON p.guide_id = r.guide_id AND p.entity_type = 'marketplace'
    JOIN marketplace_listings l ON l.id = p.entity_id JOIN venues v ON v.id = l.venue_id
    WHERE r.user_id = p_user_id AND r.completed_at IS NOT NULL AND v.city_id = p_city_id;
  SELECT COUNT(*) INTO v_reviews FROM marketplace_reviews rv
    JOIN marketplace_listings l ON l.id = rv.listing_id JOIN venues v ON v.id = l.venue_id
    WHERE rv.user_id = p_user_id AND v.city_id = p_city_id;
  SELECT GREATEST(
    COALESCE((SELECT MAX(f.created_at) FROM marketplace_favorites f JOIN marketplace_listings l ON l.id=f.listing_id JOIN venues v ON v.id=l.venue_id WHERE f.user_id=p_user_id AND v.city_id=p_city_id),'epoch'::timestamptz),
    COALESCE((SELECT MAX(r.completed_at) FROM public.guide_reads r JOIN public.guide_picks p ON p.guide_id=r.guide_id AND p.entity_type='marketplace' JOIN marketplace_listings l ON l.id=p.entity_id JOIN venues v ON v.id=l.venue_id WHERE r.user_id=p_user_id AND r.completed_at IS NOT NULL AND v.city_id=p_city_id),'epoch'::timestamptz),
    COALESCE((SELECT MAX(rv.created_at) FROM marketplace_reviews rv JOIN marketplace_listings l ON l.id=rv.listing_id JOIN venues v ON v.id=l.venue_id WHERE rv.user_id=p_user_id AND v.city_id=p_city_id),'epoch'::timestamptz)
  ) INTO v_last;
  IF v_last = 'epoch'::timestamptz THEN v_last := NULL; END IF;
  IF v_last IS NOT NULL THEN v_weeks := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_last))/604800.0)::INT); END IF;
  v_raw := (v_fav*5) + (v_reads*2) + (v_reviews*10) - v_weeks;
  v_final := GREATEST(0, LEAST(100, v_raw));
  v_tier := CASE WHEN v_final >= 75 THEN 'Champion' WHEN v_final >= 40 THEN 'Local Supporter' WHEN v_final >= 15 THEN 'Local' ELSE 'Visitor' END;
  score := v_final; tier := v_tier; favorites := v_fav; guide_reads := v_reads; reviews := v_reviews; weeks_decay := v_weeks; last_active_at := v_last;
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.user_local_supporter_cities(p_user_id uuid)
 RETURNS TABLE(city_id uuid, city_name text, score integer, tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT DISTINCT v.city_id AS c, c.name AS n
      FROM venues v JOIN cities c ON c.id = v.city_id
     WHERE v.city_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM marketplace_favorites f JOIN marketplace_listings l ON l.id=f.listing_id
          WHERE f.user_id=p_user_id AND l.venue_id=v.id AND l.community_owned_tags @> ARRAY['queer_owned']::text[]
         UNION
         SELECT 1 FROM marketplace_reviews rv JOIN marketplace_listings l ON l.id=rv.listing_id
          WHERE rv.user_id=p_user_id AND l.venue_id=v.id
         UNION
         SELECT 1 FROM public.guide_reads gr
           JOIN public.guide_picks gp ON gp.guide_id=gr.guide_id AND gp.entity_type='marketplace'
           JOIN marketplace_listings gl ON gl.id=gp.entity_id
          WHERE gr.user_id=p_user_id AND gr.completed_at IS NOT NULL AND gl.venue_id=v.id
       )
  LOOP
    city_id := r.c; city_name := r.n;
    SELECT s.score, s.tier INTO score, tier FROM public.local_supporter_score(p_user_id, r.c) s;
    RETURN NEXT;
  END LOOP;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. Drop the legacy quest link on community_submissions (guide_id replaced it;
--    the FK goes with the column). Legacy submission trigger fns are unbound
--    since the unified cutover (submission_autotag_guide /
--    submission_guide_contribution are the live triggers).
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_submissions DROP COLUMN IF EXISTS quest_id;

-- ---------------------------------------------------------------------------
-- 4. Drop legacy RPCs BEFORE the tables — active_quest() returns SETOF quests
--    (rowtype dependency blocks DROP TABLE), and the recommend_*/streak fns
--    read the legacy tables.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.recommend_guides(uuid, integer);
DROP FUNCTION IF EXISTS public.recommend_venue_guides(uuid, integer);
DROP FUNCTION IF EXISTS public.recommend_event_guides(uuid, integer);
DROP FUNCTION IF EXISTS public.marketplace_guide_reading_streak(uuid);
DROP FUNCTION IF EXISTS public.venue_guide_reading_streak(uuid);
DROP FUNCTION IF EXISTS public.active_quest();

-- ---------------------------------------------------------------------------
-- 5. Drop the 15 frozen legacy tables + 2 dead tables (children first; their
--    RLS policies, indexes and remaining set_updated_at triggers go with them).
--    user_news_reads / news_reading_streak stay (still live).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.marketplace_guide_picks;
DROP TABLE IF EXISTS public.marketplace_guide_sections;
DROP TABLE IF EXISTS public.marketplace_guide_reads;
DROP TABLE IF EXISTS public.marketplace_guides;
DROP TABLE IF EXISTS public.venue_guide_picks;
DROP TABLE IF EXISTS public.venue_guide_sections;
DROP TABLE IF EXISTS public.venue_guide_reads;
DROP TABLE IF EXISTS public.venue_guides;
DROP TABLE IF EXISTS public.event_guide_picks;
DROP TABLE IF EXISTS public.event_guides;
DROP TABLE IF EXISTS public.quest_contributions;
DROP TABLE IF EXISTS public.quest_participations;
DROP TABLE IF EXISTS public.quests;
DROP TABLE IF EXISTS public.editorial_rail_items;
DROP TABLE IF EXISTS public.editorial_rails;
DROP TABLE IF EXISTS public.editorial_tasks;
DROP TABLE IF EXISTS public.news_challenges;

-- NOTE: editorial_entity_type enum is deliberately KEPT — editorial_covers and
-- editorial_drafts still use it.

-- ---------------------------------------------------------------------------
-- 6. Drop the now-unbound legacy trigger functions (after the tables, since
--    the tables' triggers depended on them).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.marketplace_guides_refresh_pick_count();
DROP FUNCTION IF EXISTS public.venue_guides_refresh_pick_count();
DROP FUNCTION IF EXISTS public.event_guides_refresh_pick_count();
DROP FUNCTION IF EXISTS public.marketplace_guides_default_review_due();
DROP FUNCTION IF EXISTS public.venue_guides_default_review_due();
DROP FUNCTION IF EXISTS public.event_guides_default_review_due();
DROP FUNCTION IF EXISTS public.tg_marketplace_guide_read_emit_activity();
DROP FUNCTION IF EXISTS public.tg_quests_set_updated_at();
DROP FUNCTION IF EXISTS public.editorial_rails_touch();
DROP FUNCTION IF EXISTS public.tg_submission_autotag_quest();
DROP FUNCTION IF EXISTS public.tg_submission_quest_contribution();
