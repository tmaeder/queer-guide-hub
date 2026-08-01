-- SECURITY: the 11 `_*_merge_core` functions were callable by anon.
--
-- Found while triaging the dedup review queue. Every merge core is SECURITY
-- DEFINER and carries NO authorization check of its own -- the admin gate lives
-- only in the public wrapper (merge_venues / merge_cities / merge_entities).
-- But the cores were granted `=X/postgres` (PUBLIC) plus an explicit `anon`
-- grant, so the gate could be bypassed by calling the core directly over
-- PostgREST:
--
--   POST /rest/v1/rpc/_venue_merge_core {"p_keep_id": "...", "p_drop_id": "..."}
--
-- with nothing but the anon key. That soft-deletes the dropped entity
-- (duplicate_of_id), reparents its children, writes a slug redirect and an audit
-- row -- i.e. an anonymous visitor could disappear arbitrary venues, events,
-- news articles, personalities, hotels, marketplace listings, orgs, villages,
-- groups, countries or milestones from the site. The merges are reversible via
-- the unmerge paths, but nothing stopped them being made.
--
-- No application code calls a core directly (verified across src/,
-- supabase/functions/, workers/, scripts/ -- the only hits are in the generated
-- src/integrations/supabase/types.ts, which is itself evidence that these were
-- exposed to the client API). The wrappers are SECURITY DEFINER and execute as
-- postgres, so they keep reaching the cores regardless of caller grants.
--
-- Revoke from PUBLIC/anon/authenticated; leave service_role + postgres.
do $$
declare fn text;
begin
  foreach fn in array array[
    '_country_merge_core','_event_merge_core','_group_merge_core','_hotel_merge_core',
    '_marketplace_merge_core','_milestone_merge_core','_news_merge_core',
    '_organization_merge_core','_personality_merge_core','_queer_village_merge_core',
    '_venue_merge_core'
  ] loop
    execute format(
      'revoke all on function public.%I(uuid, uuid, uuid) from public, anon, authenticated', fn);
    execute format(
      'grant execute on function public.%I(uuid, uuid, uuid) to service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Consistency: merge_venues rejected internal (NULL-actor) callers.
--
-- merge_cities and merge_entities both gate as:
--     if v_actor is not null and not admin then raise
-- i.e. a logged-in non-admin is refused, while an internal/service caller with
-- no auth.uid() is allowed. merge_venues instead demanded that auth.uid() BE an
-- admin, so it refused NULL outright. Because approve_dedup_review() delegates
-- to merge_venues for venue pairs, the venue branch of the review queue could
-- never be actioned from any internal context -- only from a browser session
-- with an admin JWT -- even though approve_dedup_review already enforces
-- assert_admin_or_internal() before it gets there.
--
-- Align it with its siblings. This does not widen access: merge_venues is
-- granted to authenticated + service_role only (never anon), and an
-- authenticated caller always has a non-null auth.uid(), so the admin check
-- still applies to every real user. Only service_role/postgres see NULL.
create or replace function public.merge_venues(p_keep_id uuid, p_drop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is not null
     and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  return public._venue_merge_core(p_keep_id, p_drop_id, v_actor);
end;
$$;

revoke all on function public.merge_venues(uuid, uuid) from public, anon;
grant execute on function public.merge_venues(uuid, uuid) to authenticated, service_role;
