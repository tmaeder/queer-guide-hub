-- Event merges become reversible: record WHICH rows moved, not just how many.
--
-- `_event_merge_core` reparents six child relations onto the surviving event and
-- records the result as COUNTS -- `jsonb_build_object('event_sources', n)`. A count
-- cannot be reversed: `unmerge_entities` has no way to know which event_sources rows
-- it should push back onto the dropped id, so its event branch only ever flipped
-- duplicate_of_id and left every reparented row on the keep side. That asymmetry is
-- the stated reason the city geo arm (20260929110100) was never made auto-eligible;
-- the event arms are auto-eligible under exactly the same asymmetry, and the next
-- migration in this series widens them.
--
-- So: same reparenting, same `reparented` counts (byte-identical shape -- nothing
-- reads it, but a silent change to an audit column is not worth the risk), plus a
-- new `details` document carrying the moved row ids.
--
--   details = {
--     "schema": 1,
--     "moved": { "event_attendees":[uuid,...], "guide_picks":[...], ... },
--     "drop_slug": "...",
--     "slug_redirect_existed": bool,
--     "slug_redirect_prior_event_id": uuid|null
--   }
--
-- `schema` is the flag unmerge tests. Probing for a non-empty `moved` would conflate
-- "this merge predates the fix" with "this merge moved nothing", and those must stay
-- distinguishable -- the first cannot be reversed, the second is fully reversed by
-- doing nothing. Every key under `moved` is always present (`[]` when the branch did
-- not run) so unmerge never has to guess whether a missing key means empty or unknown.
--
-- The slug redirect is captured BEFORE the upsert overwrites it. `ON CONFLICT (old_slug)
-- DO UPDATE` silently repoints a redirect that some earlier merge created, and an
-- unmerge that only DELETEs would destroy it.
--
-- Full re-transcription of the definition from 20260826135943 (verified byte-equal
-- against the live catalog before editing). The guards, the PROGRAMME umbrella check,
-- the conflict-safe/direct split and the canonical ordering are unchanged.

CREATE OR REPLACE FUNCTION public._event_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid; v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
        v_keep_parent uuid; v_drop_parent uuid;
        v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_prior_redirect uuid; v_had_redirect boolean := false;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  select duplicate_of_id, parent_event_id into v_keep_dup, v_keep_parent from public.events where id = p_keep_id;
  if not found then raise exception 'keep event % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep event is itself a duplicate'; end if;
  select duplicate_of_id, slug, parent_event_id into v_drop_dup, v_drop_slug, v_drop_parent from public.events where id = p_drop_id;
  if not found then raise exception 'drop event % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop event already merged'; end if;

  -- PROGRAMME: an umbrella and its own child are structure, never duplicates.
  if v_keep_parent = p_drop_id or v_drop_parent = p_keep_id then
    raise exception 'events % and % are an umbrella and its programme child, not duplicates', p_keep_id, p_drop_id;
  end if;

  -- conflict-safe (unique-scoped) reparents
  with moved as (
    update public.event_attendees a set event_id = p_keep_id where a.event_id = p_drop_id
      and not exists (select 1 from public.event_attendees k where k.event_id = p_keep_id and k.user_id = a.user_id)
    returning a.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('event_attendees', n);
  v_moved  := v_moved  || jsonb_build_object('event_attendees', v_ids);

  with moved as (
    update public.guide_picks g set entity_id = p_keep_id
      where g.entity_type = 'event' and g.entity_id = p_drop_id
      and not exists (select 1 from public.guide_picks k
                      where k.guide_id = g.guide_id and k.entity_type = 'event' and k.entity_id = p_keep_id)
    returning g.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('guide_picks', n);
  v_moved  := v_moved  || jsonb_build_object('guide_picks', v_ids);

  with moved as (
    update public.event_occurrences o set master_event_id = p_keep_id where o.master_event_id = p_drop_id
      and not exists (select 1 from public.event_occurrences k where k.master_event_id = p_keep_id and k.occurrence_start = o.occurrence_start)
    returning o.id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('event_occurrences', n);
  v_moved  := v_moved  || jsonb_build_object('event_occurrences', v_ids);

  -- direct reparents (no colliding unique on the FK column)
  with moved as (
    update public.event_sources set event_id = p_keep_id where event_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('event_sources', n);
  v_moved  := v_moved  || jsonb_build_object('event_sources', v_ids);

  with moved as (
    update public.trip_places set event_id = p_keep_id where event_id = p_drop_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('trip_places', n);
  v_moved  := v_moved  || jsonb_build_object('trip_places', v_ids);

  -- PROGRAMME: the dropped row's children follow the surviving umbrella. Skipped
  -- when the keep row is itself a child, which the depth guard would reject.
  -- `reparented` keeps its old behaviour of omitting the key when skipped; `moved`
  -- always carries it, so unmerge never reads a missing key as unknown.
  v_moved := v_moved || jsonb_build_object('programme_children', '[]'::jsonb);
  if v_keep_parent is null then
    with moved as (
      update public.events set parent_event_id = p_keep_id, updated_at = now()
        where parent_event_id = p_drop_id and id <> p_keep_id
      returning id)
    select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
    v_counts := v_counts || jsonb_build_object('programme_children', n);
    v_moved  := v_moved  || jsonb_build_object('programme_children', v_ids);
  end if;

  if v_drop_slug is not null then
    select event_id into v_prior_redirect from public.event_slug_redirects where old_slug = v_drop_slug;
    v_had_redirect := found;
    insert into public.event_slug_redirects (old_slug, event_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set event_id = excluded.event_id;
  end if;

  update public.events set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  with moved as (
    update public.events set duplicate_of_id = p_keep_id, updated_at = now()
      where duplicate_of_id = p_drop_id and id <> p_keep_id
    returning id)
  select count(*)::int, coalesce(jsonb_agg(id), '[]'::jsonb) into n, v_ids from moved;
  v_counts := v_counts || jsonb_build_object('dup_children', n);
  v_moved  := v_moved  || jsonb_build_object('dup_children', v_ids);

  insert into public.entity_merge_audit (entity_type, keep_id, drop_id, actor, reparented, details)
    values ('event', p_keep_id, p_drop_id, p_actor, v_counts,
            jsonb_build_object(
              'schema', 1,
              'moved', v_moved,
              'drop_slug', v_drop_slug,
              'slug_redirect_existed', v_had_redirect,
              'slug_redirect_prior_event_id', v_prior_redirect))
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'entity_type','event','keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- The reparenting is only reversible if every id list is complete, and a typo in one
-- jsonb_build_object key stays invisible until someone tries to unmerge -- which is
-- exactly when it is too late to find out.
--
-- This asserts against the installed source rather than by performing a merge. A
-- self-test that merged two real events and relied on an exception handler to roll
-- back would corrupt production the moment that rollback was subtly wrong, and it is
-- a poor trade for catching a typo. The round-trip behaviour is proven separately, in
-- a deliberately rolled-back transaction, and pinned by
-- src/lib/__tests__/eventMergeReversibility.test.ts.
do $verify$
declare v_src text; k text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = '_event_merge_core';

  if v_src is null then raise exception '_event_merge_core not installed'; end if;
  if position('''schema'', 1' in v_src) = 0 then
    raise exception '_event_merge_core does not stamp details.schema = 1';
  end if;

  foreach k in array array['event_attendees','guide_picks','event_occurrences',
                           'event_sources','trip_places','programme_children','dup_children'] loop
    if position('v_moved  := v_moved  || jsonb_build_object(''' || k || '''' in v_src) = 0
       and position('jsonb_build_object(''' || k || ''', ''[]''::jsonb)' in v_src) = 0 then
      raise exception '_event_merge_core never records moved ids for %', k;
    end if;
  end loop;

  raise notice 'event merge records moved ids for all 7 child relations';
end $verify$;
