-- SECURITY: four ontology views were SECURITY DEFINER, so they read their base
-- tables as postgres and bypassed those tables' RLS for anon/authenticated.
--
-- Supabase linter 0010 (security_definer_view) reported FIVE views on 2026-09-15:
-- tag_broader, tag_narrower, tag_facets, v_silo_concept_crosswalk and
-- glossary_link_terms_public. PR #2127 cleared all 27 findings of this class on
-- 2026-07-14, so these are a REGRESSION, and the mechanism is already recorded:
-- `CREATE OR REPLACE VIEW` resets `reloptions` to NULL, silently discarding a
-- prior `ALTER VIEW ... SET (security_invoker = true)`. A routine edit to a view
-- body is enough.
--
-- MEASURED EXPOSURE, because "bypasses RLS" is not the same as "leaks something".
-- `unified_tags` carries an anon gate -- `tag_is_anon_gated(is_sensitive,
-- verification_status)`, 616 rows -- and `tag_relations` grants anon nothing at
-- all. Against that, on 2026-09-15:
--
--     tag_broader   rows naming an anon-gated tag    1
--     tag_facets    rows naming an anon-gated tag   10
--     glossary_link_terms_public                     0   (its own filter excludes them)
--
-- So the live leak is 11 rows of uuid-level edge/facet metadata. The names and
-- prose behind those uuids stay gated, because resolving one goes back through
-- `unified_tags`. Small -- and it is still an RLS bypass on a table whose only
-- policy is admin-gated, which is the shape that let anon DELETE from
-- `tag_relations` in 20260806180000.
--
-- FLIPPING THE FLAG IS SAFE HERE, AND THAT WAS VERIFIED RATHER THAN ASSUMED.
-- Nothing in the application reads these four: `grep` over `src/`, `functions/`,
-- `workers/` and `supabase/functions/` returns only generated
-- `src/integrations/supabase/types.ts` entries. The only readers are four
-- database functions -- tag_coverage_radar, tag_ontology_health,
-- fold_silo_terms, silo_concept_coverage -- and ALL FOUR ARE SECURITY DEFINER,
-- so they resolve the view as their owner and are unaffected by what the view
-- grants the API roles. Dry-run on prod in a rolled-back transaction, counts
-- before -> after the flip:
--
--     tag_coverage_radar()      200 -> 200
--     tag_ontology_health()       1 -> 1
--     silo_concept_coverage()     7 -> 7
--     tag_facets               2755 -> 2755
--     tag_broader               833 -> 833
--     v_silo_concept_crosswalk  137 -> 137
--
-- WHAT THIS DOES NOT FIX, STATED RATHER THAN IMPLIED. `tag_facets` reads
-- `unified_tag_assignments`, whose anon policy is `true`, so with the flag on,
-- anon still sees all 2,755 rows including the 10 that name a gated concept.
-- That is not a bypass -- it is what that table's own policy already allows --
-- and narrowing it is a vocabulary decision, not a grant fix.
--
-- glossary_link_terms_public IS DELIBERATELY LEFT DEFINER. Its base
-- `glossary_link_terms` is admin-only (`is_admin(auth.uid())`) and the view
-- exists precisely to publish a 153-of-213 subset to anon; giving it
-- security_invoker would return zero rows and 401 the public glossary
-- vocabulary, which is the failure 20260912075359's own positive control
-- watches for. Its write grants were revoked there and it leaks 0 gated tags.
--
-- Registering the four in `security_invoker_required_views` is the load-bearing
-- half: `scripts/check-definer-view-grants.mjs` check 1 (no write grants on a
-- definer view) is blind to a stripped flag once the writes are already gone,
-- and check 2 only watches views listed in that table. Unregistered, the next
-- CREATE OR REPLACE puts this back with nothing reporting.

alter view public.tag_broader              set (security_invoker = true);
alter view public.tag_narrower             set (security_invoker = true);
alter view public.tag_facets               set (security_invoker = true);
alter view public.v_silo_concept_crosswalk set (security_invoker = true);

insert into public.security_invoker_required_views (view_name, reason)
values
  ('tag_broader',              'Tag ontology over tag_relations, which grants anon nothing. 73000101100000'),
  ('tag_narrower',             'Tag ontology over tag_relations, which grants anon nothing. 73000101100000'),
  ('tag_facets',               'Tag facets over unified_tag_assignments. 73000101100000'),
  ('v_silo_concept_crosswalk', 'Vocabulary crosswalk over unified_tags and seven vocab tables. 73000101100000')
on conflict (view_name) do update set reason = excluded.reason;

-- ---------------------------------------------------------------------------
-- POSTCONDITIONS -- assert the reached state, not the number of edits. A count
-- of changed rows reads zero both when the work is already done and when it
-- never ran.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_missing text;
  v_unregistered text;
  n int;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'v'
     and c.relname in ('tag_broader','tag_narrower','tag_facets','v_silo_concept_crosswalk')
     and not coalesce(array_to_string(c.reloptions, ',') like '%security_invoker=true%', false);
  if v_missing is not null then
    raise exception 'security_invoker not set on: %', v_missing;
  end if;

  select string_agg(v, ', ' order by v) into v_unregistered
    from unnest(array['tag_broader','tag_narrower','tag_facets','v_silo_concept_crosswalk']) v
   where not exists (select 1 from public.security_invoker_required_views r where r.view_name = v);
  if v_unregistered is not null then
    raise exception 'not registered in security_invoker_required_views: % -- the gate cannot watch them', v_unregistered;
  end if;

  -- Positive control: "no findings" is also true of a view that no longer
  -- exists, and of consumers that have stopped returning anything. Every
  -- SECURITY DEFINER consumer must still answer.
  select count(*) into n from public.tag_coverage_radar();
  if n = 0 then raise exception 'tag_coverage_radar() returned nothing after the flip'; end if;
  select count(*) into n from public.silo_concept_coverage();
  if n = 0 then raise exception 'silo_concept_coverage() returned nothing after the flip'; end if;
  select count(*) into n from public.tag_facets;
  if n = 0 then raise exception 'tag_facets is empty after the flip'; end if;

  -- The deliberate exception stays deliberate: glossary_link_terms_public must
  -- NOT be swept into this, or the public glossary vocabulary returns nothing.
  if exists (
    select 1 from public.security_invoker_required_views
     where view_name = 'glossary_link_terms_public'
  ) then
    raise exception 'glossary_link_terms_public was registered -- it must stay SECURITY DEFINER; its base table is admin-only';
  end if;

  raise notice 'security_invoker set and registered on 4 tag/vocabulary views; glossary_link_terms_public deliberately unchanged';
end
$verify$;
