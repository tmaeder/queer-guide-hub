-- unmerge_entities actually puts the children back, for all ten types it handles.
--
-- Before this, nine of its ten branches were:
--
--     update <table> set duplicate_of_id = null where id = r.drop_id;
--     delete from <type>_slug_redirects where ...;
--
-- and then it returned `{'undone': true, 'reparenting_restored': <null for everything
-- except event>}`. Every reparented child stayed on the survivor. The admin console
-- (AdminDuplicates.tsx) prints `toast.success('Merge undone')` on that, under a page
-- header that reads "every merge is reversible" -- so the reviewer was told the undo
-- worked, across 2,965 marketplace merges, 139 news, 86 organization and 5 personality.
--
-- What those merges actually moved is stated precisely in 20810101100000's header and
-- is NOT what it looks like: no user row has ever been moved by a merge (the favourites,
-- reviews and wishlist tables hold 1, 0 and 1 rows in the whole database). The loss is
-- provenance and topical links -- 1,845 marketplace_listing_sources, 32
-- news_article_cities, 29 personality_relationships. Still unrecoverable, still worth
-- fixing, and the user-data exposure is real the moment those tables fill -- but it is a
-- future risk, not a past harm.
--
-- 20810101100000 makes the nine cores record `details.moved`. This replays it.
--
-- THREE RULES, all inherited from the event/venue precedents:
--
-- 1. A PRE-SCHEMA AUDIT IS REFUSED, NOT HALF-UNDONE. Every one of the 3,885 existing
--    `entity_merge_audit` rows is in that class -- the information was never recorded and
--    inventing it would reparent rows that legitimately belong to the survivor. `p_force`
--    still gives the old flag-flip-only behaviour, and then `reparenting_restored` is
--    FALSE. Refusing loudly beats reporting a success that did not happen.
--
-- 2. `reparenting_restored` IS NOW THE REAL ANSWER FOR EVERY TYPE. It used to be
--    `case when r.entity_type = 'event' then v_restored else null end`. A null there is
--    what let the UI treat "not applicable" and "did not happen" as the same thing.
--
-- 3. THE SLUG REDIRECT IS RESTORED, NOT JUST DELETED. The merge's
--    `on conflict (old_slug) do update` silently repoints a redirect an earlier merge
--    created; deleting on the way back destroys it. `slug_redirect_existed` says which.
--
-- THE SIX ID-LESS TABLES are restored by the key their core recorded -- see the header of
-- 20810101100000 for why each one is what it is. The recorded value is the half of the
-- composite key the merge does NOT rewrite, so `where <recorded> in (...) and <fk> =
-- keep_id` addresses exactly the moved rows and cannot touch rows that were already on
-- the survivor. `personality_internal_notes` is the exception and is guarded separately:
-- its PK is `(personality_id)` alone, so the recorded value IS the keep id, and the
-- restore is only safe because a non-empty list proves the keep row had no note of its
-- own (two notes would have raised 23505 during the merge).
--
-- `group` has no slug redirect table at all, so its branch has nothing to restore there.

CREATE OR REPLACE FUNCTION public.unmerge_entities(p_audit_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid(); r record;
  v_moved jsonb; v_restored boolean := false; v_counts jsonb := '{}'::jsonb; n int;
  v_pre_schema boolean;
  -- country restore mirrors the merge's (table, fk column, recorded key) triples.
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
  i int; v_key text;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into r from public.entity_merge_audit where id = p_audit_id and undone_at is null;
  if not found then raise exception 'merge audit % not found or already undone', p_audit_id; end if;

  v_pre_schema := coalesce((r.details->>'schema')::int, 0) < 1;
  if v_pre_schema and not p_force then
    raise exception 'merge audit % predates moved-row recording; its reparenting cannot be restored. Re-run with p_force => true to clear duplicate_of_id only, leaving children on the keep row.', p_audit_id;
  end if;
  v_moved := r.details->'moved';

  if r.entity_type = 'event' then
    if not v_pre_schema then
      update public.event_attendees set event_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'event_attendees','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_attendees', n);

      update public.guide_picks set entity_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guide_picks','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

      update public.event_occurrences set master_event_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'event_occurrences','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_occurrences', n);

      update public.event_sources set event_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'event_sources','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('event_sources', n);

      update public.trip_places set event_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_places','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

      update public.events set parent_event_id = r.drop_id, updated_at = now()
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'programme_children','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('programme_children', n);

      update public.events set duplicate_of_id = r.drop_id, updated_at = now()
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.event_slug_redirects set event_id = (r.details->>'slug_redirect_prior_event_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.event_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.events set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.event_slug_redirects
       where event_id = r.keep_id and old_slug = (select slug from public.events where id = r.drop_id);
    end if;

  elsif r.entity_type = 'marketplace' then
    if not v_pre_schema then
      update public.marketplace_collection_items set listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_collection_items','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_collection_items', n);

      update public.marketplace_favorites set listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_favorites','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_favorites', n);

      update public.guide_picks set entity_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guide_picks','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

      update public.marketplace_reviews set listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_reviews','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_reviews', n);

      update public.wishlist_items set listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'wishlist_items','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('wishlist_items', n);

      update public.marketplace_listing_sources set listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_listing_sources','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listing_sources', n);

      update public.trip_packing_items set marketplace_listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_packing_items','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_packing_items', n);

      update public.wishlists set cover_listing_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'wishlists','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('wishlists', n);

      update public.marketplace_listings set duplicate_of_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.marketplace_slug_redirects set listing_id = (r.details->>'slug_redirect_prior_listing_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.marketplace_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.marketplace_listings set duplicate_of_id = null, status = 'active', deprecated_at = null,
      sensitivity_flags = coalesce(sensitivity_flags,'[]'::jsonb) - 'inactive_reason' where id = r.drop_id;
    if not v_restored then
      delete from public.marketplace_slug_redirects where listing_id = r.keep_id
        and old_slug = (select slug from public.marketplace_listings where id = r.drop_id);
    end if;

  elsif r.entity_type = 'personality' then
    if not v_pre_schema then
      -- PK is (personality_id): a non-empty list proves the keep row had no note of its
      -- own, so moving the note at keep_id back to drop_id cannot steal anyone's note.
      if jsonb_array_length(coalesce(v_moved->'personality_internal_notes','[]'::jsonb)) > 0 then
        update public.personality_internal_notes set personality_id = r.drop_id where personality_id = r.keep_id;
        get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_internal_notes', n);
      end if;

      update public.personality_sources set personality_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'personality_sources','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_sources', n);

      update public.personality_coverage_gaps set personality_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'personality_coverage_gaps','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_coverage_gaps', n);

      update public.personality_relationships set source_personality_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'personality_relationships_src','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_relationships_src', n);

      update public.personality_relationships set target_personality_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'personality_relationships_tgt','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personality_relationships_tgt', n);

      update public.personalities set duplicate_of_id = r.drop_id, updated_at = now()
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.personality_slug_redirects set personality_id = (r.details->>'slug_redirect_prior_personality_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.personality_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.personalities set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.personality_slug_redirects where personality_id = r.keep_id
        and old_slug = (select slug from public.personalities where id = r.drop_id);
    end if;

  elsif r.entity_type = 'organization' then
    if not v_pre_schema then
      update public.venues set organization_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venues','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);

      update public.marketplace_merchants set organization_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_merchants','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_merchants', n);

      update public.news_sources set organization_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_sources','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_sources', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.org_slug_redirects set organization_id = (r.details->>'slug_redirect_prior_organization_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.org_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.organizations set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.org_slug_redirects where organization_id = r.keep_id
        and old_slug = (select slug from public.organizations where id = r.drop_id);
    end if;

  elsif r.entity_type = 'milestone' then
    if not v_pre_schema then
      update public.milestone_links set milestone_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'milestone_links','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('milestone_links', n);

      update public.milestone_link_proposals set milestone_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'milestone_link_proposals','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('milestone_link_proposals', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.milestone_slug_redirects set milestone_id = (r.details->>'slug_redirect_prior_milestone_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.milestone_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.milestones set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.milestone_slug_redirects where milestone_id = r.keep_id
        and old_slug = (select slug from public.milestones where id = r.drop_id);
    end if;

  elsif r.entity_type = 'hotel' then
    if not v_pre_schema then
      update public.trip_places set hotel_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_places','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.hotel_slug_redirects set hotel_id = (r.details->>'slug_redirect_prior_hotel_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.hotel_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.hotels set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.hotel_slug_redirects where hotel_id = r.keep_id
        and old_slug = (select slug from public.hotels where id = r.drop_id);
    end if;

  elsif r.entity_type = 'news' then
    if not v_pre_schema then
      update public.news_article_cities set article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_cities','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_cities', n);

      update public.news_article_countries set article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_countries','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_countries', n);

      update public.news_article_entities set article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_entities','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_entities', n);

      -- PK (story_id, article_id): story_id was recorded, article_id is what moved.
      update public.news_story_articles set article_id = r.drop_id
        where article_id = r.keep_id
          and story_id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_story_articles','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_story_articles', n);

      -- PK (user_id, article_id): user_id was recorded.
      update public.user_news_reads set article_id = r.drop_id
        where article_id = r.keep_id
          and user_id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'user_news_reads','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('user_news_reads', n);

      update public.news_stories set hero_article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_stories_hero','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_stories_hero', n);

      update public.guides set recap_article_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guides_recap','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guides_recap', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.news_slug_redirects set article_id = (r.details->>'slug_redirect_prior_article_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.news_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.news_articles set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.news_slug_redirects where article_id = r.keep_id
        and old_slug = (select slug from public.news_articles where id = r.drop_id);
    end if;

  elsif r.entity_type = 'queer_village' then
    if not v_pre_schema then
      update public.venues set queer_village_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venues','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);

      update public.events set queer_village_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'events','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);

      update public.hotels set queer_village_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'hotels','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('hotels', n);

      update public.trip_destinations set village_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_destinations','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_destinations', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.village_slug_redirects set village_id = (r.details->>'slug_redirect_prior_village_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.village_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.queer_villages set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.village_slug_redirects where village_id = r.keep_id
        and old_slug = (select slug from public.queer_villages where id = r.drop_id);
    end if;

  elsif r.entity_type = 'country' then
    if not v_pre_schema then
      i := 1;
      while i < array_length(v_triples, 1) loop
        v_key := v_triples[i] || '.' || v_triples[i+1];
        execute format(
          'update public.%I set %I = $1 where %I = $2 and %I in (select v::uuid from jsonb_array_elements_text($3) v)',
          v_triples[i], v_triples[i+1], v_triples[i+1], v_triples[i+2])
          using r.drop_id, r.keep_id, coalesce(v_moved->v_key, '[]'::jsonb);
        get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object(v_key, n);
        i := i + 3;
      end loop;

      update public.news_article_countries set country_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'news_article_countries','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('news_article_countries', n);

      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.country_slug_redirects set country_id = (r.details->>'slug_redirect_prior_country_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.country_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;
      v_restored := true;
    end if;
    update public.countries set duplicate_of_id = null, updated_at = now() where id = r.drop_id;
    if not v_restored then
      delete from public.country_slug_redirects where country_id = r.keep_id
        and old_slug = (select slug from public.countries where id = r.drop_id);
    end if;

  elsif r.entity_type = 'group' then
    if not v_pre_schema then
      update public.group_memberships set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_memberships','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_memberships', n);

      update public.group_collections set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_collections','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_collections', n);

      -- PK (trip_id, group_id): trip_id was recorded, group_id is what moved.
      update public.trip_group_links set group_id = r.drop_id
        where group_id = r.keep_id
          and trip_id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_group_links','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_group_links', n);

      update public.events set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'events','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);

      update public.group_posts set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_posts','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_posts', n);

      update public.group_invites set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_invites','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_invites', n);

      update public.group_join_requests set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_join_requests','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_join_requests', n);

      update public.group_notifications set group_id = r.drop_id
        where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'group_notifications','[]'::jsonb)) v);
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('group_notifications', n);

      v_restored := true;
    end if;
    update public.community_groups set duplicate_of_id = null, updated_at = now() where id = r.drop_id;

  else raise exception 'unsupported entity_type %', r.entity_type;
  end if;

  update public.entity_merge_audit set undone_at = now() where id = p_audit_id;
  return jsonb_build_object('undone', true, 'entity_type', r.entity_type, 'drop_id', r.drop_id,
    'reparenting_restored', v_restored,
    'restored', case when v_restored then v_counts else null end);
end; $function$;

-- `reparenting_restored` returning null for nine of ten types is the specific defect this
-- migration exists to close, and it is invisible from the outside -- the old function
-- returned `{"undone": true}` either way. Assert on the installed source that the
-- type-conditional is gone and that every branch replays something.
do $verify$
declare v_src text; t text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities';
  if v_src is null then raise exception 'unmerge_entities not installed'; end if;

  if position('case when r.entity_type = ''event'' then v_restored else null end' in v_src) > 0 then
    raise exception 'unmerge_entities still reports reparenting_restored only for events';
  end if;
  if position('''reparenting_restored'', v_restored' in v_src) = 0 then
    raise exception 'unmerge_entities does not report the real reparenting_restored value';
  end if;
  if position('v_pre_schema and not p_force' in v_src) = 0 then
    raise exception 'unmerge_entities no longer refuses pre-schema audits without p_force';
  end if;

  -- Every branch must actually push rows back. A branch that only clears duplicate_of_id
  -- is the original bug, and it reads identically from the return value.
  foreach t in array array['marketplace','personality','organization','milestone','hotel',
                           'news','queer_village','country','group','event'] loop
    if position('r.entity_type = ''' || t || '''' in v_src) = 0 then
      raise exception 'unmerge_entities lost its % branch', t;
    end if;
  end loop;

  foreach t in array array['marketplace_favorites','marketplace_reviews','wishlist_items',
                           'personality_sources','milestone_links','trip_places',
                           'news_article_cities','news_story_articles','user_news_reads',
                           'group_memberships','trip_group_links','news_article_countries'] loop
    if position('v_moved->''' || t || '''' in v_src) = 0 then
      raise exception 'unmerge_entities never replays %', t;
    end if;
  end loop;

  -- The three composite-key restores must be scoped by the surviving id as well as the
  -- recorded key, or they would drag back rows that were always on the keep row.
  if position('where article_id = r.keep_id' in v_src) = 0
     or position('where group_id = r.keep_id' in v_src) = 0 then
    raise exception 'a composite-key restore is not scoped to the keep id';
  end if;

  raise notice 'unmerge_entities replays reparenting for all ten types';
end $verify$;
