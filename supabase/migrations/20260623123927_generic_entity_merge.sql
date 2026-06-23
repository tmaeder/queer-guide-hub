-- Unified dedup follow-up — generic reversible soft-merge for events / marketplace
-- / personalities (2026-06-24)
--
-- Phase 1 (PR #1778) added the unified scoring engine + semantic blocker but
-- left soft-merge venue/city-only. This generalises the proven _venue_merge_core
-- pattern (20260613001000) to the three remaining high-volume types so the admin
-- /admin/duplicates surface and the nightly auto-merge sweeps can act on them.
--
-- Per type: a _<type>_merge_core(keep, drop, actor) that conflict-safely reparents
-- children, sets duplicate_of_id (hiding the dropped row from search — the
-- duplicate_of_id IS NOT NULL exclusion), records a slug redirect, and audits the
-- op in a generic entity_merge_audit (reversible). A merge_entities / unmerge_entities
-- dispatcher gives the admin UI one call site. Venues/cities keep their dedicated
-- merge_venues / merge_cities RPCs unchanged (lower risk).
--
-- marketplace_listings gains a duplicate_of_id column (it had none — it used a
-- status='inactive' sweep). The merge sets BOTH duplicate_of_id and status='inactive'
-- so it drops from active surfaces yet stays reversible + chain-collapsible.

-- ---------------------------------------------------------------------------
-- 0. marketplace_listings.duplicate_of_id (new) + slug-redirect tables + audit.
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS marketplace_listings_duplicate_of_idx
  ON public.marketplace_listings(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_slug_redirects (
  old_slug text PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketplace_slug_redirects (
  old_slug text PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.personality_slug_redirects (
  old_slug text PRIMARY KEY,
  personality_id uuid NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entity_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,            -- 'event' | 'marketplace' | 'personality'
  keep_id uuid NOT NULL,
  drop_id uuid NOT NULL,
  actor uuid,                           -- NULL = automated sweep
  reparented jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);
CREATE INDEX IF NOT EXISTS entity_merge_audit_drop_idx ON public.entity_merge_audit(entity_type, drop_id);
CREATE INDEX IF NOT EXISTS entity_merge_audit_open_idx ON public.entity_merge_audit(entity_type, created_at DESC) WHERE undone_at IS NULL;

ALTER TABLE public.entity_merge_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_merge_audit_admin_read ON public.entity_merge_audit;
CREATE POLICY entity_merge_audit_admin_read ON public.entity_merge_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 1. _event_merge_core — reparent children conflict-safely, set duplicate_of_id.
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
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('event', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','event','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. _marketplace_merge_core — reparent + duplicate_of_id + status='inactive'.
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
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('marketplace', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','marketplace','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 3. _personality_merge_core — reparent + duplicate_of_id. (People: admin/manual
--    only — no auto-merge sweep; namesakes make automated merges unsafe.)
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
  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented)
    values ('personality', p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','personality','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 4. merge_entities / unmerge_entities — admin-gated dispatcher (one call site
--    for the /admin/duplicates UI). Venues/cities keep their dedicated RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_entities(p_type text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid();
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if    p_type = 'event'       then return public._event_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'marketplace' then return public._marketplace_merge_core(p_keep_id, p_drop_id, v_actor);
  elsif p_type = 'personality' then return public._personality_merge_core(p_keep_id, p_drop_id, v_actor);
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
  else raise exception 'unsupported entity_type %', r.entity_type;
  end if;

  update public.entity_merge_audit set undone_at = now() where id = p_audit_id;
  -- Reparented children remain on the canonical (v1; mirrors unmerge_venues).
  return jsonb_build_object('undone', true, 'entity_type', r.entity_type, 'drop_id', r.drop_id);
end; $function$;

-- ---------------------------------------------------------------------------
-- 5. collapse_entity_dup_chains(p_type) — re-point chained duplicate_of_id at the
--    ultimate survivor (keeps integrity gates green after batch sweeps).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collapse_entity_dup_chains(p_type text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_tbl text; n int;
begin
  perform public.assert_admin_or_internal();
  v_tbl := case p_type when 'event' then 'events' when 'marketplace' then 'marketplace_listings'
                       when 'personality' then 'personalities' else null end;
  if v_tbl is null then raise exception 'unsupported type %', p_type; end if;
  execute format($f$
    with recursive walk as (
      select v.id as node, v.duplicate_of_id as target, 1 as depth from public.%1$I v where v.duplicate_of_id is not null
      union all
      select w.node, r.duplicate_of_id, w.depth + 1 from walk w join public.%1$I r on r.id = w.target
        where r.duplicate_of_id is not null and w.depth < 25
    ), ultimate as (select distinct on (node) node, target as ult from walk order by node, depth desc)
    update public.%1$I v set duplicate_of_id = u.ult from ultimate u
      where v.id = u.node and u.ult is not null and v.duplicate_of_id is distinct from u.ult
  $f$, v_tbl);
  get diagnostics n = row_count; return n;
end; $function$;

GRANT EXECUTE ON FUNCTION public.merge_entities(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmerge_entities(uuid) TO authenticated;
