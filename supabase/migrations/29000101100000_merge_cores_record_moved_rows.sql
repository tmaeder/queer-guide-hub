-- Nine merge cores become reversible: record WHICH rows moved, not just how many.
--
-- 20270822093311 did this for events and 20350101100000 for venues. Those two are the
-- ONLY cores that stamp `details.schema = 1` -- `grep "'schema', 1"` over the migration
-- tree returns exactly two hits. The remaining nine record reparenting as COUNTS
-- (`jsonb_build_object('marketplace_favorites', n)`), and a count cannot be reversed:
-- `unmerge_entities` has no way to know which rows to push back, so its branches for
-- these types only ever flipped `duplicate_of_id` and left every reparented child on the
-- survivor -- while still returning `{"undone": true}`.
--
-- Measured on prod 2026-09-12, `entity_merge_audit` where `undone_at is null`:
--
--     entity_type   merges  with details.moved
--     marketplace     2965        0
--     event            685       40
--     news             139        0
--     organization      86        0
--     personality        5        0
--     hotel/milestone    2        0
--
-- WHAT THOSE MERGES ACTUALLY MOVED, summed out of `reparented` -- worth stating
-- precisely, because the obvious assumption is wrong and a first draft of this header
-- asserted it:
--
--     marketplace   marketplace_listing_sources 1845, dup_children 63, collection_items 1
--                   marketplace_favorites 0, marketplace_reviews 0, wishlist_items 0
--     event         event_sources 809, dup_children 123
--     news          news_article_cities 32, news_article_countries 14, stories_hero 14
--     personality   relationships 29, sources 3, coverage_gaps 1
--     organization  venues 5, marketplace_merchants 4
--
-- NO USER ROW HAS EVER BEEN MOVED BY A MERGE. `marketplace_favorites` holds 1 row in the
-- whole database, `marketplace_reviews` 0, `wishlist_items` 1 -- those tables are empty,
-- so the loss to date is PROVENANCE and TOPICAL LINKS, not user content: which sources
-- contributed a listing, which cities an article was filed under, which story a hero
-- article headed, and the personality relationship graph. That is still unrecoverable
-- and still worth fixing, and the user-data exposure is real the moment those tables
-- fill -- but it is a future risk, not a past harm, and the two must not be conflated.
--
-- The asymmetry that matters is unchanged: every one of the 2,965 marketplace merges was
-- auto-merged by the nightly sweep on a `same_merchant_key` arm whose `is_auto` is an
-- unconditional `true`. Auto-merge without undo is the stated reason the city geo arm was
-- never made auto-eligible; five types ship it today.
--
-- Same reparenting, same `reparented` counts (byte-identical shape -- a silent change to
-- an audit column is not worth the risk), plus a `details` document carrying the moved
-- row ids, matching the event/venue shape exactly:
--
--   details = { "schema": 1, "moved": {...}, "drop_slug": ..., "slug_redirect_existed": bool,
--               "slug_redirect_prior_<type>_id": uuid|null }
--
-- `schema` is the flag unmerge tests. Probing for a non-empty `moved` would conflate
-- "predates the fix" with "moved nothing", and those must stay distinguishable -- the
-- first cannot be reversed, the second is fully reversed by doing nothing. Every key
-- under `moved` is always present (`[]` when the branch moved nothing) so unmerge never
-- has to guess whether a missing key means empty or unknown.
--
-- SIX CHILD TABLES HAVE NO `id` COLUMN, so `returning id` does not compile for them.
-- This is the `venue_personal_visits` trap from 20350101100000 repeated six times; it was
-- found by reading `pg_index`, not by reading the cores. Recorded key per table:
--
--     news_story_articles         PK (story_id, article_id)  -> record story_id
--     user_news_reads             PK (user_id, article_id)   -> record user_id
--     trip_group_links            PK (trip_id, group_id)     -> record trip_id
--     personality_internal_notes  PK (personality_id)        -> record the moved id itself
--     user_presence_location      PK (user_id)               -> record user_id
--     user_travel_preferences     PK (user_id)               -> record user_id
--
-- In each case the recorded column is the half of the key the merge does NOT rewrite, so
-- `where <recorded> in (...) and <fk> = keep_id` addresses exactly the moved rows on the
-- way back. The keys are named `<table>` in `moved` but hold those values, and
-- `unmerge_entities` restores them by that key -- the two must be read together.
--
-- SCALAR POINTER COLUMNS are recorded the same way: `news_stories.hero_article_id`,
-- `guides.recap_article_id` and `wishlists.cover_listing_id` are not child rows but
-- pointers, and the id of the row whose pointer moved is enough to put it back.
--
-- NOT FIXED HERE, deliberately, and stated rather than left to be discovered:
--   * `_personality_merge_core` DROPS self-loop and already-existing
--     `personality_relationships` rows instead of moving them (the `and not exists`
--     arms). Those rows are not deleted -- they simply stay pointing at the dropped
--     personality -- so unmerge needs nothing for them. But 29 relationship rows were
--     repointed across the 5 historical personality merges with no record, and those
--     remain unrecoverable.
--   * `personality_internal_notes` has PK `(personality_id)`, i.e. at most one row per
--     person, and the core moves it with NO conflict guard -- a merge where BOTH sides
--     carry a note raises 23505 today. Left as-is: changing it would silently discard one
--     of two hand-written notes, which is a product decision, not a reversibility fix.
--   * `city` (`merge_cities` -> `city_merge_audit`, which has no `details` column at all)
--     is a separate migration -- different audit table, and it performs genuinely
--     destructive DELETEs that a row-id list cannot reverse.

-- ---------------------------------------------------------------- marketplace
CREATE OR REPLACE FUNCTION public._marketplace_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.marketplace_listings where id = p_keep_id;
  if not found then raise exception 'keep listing % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep listing is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.marketplace_listings where id = p_drop_id;
  if not found then raise exception 'drop listing % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop listing already merged'; end if;

  with moved as (
    update public.marketplace_collection_items c set listing_id = p_keep_id where c.listing_id = p_drop_id
      and not exists (select 1 from public.marketplace_collection_items k where k.collection_id = c.collection_id and k.listing_id = p_keep_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_collection_items', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_collection_items', v_ids);

  with moved as (
    update public.marketplace_favorites f set listing_id = p_keep_id where f.listing_id = p_drop_id
      and not exists (select 1 from public.marketplace_favorites k where k.listing_id = p_keep_id and k.user_id = f.user_id)
    returning f.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_favorites', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_favorites', v_ids);

  with moved as (
    update public.guide_picks g set entity_id = p_keep_id
      where g.entity_type = 'marketplace' and g.entity_id = p_drop_id
      and not exists (select 1 from public.guide_picks k
                      where k.guide_id = g.guide_id and k.entity_type = 'marketplace' and k.entity_id = p_keep_id)
    returning g.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('guide_picks', n);
  v_moved  := v_moved  || jsonb_build_object('guide_picks', v_ids);

  with moved as (
    update public.marketplace_reviews r set listing_id = p_keep_id where r.listing_id = p_drop_id
      and not exists (select 1 from public.marketplace_reviews k where k.listing_id = p_keep_id and k.user_id = r.user_id)
    returning r.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_reviews', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_reviews', v_ids);

  with moved as (
    update public.wishlist_items w set listing_id = p_keep_id where w.listing_id = p_drop_id
      and not exists (select 1 from public.wishlist_items k where k.wishlist_id = w.wishlist_id and k.listing_id = p_keep_id)
    returning w.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('wishlist_items', n);
  v_moved  := v_moved  || jsonb_build_object('wishlist_items', v_ids);

  with moved as (
    update public.marketplace_listing_sources set listing_id = p_keep_id where listing_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_listing_sources', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_listing_sources', v_ids);

  with moved as (
    update public.trip_packing_items set marketplace_listing_id = p_keep_id where marketplace_listing_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_packing_items', n);
  v_moved  := v_moved  || jsonb_build_object('trip_packing_items', v_ids);

  -- scalar pointer: the wishlist's cover image. Recording the wishlist id is enough.
  with moved as (
    update public.wishlists set cover_listing_id = p_keep_id where cover_listing_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('wishlists', n);
  v_moved  := v_moved  || jsonb_build_object('wishlists', v_ids);

  if v_drop_slug is not null then
    select listing_id into v_prior_redirect from public.marketplace_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.marketplace_slug_redirects (old_slug, listing_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set listing_id = excluded.listing_id;
  end if;

  update public.marketplace_listings
    set duplicate_of_id = p_keep_id, status = 'inactive', deprecated_at = now(),
        sensitivity_flags = coalesce(sensitivity_flags, '[]'::jsonb)
          || jsonb_build_object('inactive_reason','duplicate','dedup_survivor_id', p_keep_id::text)
    where id = p_drop_id;

  with moved as (
    update public.marketplace_listings set duplicate_of_id = p_keep_id
      where duplicate_of_id = p_drop_id and id <> p_keep_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('dup_children', v_ids);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('marketplace', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_listing_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','marketplace','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- personality
CREATE OR REPLACE FUNCTION public._personality_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.personalities where id = p_keep_id;
  if not found then raise exception 'keep personality % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep personality is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.personalities where id = p_drop_id;
  if not found then raise exception 'drop personality % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop personality already merged'; end if;

  -- PK is (personality_id): at most one note row, and the id we record IS the moved key.
  with moved as (
    update public.personality_internal_notes set personality_id = p_keep_id where personality_id = p_drop_id
    returning p_keep_id as moved_key)
  select count(*)::int, coalesce(jsonb_agg(moved_key), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('personality_internal_notes', n);
  v_moved  := v_moved  || jsonb_build_object('personality_internal_notes', v_ids);

  with moved as (
    update public.personality_sources set personality_id = p_keep_id where personality_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('personality_sources', n);
  v_moved  := v_moved  || jsonb_build_object('personality_sources', v_ids);

  with moved as (
    update public.personality_coverage_gaps c set personality_id = p_keep_id where c.personality_id = p_drop_id
      and not exists (select 1 from public.personality_coverage_gaps k where k.personality_id = p_keep_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('personality_coverage_gaps', n);
  v_moved  := v_moved  || jsonb_build_object('personality_coverage_gaps', v_ids);

  -- relationships: repoint both endpoints, leaving self-loops + duplicates on the drop row.
  with moved as (
    update public.personality_relationships r set source_personality_id = p_keep_id where r.source_personality_id = p_drop_id
      and r.target_personality_id <> p_keep_id
      and not exists (select 1 from public.personality_relationships k where k.source_personality_id = p_keep_id and k.target_personality_id = r.target_personality_id)
    returning r.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('personality_relationships_src', n);
  v_moved  := v_moved  || jsonb_build_object('personality_relationships_src', v_ids);

  with moved as (
    update public.personality_relationships r set target_personality_id = p_keep_id where r.target_personality_id = p_drop_id
      and r.source_personality_id <> p_keep_id
      and not exists (select 1 from public.personality_relationships k where k.target_personality_id = p_keep_id and k.source_personality_id = r.source_personality_id)
    returning r.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('personality_relationships_tgt', n);
  v_moved  := v_moved  || jsonb_build_object('personality_relationships_tgt', v_ids);

  if v_drop_slug is not null then
    select personality_id into v_prior_redirect from public.personality_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.personality_slug_redirects (old_slug, personality_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set personality_id = excluded.personality_id;
  end if;

  update public.personalities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  with moved as (
    update public.personalities set duplicate_of_id = p_keep_id, updated_at = now()
      where duplicate_of_id = p_drop_id and id <> p_keep_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('dup_children', v_ids);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('personality', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_personality_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','personality','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- organization
CREATE OR REPLACE FUNCTION public._organization_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.organizations where id = p_keep_id;
  if not found then raise exception 'keep organization % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep organization is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.organizations where id = p_drop_id;
  if not found then raise exception 'drop organization % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop organization already merged'; end if;

  with moved as (
    update public.venues set organization_id = p_keep_id where organization_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venues', n);
  v_moved  := v_moved  || jsonb_build_object('venues', v_ids);

  with moved as (
    update public.marketplace_merchants set organization_id = p_keep_id where organization_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_merchants', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_merchants', v_ids);

  with moved as (
    update public.news_sources set organization_id = p_keep_id where organization_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_sources', n);
  v_moved  := v_moved  || jsonb_build_object('news_sources', v_ids);

  if v_drop_slug is not null then
    select organization_id into v_prior_redirect from public.org_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.org_slug_redirects (old_slug, organization_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set organization_id = excluded.organization_id;
  end if;

  update public.organizations set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('organization', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_organization_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','organization','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- milestone
CREATE OR REPLACE FUNCTION public._milestone_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.milestones where id = p_keep_id;
  if not found then raise exception 'keep milestone % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep milestone is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.milestones where id = p_drop_id;
  if not found then raise exception 'drop milestone % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop milestone already merged'; end if;

  with moved as (
    update public.milestone_links l set milestone_id = p_keep_id where l.milestone_id = p_drop_id
      and not exists (select 1 from public.milestone_links k
        where k.milestone_id = p_keep_id and k.entity_type = l.entity_type and k.entity_id = l.entity_id)
    returning l.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('milestone_links', n);
  v_moved  := v_moved  || jsonb_build_object('milestone_links', v_ids);

  with moved as (
    update public.milestone_link_proposals p set milestone_id = p_keep_id where p.milestone_id = p_drop_id
      and not exists (select 1 from public.milestone_link_proposals k
        where k.milestone_id = p_keep_id and k.entity_type = p.entity_type and k.entity_id = p.entity_id)
    returning p.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('milestone_link_proposals', n);
  v_moved  := v_moved  || jsonb_build_object('milestone_link_proposals', v_ids);

  if v_drop_slug is not null then
    select milestone_id into v_prior_redirect from public.milestone_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.milestone_slug_redirects (old_slug, milestone_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set milestone_id = excluded.milestone_id;
  end if;

  update public.milestones set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('milestone', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_milestone_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','milestone','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- hotel
CREATE OR REPLACE FUNCTION public._hotel_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.hotels where id = p_keep_id;
  if not found then raise exception 'keep hotel % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep hotel is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.hotels where id = p_drop_id;
  if not found then raise exception 'drop hotel % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop hotel already merged'; end if;

  with moved as (
    update public.trip_places set hotel_id = p_keep_id where hotel_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_places', n);
  v_moved  := v_moved  || jsonb_build_object('trip_places', v_ids);

  if v_drop_slug is not null then
    select hotel_id into v_prior_redirect from public.hotel_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.hotel_slug_redirects (old_slug, hotel_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set hotel_id = excluded.hotel_id;
  end if;

  update public.hotels set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('hotel', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_hotel_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','hotel','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- news
CREATE OR REPLACE FUNCTION public._news_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.news_articles where id = p_keep_id;
  if not found then raise exception 'keep article % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep article is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.news_articles where id = p_drop_id;
  if not found then raise exception 'drop article % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop article already merged'; end if;

  with moved as (
    update public.news_article_cities c set article_id = p_keep_id where c.article_id = p_drop_id
      and not exists (select 1 from public.news_article_cities k where k.article_id = p_keep_id and k.city_id = c.city_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_cities', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_cities', v_ids);

  with moved as (
    update public.news_article_countries c set article_id = p_keep_id where c.article_id = p_drop_id
      and not exists (select 1 from public.news_article_countries k where k.article_id = p_keep_id and k.country_id = c.country_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_countries', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_countries', v_ids);

  with moved as (
    update public.news_article_entities e set article_id = p_keep_id where e.article_id = p_drop_id
      and not exists (select 1 from public.news_article_entities k where k.article_id = p_keep_id and k.entity_type = e.entity_type and k.entity_id = e.entity_id)
    returning e.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_entities', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_entities', v_ids);

  -- PK (story_id, article_id): article_id is what moves, so story_id addresses it back.
  with moved as (
    update public.news_story_articles s set article_id = p_keep_id where s.article_id = p_drop_id
      and not exists (select 1 from public.news_story_articles k where k.story_id = s.story_id and k.article_id = p_keep_id)
    returning s.story_id)
  select count(*)::int, coalesce(jsonb_agg(story_id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_story_articles', n);
  v_moved  := v_moved  || jsonb_build_object('news_story_articles', v_ids);

  -- PK (user_id, article_id): user_id addresses it back.
  with moved as (
    update public.user_news_reads u set article_id = p_keep_id where u.article_id = p_drop_id
      and not exists (select 1 from public.user_news_reads k where k.user_id = u.user_id and k.article_id = p_keep_id)
    returning u.user_id)
  select count(*)::int, coalesce(jsonb_agg(user_id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('user_news_reads', n);
  v_moved  := v_moved  || jsonb_build_object('user_news_reads', v_ids);

  -- scalar pointers
  with moved as (
    update public.news_stories set hero_article_id = p_keep_id where hero_article_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_stories_hero', n);
  v_moved  := v_moved  || jsonb_build_object('news_stories_hero', v_ids);

  with moved as (
    update public.guides set recap_article_id = p_keep_id where recap_article_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('guides_recap', n);
  v_moved  := v_moved  || jsonb_build_object('guides_recap', v_ids);

  if v_drop_slug is not null then
    select article_id into v_prior_redirect from public.news_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.news_slug_redirects (old_slug, article_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set article_id = excluded.article_id;
  end if;

  update public.news_articles set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('news', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_article_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','news','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- queer_village
CREATE OR REPLACE FUNCTION public._queer_village_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.queer_villages where id = p_keep_id;
  if not found then raise exception 'keep village % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep village is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.queer_villages where id = p_drop_id;
  if not found then raise exception 'drop village % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop village already merged'; end if;

  with moved as (
    update public.venues set queer_village_id = p_keep_id where queer_village_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venues', n);
  v_moved  := v_moved  || jsonb_build_object('venues', v_ids);

  with moved as (
    update public.events set queer_village_id = p_keep_id where queer_village_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('events', n);
  v_moved  := v_moved  || jsonb_build_object('events', v_ids);

  with moved as (
    update public.hotels set queer_village_id = p_keep_id where queer_village_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('hotels', n);
  v_moved  := v_moved  || jsonb_build_object('hotels', v_ids);

  with moved as (
    update public.trip_destinations set village_id = p_keep_id where village_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_destinations', n);
  v_moved  := v_moved  || jsonb_build_object('trip_destinations', v_ids);

  if v_drop_slug is not null then
    select village_id into v_prior_redirect from public.village_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.village_slug_redirects (old_slug, village_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set village_id = excluded.village_id;
  end if;

  update public.queer_villages set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('queer_village', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_village_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','queer_village','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- group
-- NOTE: community_groups has NO slug redirect table, so a merged group's old URL 404s
-- rather than 301ing. That is a pre-existing gap, unchanged here and not a reversibility
-- problem -- there is simply no redirect to capture or restore.
CREATE OR REPLACE FUNCTION public._group_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.community_groups where id = p_keep_id;
  if not found then raise exception 'keep group % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep group is itself a duplicate'; end if;
  select duplicate_of_id into v_drop_dup from public.community_groups where id = p_drop_id;
  if not found then raise exception 'drop group % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop group already merged'; end if;

  with moved as (
    update public.group_memberships m set group_id = p_keep_id where m.group_id = p_drop_id
      and not exists (select 1 from public.group_memberships k where k.group_id = p_keep_id and k.user_id = m.user_id)
    returning m.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_memberships', n);
  v_moved  := v_moved  || jsonb_build_object('group_memberships', v_ids);

  with moved as (
    update public.group_collections c set group_id = p_keep_id where c.group_id = p_drop_id
      and not exists (select 1 from public.group_collections k where k.group_id = p_keep_id and k.slug = c.slug)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_collections', n);
  v_moved  := v_moved  || jsonb_build_object('group_collections', v_ids);

  -- PK (trip_id, group_id): group_id is what moves, so trip_id addresses it back.
  with moved as (
    update public.trip_group_links l set group_id = p_keep_id where l.group_id = p_drop_id
      and not exists (select 1 from public.trip_group_links k where k.trip_id = l.trip_id and k.group_id = p_keep_id)
    returning l.trip_id)
  select count(*)::int, coalesce(jsonb_agg(trip_id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_group_links', n);
  v_moved  := v_moved  || jsonb_build_object('trip_group_links', v_ids);

  with moved as (
    update public.events set group_id = p_keep_id where group_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('events', n);
  v_moved  := v_moved  || jsonb_build_object('events', v_ids);

  with moved as (
    update public.group_posts set group_id = p_keep_id where group_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_posts', n);
  v_moved  := v_moved  || jsonb_build_object('group_posts', v_ids);

  with moved as (
    update public.group_invites set group_id = p_keep_id where group_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_invites', n);
  v_moved  := v_moved  || jsonb_build_object('group_invites', v_ids);

  with moved as (
    update public.group_join_requests set group_id = p_keep_id where group_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_join_requests', n);
  v_moved  := v_moved  || jsonb_build_object('group_join_requests', v_ids);

  with moved as (
    update public.group_notifications set group_id = p_keep_id where group_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('group_notifications', n);
  v_moved  := v_moved  || jsonb_build_object('group_notifications', v_ids);

  update public.community_groups set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('group', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', null,
              'slug_redirect_existed', false, 'slug_redirect_prior_group_id', null))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','group','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------- country
-- The country core reparents 21 (table, column) pairs through a dynamic `execute format`
-- loop. Four of those tables have no `id` column, so the loop carries a THIRD element --
-- the key to return -- rather than assuming `id` everywhere. `user_presence_location` and
-- `user_travel_preferences` are keyed by `user_id`; the rest by `id`.
CREATE OR REPLACE FUNCTION public._country_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
  v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
  -- (table, fk column, key column to record)
  v_triples text[] := array[
    'cities','country_id','id', 'venues','country_id','id', 'events','country_id','id',
    'festivals','country_id','id', 'hotels','country_id','id', 'organizations','country_id','id',
    'queer_villages','country_id','id', 'milestones','country_id','id',
    'personalities','country_id','id', 'personalities','death_country_id','id',
    'geo_sources','country_id','id', 'reservations','country_id','id',
    'trip_destinations','country_id','id', 'trip_documents','country_id','id',
    'trip_places','country_id','id', 'trips','primary_country_id','id',
    'user_travel_preferences','home_country_id','user_id',
    'user_presence_location','country_id','user_id',
    'flyer_scans','matched_country_id','id', 'trip_geo_review_queue','resolved_country_id','id',
    'ingestion_events','country_id','id'
  ];
  i int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id into v_keep_dup from public.countries where id = p_keep_id;
  if not found then raise exception 'keep country % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep country is itself a duplicate'; end if;
  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.countries where id = p_drop_id;
  if not found then raise exception 'drop country % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop country already merged'; end if;

  i := 1;
  while i < array_length(v_triples, 1) loop
    execute format(
      'with moved as (update public.%I set %I = $1 where %I = $2 returning %I)
       select count(*)::int, coalesce(jsonb_agg(%I), ''[]''::jsonb) from moved',
      v_triples[i], v_triples[i+1], v_triples[i+1], v_triples[i+2], v_triples[i+2])
      into n, v_ids using p_keep_id, p_drop_id;
    -- keyed `table.column` because `personalities` appears twice, under two FK columns.
    v_counts := v_counts || jsonb_build_object(v_triples[i] || '.' || v_triples[i+1], n);
    v_moved  := v_moved  || jsonb_build_object(v_triples[i] || '.' || v_triples[i+1], v_ids);
    i := i + 3;
  end loop;

  with moved as (
    update public.news_article_countries c set country_id = p_keep_id where c.country_id = p_drop_id
      and not exists (select 1 from public.news_article_countries k where k.article_id = c.article_id and k.country_id = p_keep_id)
    returning c.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('news_article_countries', n);
  v_moved  := v_moved  || jsonb_build_object('news_article_countries', v_ids);

  if v_drop_slug is not null then
    select country_id into v_prior_redirect from public.country_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.country_slug_redirects (old_slug, country_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set country_id = excluded.country_id;
  end if;

  update public.countries set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('country', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object('schema', 1, 'moved', v_moved, 'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect, 'slug_redirect_prior_country_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','country','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- The reparenting is only reversible if every id list is complete, and a typo in one
-- jsonb_build_object key stays invisible until someone tries to unmerge -- which is
-- exactly when it is too late to find out.
--
-- This asserts against the installed source rather than by performing a merge, for the
-- reason 20270822093311 gives: a self-test that merged two real rows and relied on an
-- exception handler to roll back would corrupt production the moment that rollback was
-- subtly wrong. Round-trip behaviour is proven separately in a deliberately rolled-back
-- transaction and pinned by src/lib/__tests__/mergeCoreReversibility.test.ts.
do $verify$
declare
  v_src text; v_fn text; k text; v_keys text[];
  v_specs jsonb := jsonb_build_object(
    '_marketplace_merge_core', jsonb_build_array('marketplace_collection_items','marketplace_favorites',
      'guide_picks','marketplace_reviews','wishlist_items','marketplace_listing_sources',
      'trip_packing_items','wishlists','dup_children'),
    '_personality_merge_core', jsonb_build_array('personality_internal_notes','personality_sources',
      'personality_coverage_gaps','personality_relationships_src','personality_relationships_tgt','dup_children'),
    '_organization_merge_core', jsonb_build_array('venues','marketplace_merchants','news_sources'),
    '_milestone_merge_core', jsonb_build_array('milestone_links','milestone_link_proposals'),
    '_hotel_merge_core', jsonb_build_array('trip_places'),
    '_news_merge_core', jsonb_build_array('news_article_cities','news_article_countries',
      'news_article_entities','news_story_articles','user_news_reads','news_stories_hero','guides_recap'),
    '_queer_village_merge_core', jsonb_build_array('venues','events','hotels','trip_destinations'),
    '_group_merge_core', jsonb_build_array('group_memberships','group_collections','trip_group_links',
      'events','group_posts','group_invites','group_join_requests','group_notifications')
  );
begin
  for v_fn in select jsonb_object_keys(v_specs) loop
    select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_fn;

    if v_src is null then raise exception '% not installed', v_fn; end if;
    if position('''schema'', 1' in v_src) = 0 then
      raise exception '% does not stamp details.schema = 1', v_fn;
    end if;

    select array_agg(t.value) into v_keys
    from jsonb_array_elements_text(v_specs -> v_fn) as t(value);

    foreach k in array v_keys loop
      if position('v_moved  := v_moved  || jsonb_build_object(''' || k || '''' in v_src) = 0 then
        raise exception '% never records moved ids for %', v_fn, k;
      end if;
    end loop;
  end loop;

  -- country records through a dynamic loop, so it has no literal per-table line to match.
  -- Assert the loop writes v_moved at all, and that it carries the third (key) element --
  -- without which four of its 21 tables would fail to compile a `returning id`.
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_country_merge_core';
  if v_src is null then raise exception '_country_merge_core not installed'; end if;
  if position('''schema'', 1' in v_src) = 0 then
    raise exception '_country_merge_core does not stamp details.schema = 1';
  end if;
  if position('v_moved  := v_moved  || jsonb_build_object(v_triples[i]' in v_src) = 0 then
    raise exception '_country_merge_core dynamic loop does not record moved ids';
  end if;
  foreach k in array array['user_travel_preferences'',''home_country_id'',''user_id',
                           'user_presence_location'',''country_id'',''user_id'] loop
    if position(k in v_src) = 0 then
      raise exception '_country_merge_core lost the id-less key mapping for %', split_part(k, '''', 1);
    end if;
  end loop;

  raise notice 'all 9 entity_merge_audit merge cores record moved row ids';
end $verify$;
