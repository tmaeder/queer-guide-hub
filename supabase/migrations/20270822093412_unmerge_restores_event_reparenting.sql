-- unmerge_entities actually undoes an event merge.
--
-- Before this, the event branch flipped duplicate_of_id and deleted a slug redirect
-- and stopped there. Every reparented row -- sources, attendees, occurrences, trip
-- places, programme children, dup children -- stayed on the keep side, so "unmerge"
-- produced a live event stripped of its own children. With 20270822093311 recording
-- the moved ids, the reparenting can now be replayed backwards.
--
-- TWO THINGS ARE DELIBERATE.
--
-- 1. A pre-fix audit row carries no details.schema, and it is refused rather than
--    half-undone. Silently flipping duplicate_of_id and reporting success would
--    record absence of evidence as evidence of absence: the caller would believe the
--    merge was reversed while the children stayed put. `p_force => true` performs
--    exactly the old behaviour and says so in the return value
--    (reparenting_restored: false), so the escape hatch exists but cannot be taken by
--    accident. All 645 event audit rows written before today are in this class.
--
-- 2. The signature gains a parameter, which makes a NEW function rather than
--    replacing the old one. Leaving both would be the PostgREST overload trap:
--    resolution is BY ARGUMENT NAME and a mismatch answers a silent PGRST202 404, so
--    the 1-arg form is DROPped first. The only caller, src/hooks/useVenueDuplicates.ts,
--    passes p_audit_id alone and binds to the default.
--
-- Grants are restated because DROP takes them with it: authenticated + service_role,
-- matching the live ACL. anon stays out, per 20260822100000.
--
-- The slug redirect is restored from details rather than recomputed. The old code
-- looked the slug up live (`select slug from events where id = drop_id`), which is
-- wrong twice over: the event's slug may have changed since the merge, and an
-- unconditional DELETE destroys a redirect that predated this merge instead of
-- putting back the row it overwrote.

DROP FUNCTION IF EXISTS public.unmerge_entities(uuid);

CREATE OR REPLACE FUNCTION public.unmerge_entities(p_audit_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid(); r record;
        v_moved jsonb; v_restored boolean := false; v_counts jsonb := '{}'::jsonb; n int;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into r from public.entity_merge_audit where id = p_audit_id and undone_at is null;
  if not found then raise exception 'merge audit % not found or already undone', p_audit_id; end if;
  if r.entity_type = 'event' then
    -- A merge recorded before 20270822093311 has no id lists, so its reparenting is
    -- unrecoverable. Refuse loudly instead of reporting a success that did not happen.
    if coalesce((r.details->>'schema')::int, 0) < 1 then
      if not p_force then
        raise exception 'merge audit % predates moved-row recording; its reparenting cannot be restored. Re-run with p_force => true to clear duplicate_of_id only, leaving children on the keep row.', p_audit_id;
      end if;
    else
      v_moved := r.details->'moved';

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

      -- Put the redirect back the way it was: restore the row this merge overwrote,
      -- or remove the row this merge created.
      if coalesce(r.details->>'drop_slug','') <> '' then
        if coalesce((r.details->>'slug_redirect_existed')::boolean, false) then
          update public.event_slug_redirects
             set event_id = (r.details->>'slug_redirect_prior_event_id')::uuid
           where old_slug = r.details->>'drop_slug';
        else
          delete from public.event_slug_redirects where old_slug = r.details->>'drop_slug';
        end if;
      end if;

      v_restored := true;
    end if;

    update public.events set duplicate_of_id = null, updated_at = now() where id = r.drop_id;

    if not v_restored then
      -- forced legacy path: same reach as the old code, including its slug lookup
      delete from public.event_slug_redirects
       where event_id = r.keep_id and old_slug = (select slug from public.events where id = r.drop_id);
    end if;
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
  return jsonb_build_object('undone', true, 'entity_type', r.entity_type, 'drop_id', r.drop_id,
    'reparenting_restored', case when r.entity_type = 'event' then v_restored else null end,
    'restored', case when v_restored then v_counts else null end);
end; $function$;

REVOKE ALL ON FUNCTION public.unmerge_entities(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.unmerge_entities(uuid, boolean) TO authenticated, service_role;

-- The 1-arg form must be gone: two overloads is the PGRST202 trap this migration
-- exists to avoid, and a leftover copy would keep serving the un-restoring branch.
do $verify$
declare v_n int;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'unmerge_entities';
  if v_n <> 1 then
    raise exception 'expected exactly one unmerge_entities, found %', v_n;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'unmerge_entities'
      and pg_get_function_arguments(p.oid) = 'p_audit_id uuid, p_force boolean DEFAULT false'
  ) then
    raise exception 'unmerge_entities does not carry the p_force default';
  end if;

  raise notice 'unmerge_entities: single 2-arg definition installed';
end $verify$;
