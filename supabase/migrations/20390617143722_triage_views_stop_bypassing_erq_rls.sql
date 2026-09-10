-- The four triage_src_quality_* views hand the ADMIN review queue to any logged-in user.
--
-- `entity_review_queue` has RLS enabled with an explicit role gate:
--     erq_read  [SELECT] has_any_role_jwt(ARRAY['admin','moderator'])
--     erq_write [ALL]    has_any_role_jwt(ARRAY['admin'])
--
-- A view created without `security_invoker` runs as its DEFINER, so RLS on the underlying table is
-- evaluated for the view owner and NOT for the caller. These four are granted to `authenticated`,
-- so the role gate above is defeated for every signed-in account.
--
-- Measured on prod 2026-09-10, all three in ONE transaction under `SET LOCAL ROLE authenticated`:
--
--     context                        venue    city
--     today, plain authenticated      1187     763     <- the bypass, live
--     after fix, plain authenticated     0       0     <- RLS applies
--     after fix, privileged           1187     763     <- admin path unaffected
--
-- What was reachable: the open review queue joined to entity names -- which venue/city/village/
-- listing is under review, for which FIELD, the PROPOSED VALUE that has not been published yet,
-- its citations, the model that produced it and its confidence. That is unreleased editorial state
-- plus internal ML metadata, and the RLS policy says plainly who is supposed to see it.
--
-- `security_invoker = on` is the fix and it is the convention this repo already uses on dozens of
-- views. The caller's own privileges apply, so `erq_read` starts working: admins and moderators
-- keep seeing everything (the admin inbox is unaffected), everyone else sees zero rows.
--
-- SCOPE. The advisor flags eight SECURITY DEFINER views; only these four are a bypass, and the
-- other four are deliberately left alone after reading each definition:
--   tag_broader / tag_narrower  -> tag_relations, public tag ontology, anon-readable by design
--   tag_facets                  -> unified_tag_assignments, same
--   v_silo_concept_crosswalk    -> is_active vocabulary tables (venue_services, event_types,
--                                  event_amenities, event_services, accessibility_attributes,
--                                  target_groups, professions) + unified_tags
-- None of those reads a table whose RLS restricts by role, so flipping them buys nothing and
-- risks breaking anon reads if a caller lacks a grant on an underlying table. Fixing all eight
-- because the advisor lists eight would be the wrong move.

alter view public.triage_src_quality_venue       set (security_invoker = on);
alter view public.triage_src_quality_city        set (security_invoker = on);
alter view public.triage_src_quality_village     set (security_invoker = on);
alter view public.triage_src_quality_marketplace set (security_invoker = on);

do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ')
    into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('triage_src_quality_venue','triage_src_quality_city',
                      'triage_src_quality_village','triage_src_quality_marketplace')
    and coalesce(c.reloptions::text, '') not like '%security_invoker%';

  if v_missing is not null then
    raise exception 'still running as definer: %', v_missing;
  end if;

  -- The gate these views must now respect has to actually exist. If someone drops RLS or the
  -- erq_read policy later, security_invoker alone stops protecting anything and this should say so.
  if not (select relrowsecurity from pg_class where oid = 'public.entity_review_queue'::regclass) then
    raise exception 'entity_review_queue has RLS disabled -- security_invoker on the views protects nothing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entity_review_queue' and policyname = 'erq_read'
  ) then
    raise exception 'erq_read policy is missing -- the role gate these views rely on is gone';
  end if;
end $$;
