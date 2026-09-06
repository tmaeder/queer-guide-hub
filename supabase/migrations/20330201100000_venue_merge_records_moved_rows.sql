-- Make a venue merge reversible: record WHICH rows moved, not just how many.
--
-- 20330101100100 gave venues corroborated auto-merge arms and took the engine
-- from 0 to 238 auto-eligible pairs. It shipped with a stated, accepted gap:
--
--   venue_merge_audit has no `details` column, _venue_merge_core records
--   reparenting as COUNTS ({"events": 3, "venue_sources": 1, ...}), and
--   unmerge_venues can only un-hide the dropped row -- every reparented event,
--   review, check-in, trip place and venue_sources row stays on the survivor.
--
-- That is why the first live pass ran at p_merge_cap = 40 instead of 300. This
-- migration closes the gap so the cap can be raised. It is the venue twin of
-- 20270822093311 + 20270822093412, which did the same for events, and the shape
-- is deliberately identical -- with two venue-specific differences called out
-- below, because copying the event version verbatim would be WRONG here.
--
-- DIFFERENCE 1: venue_personal_visits HAS NO `id` COLUMN. Its primary key is
-- (user_id, venue_id), so `returning id` -- which every event relation uses --
-- does not compile against it. The reverse key for that relation is the
-- user_id, and unmerge restores it by (venue_id = keep AND user_id IN (...)).
-- Checked against the live catalog rather than assumed: every other reparented
-- relation here does have an `id`.
--
-- DIFFERENCE 2: guide_picks moves `entity_id`, not a venue_id column, and is
-- shared with every other entity type (it is filtered on entity_type='venue').
-- The restore therefore writes entity_id, and only for the recorded ids.
--
-- `schema` is the flag unmerge tests. Probing for a non-empty `moved` would
-- conflate "this merge predates the fix" with "this merge moved nothing", and
-- those must stay distinguishable -- the first cannot be reversed, the second is
-- fully reversed by doing nothing. Every key under `moved` is always present
-- (`[]` when the branch moved nothing) so unmerge never has to guess whether a
-- missing key means empty or unknown.
--
-- THE 1,544 EXISTING AUDIT ROWS ARE ALL PRE-SCHEMA AND STAY THAT WAY. There is
-- no backfill and there cannot be one: the information was never recorded, and
-- inventing it -- "reparent everything currently on the keep row that looks like
-- it came from the drop row" -- would move rows that legitimately belonged to
-- the survivor all along. unmerge REFUSES those loudly instead, and p_force is
-- the escape hatch for the old behaviour.
--
-- The slug redirect is captured BEFORE the upsert overwrites it. _venue_merge_core
-- does `on conflict (old_slug) do update set venue_id = excluded.venue_id`, so a
-- merge silently overwrites any prior redirect and the old unmerge then DELETEd
-- the row outright -- turning a previously-working link into a 404. It also
-- looked the slug up LIVE (`select slug from venues where id = a.drop_id`) rather
-- than using the value recorded at merge time, so a slug edited after the merge
-- made the delete miss entirely.

ALTER TABLE public.venue_merge_audit ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN public.venue_merge_audit.details IS
  'Reversibility record. {schema:1, moved:{relation: [ids...]}, drop_slug, '
  'slug_redirect_existed, slug_redirect_prior_venue_id}. Rows written before '
  '20330201100000 have NULL here and their reparenting cannot be restored -- '
  'unmerge_venues refuses them unless p_force. `moved.venue_personal_visits` '
  'holds USER IDs, not row ids: that table is keyed (user_id, venue_id).';

CREATE OR REPLACE FUNCTION public._venue_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_moved jsonb := '{}'::jsonb;
  v_audit_id uuid; n int; v_ids jsonb;
  v_had_redirect boolean := false; v_prior_redirect uuid;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select duplicate_of_id into v_keep_dup from public.venues where id = p_keep_id;
  if not found then raise exception 'keep venue % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep venue is itself a duplicate'; end if;

  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.venues where id = p_drop_id;
  if not found then raise exception 'drop venue % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop venue already merged'; end if;

  -- `reparented` keeps its exact old shape and meaning; `moved` is additive.
  with moved as (
    update public.events set venue_id = p_keep_id where venue_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('events', n);
  v_moved  := v_moved  || jsonb_build_object('events', v_ids);

  with moved as (
    update public.festivals set venue_id = p_keep_id where venue_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('festivals', n);
  v_moved  := v_moved  || jsonb_build_object('festivals', v_ids);

  with moved as (
    update public.marketplace_listings set venue_id = p_keep_id where venue_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('marketplace_listings', n);
  v_moved  := v_moved  || jsonb_build_object('marketplace_listings', v_ids);

  with moved as (
    update public.trip_places set venue_id = p_keep_id where venue_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_places', n);
  v_moved  := v_moved  || jsonb_build_object('trip_places', v_ids);

  with moved as (
    update public.venue_checkins set venue_id = p_keep_id where venue_id = p_drop_id returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venue_checkins', n);
  v_moved  := v_moved  || jsonb_build_object('venue_checkins', v_ids);

  with moved as (
    update public.venue_reviews r set venue_id = p_keep_id where r.venue_id = p_drop_id
      and not exists (select 1 from public.venue_reviews k where k.venue_id = p_keep_id and k.user_id = r.user_id)
    returning r.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venue_reviews', n);
  v_moved  := v_moved  || jsonb_build_object('venue_reviews', v_ids);

  -- USER IDS, not row ids: venue_personal_visits is keyed (user_id, venue_id)
  -- and has no id column at all. See the header.
  with moved as (
    update public.venue_personal_visits v set venue_id = p_keep_id where v.venue_id = p_drop_id
      and not exists (select 1 from public.venue_personal_visits k where k.venue_id = p_keep_id and k.user_id = v.user_id)
    returning v.user_id)
  select count(*)::int, coalesce(jsonb_agg(user_id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venue_personal_visits', n);
  v_moved  := v_moved  || jsonb_build_object('venue_personal_visits', v_ids);

  with moved as (
    update public.guide_picks g set entity_id = p_keep_id
      where g.entity_type = 'venue' and g.entity_id = p_drop_id
      and not exists (select 1 from public.guide_picks k
                      where k.guide_id = g.guide_id and k.entity_type = 'venue' and k.entity_id = p_keep_id)
    returning g.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('guide_picks', n);
  v_moved  := v_moved  || jsonb_build_object('guide_picks', v_ids);

  with moved as (
    update public.venue_sources s set venue_id = p_keep_id where s.venue_id = p_drop_id
      and not exists (select 1 from public.venue_sources k where k.venue_id = p_keep_id
                      and k.source_slug = s.source_slug and k.source_entity_id is not distinct from s.source_entity_id)
    returning s.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('venue_sources', n);
  v_moved  := v_moved  || jsonb_build_object('venue_sources', v_ids);

  -- Capture the redirect this merge is about to overwrite, BEFORE overwriting it.
  if v_drop_slug is not null then
    select venue_id into v_prior_redirect from public.venue_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.venue_slug_redirects (old_slug, venue_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set venue_id = excluded.venue_id;
  end if;

  update public.venues set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  -- venues merged INTO the dropped venue earlier must follow it to the survivor,
  -- else their pointers chain (critical dup_integrity gate)
  with moved as (
    update public.venues set duplicate_of_id = p_keep_id, updated_at = now()
      where duplicate_of_id = p_drop_id and id <> p_keep_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('dup_children', v_ids);

  insert into public.venue_merge_audit (keep_id, drop_id, actor, reparented, details)
    values (p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object(
              'schema', 1,
              'moved', v_moved,
              'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect,
              'slug_redirect_prior_venue_id', v_prior_redirect))
    returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- Signature change, so the old one must be DROPPED rather than left alongside:
-- PostgREST resolves overloads BY ARGUMENT NAME, and a call naming only
-- p_audit_id would be ambiguous between two candidates (42725) rather than
-- picking the newer. src/hooks/useVenueDuplicates.ts calls this natively through
-- the generated types with only p_audit_id, which still binds to the defaulted
-- 2-arg form.
DROP FUNCTION IF EXISTS public.unmerge_venues(uuid);

CREATE OR REPLACE FUNCTION public.unmerge_venues(p_audit_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a public.venue_merge_audit;
  v_moved jsonb; v_counts jsonb := '{}'::jsonb; n int;
  v_restored boolean := false;
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into a from public.venue_merge_audit where id = p_audit_id;
  if not found then raise exception 'audit % not found', p_audit_id; end if;
  if a.undone_at is not null then raise exception 'merge already undone'; end if;

  -- A merge recorded before 20330201100000 has no id lists, so its reparenting is
  -- unrecoverable. Refuse loudly instead of reporting a success that did not
  -- happen -- all 1,544 audit rows that existed at that point are in this class.
  if coalesce((a.details->>'schema')::int, 0) < 1 then
    if not p_force then
      raise exception 'merge audit % predates moved-row recording; its reparenting cannot be restored. Re-run with p_force => true to clear duplicate_of_id only, leaving children on the keep row.', p_audit_id;
    end if;
  else
    v_moved := a.details->'moved';

    update public.events set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'events','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);

    update public.festivals set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'festivals','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);

    update public.marketplace_listings set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'marketplace_listings','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listings', n);

    update public.trip_places set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'trip_places','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);

    update public.venue_checkins set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venue_checkins','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_checkins', n);

    update public.venue_reviews set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venue_reviews','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_reviews', n);

    -- Keyed (user_id, venue_id): the recorded values are USER ids, and the row to
    -- move back is the one now sitting on the keep venue for that user.
    update public.venue_personal_visits set venue_id = a.drop_id
      where venue_id = a.keep_id
        and user_id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venue_personal_visits','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_personal_visits', n);

    -- guide_picks moves entity_id, and is shared across entity types.
    update public.guide_picks set entity_id = a.drop_id
      where entity_type = 'venue'
        and id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'guide_picks','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('guide_picks', n);

    update public.venue_sources set venue_id = a.drop_id
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'venue_sources','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_sources', n);

    update public.venues set duplicate_of_id = a.drop_id, updated_at = now()
      where id in (select v::uuid from jsonb_array_elements_text(coalesce(v_moved->'dup_children','[]'::jsonb)) v);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('dup_children', n);

    -- Put the redirect back the way it was: restore the row this merge
    -- overwrote, or remove the row this merge created. Uses the slug RECORDED AT
    -- MERGE TIME, not a live lookup -- the old version re-derived it from
    -- venues.slug, so a slug edited after the merge made the delete miss.
    if coalesce(a.details->>'drop_slug','') <> '' then
      if coalesce((a.details->>'slug_redirect_existed')::boolean, false) then
        update public.venue_slug_redirects
           set venue_id = (a.details->>'slug_redirect_prior_venue_id')::uuid
         where old_slug = a.details->>'drop_slug';
      else
        delete from public.venue_slug_redirects where old_slug = a.details->>'drop_slug';
      end if;
    end if;

    v_restored := true;
  end if;

  update public.venues set duplicate_of_id = null, updated_at = now()
    where id = a.drop_id and duplicate_of_id = a.keep_id;
  update public.venue_merge_audit set undone_at = now() where id = p_audit_id;

  return jsonb_build_object('unmerged', a.drop_id, 'keep_id', a.keep_id,
    'reparenting_restored', v_restored,
    'restored', case when v_restored then v_counts else null end);
end; $function$;

REVOKE ALL ON FUNCTION public.unmerge_venues(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_venues(uuid, boolean) TO authenticated, service_role;

DO $verify$
DECLARE v_overloads int; v_def text;
BEGIN
  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'unmerge_venues';
  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'unmerge_venues has % signatures -- a named PostgREST call would be ambiguous', v_overloads;
  END IF;

  v_def := pg_get_functiondef('public._venue_merge_core(uuid,uuid,uuid)'::regprocedure);
  IF v_def NOT LIKE '%''schema'', 1%' THEN
    RAISE EXCEPTION '_venue_merge_core does not stamp schema:1';
  END IF;
  -- Every relation must appear in `moved`, or unmerge silently leaves that
  -- relation on the survivor while reporting a restore.
  IF v_def NOT LIKE '%jsonb_build_object(''events'', v_ids)%'
     OR v_def NOT LIKE '%jsonb_build_object(''venue_personal_visits'', v_ids)%'
     OR v_def NOT LIKE '%jsonb_build_object(''dup_children'', v_ids)%' THEN
    RAISE EXCEPTION '_venue_merge_core is not recording every relation into moved';
  END IF;

  RAISE NOTICE 'venue merge reversibility: 1 unmerge signature, schema:1 stamped, moved recorded';
END $verify$;
