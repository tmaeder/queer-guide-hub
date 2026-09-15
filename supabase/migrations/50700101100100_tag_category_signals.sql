-- Sentinel for the tag category representations, and for the `is_adult` override
-- cohort the junction backfill deliberately preserved.
--
-- STANDALONE, not a new key on `tag_hygiene_stats()`: that body is a long
-- CREATE OR REPLACE and adding a key to it is a merge-collision surface. The
-- precedent is `tag_merge_graph_signals()`, `tag_disowned_prose_signals()` and
-- `glossary_link_signals()`, all of which are their own functions for the same
-- reason.
--
-- WHY THE EXISTING KEYS DO NOT COVER THIS -- checked, not assumed.
-- `tag_hygiene_stats()` carries two category keys and neither can see the gap
-- that `50700101100000` repaired:
--   * `uncategorized_active`   counts `category_id IS NULL`. That is the
--     representation the PAGE does not render, and it read 10 while 195 pages
--     were showing no category at all.
--   * `denorm_category_missing` checks junction -> TEXT, the opposite direction.
-- Nothing checked `category_id` -> JUNCTION, which is the only direction that
-- blanks the breadcrumb on `/tags/:slug`. Same failure shape as the sentinel
-- that was hardcoded to `slug=eq.search_reindex_drain`: a probe anchored to the
-- wrong representation reports health while the rendered surface is broken.
--
-- `probe_ok` and `active_tags` are reported SEPARATELY from every violation
-- count, because an unapplied function, a revoked grant and a clean corpus
-- otherwise all return the same reassuring zero.
--
-- `insert_trigger_sealed` is the structural half. The backfill is cleanup; the
-- seal is the fix, and if a later migration re-creates either trigger without
-- `INSERT` the gap silently regrows at the rate new tags are minted. A count of
-- zero gap rows the day after such a regression is not evidence of health.
--
-- `is_adult_override` is ADVISORY and non-zero by design (22 rows). It is the
-- population where stored `is_adult` disagrees with what
-- `unified_tags_recompute_is_adult()` would derive from the category alone --
-- i.e. adult vocabulary filed under a non-adult category (`grool` and
-- `helicockter` under Slang & Language, `key-party` under Events & Parties,
-- `story-of-o` under Arts & Literature). Those flags are CORRECT and the
-- derivation rule is what is incomplete; it has no notion of an explicit
-- override, so any future junction write on one of these rows silently
-- re-derives it and un-gates the term. Gating here would ship red on arrival
-- (the cry-wolf shape already removed once from the dedup backlog rule), so it
-- prints WITH the slugs -- a new one is then distinguishable from the 22 known
-- ones instead of being hidden inside a count.

create or replace function public.tag_category_signals()
returns jsonb
language sql
security definer
set search_path to 'public'
stable
as $function$
  with active as (
    select * from unified_tags where status = 'active'
  ),
  prim as (
    select tag_id, category_id from tag_category_assignments where is_primary
  ),
  adult_derived as (
    select a.id, a.slug, a.is_adult,
           exists (
             select 1
               from tag_category_assignments tca
               join tag_categories tc on tc.id = tca.category_id
               left join tag_categories tcp on tcp.id = tc.parent_id
              where tca.tag_id = a.id
                and (tc.name in ('Sex & Kink','Practices & Play','Dynamics & Roles',
                                 'Fetishes','Gear','Kink Community & Scenes')
                     or tcp.name = 'Sex & Kink')
           ) as derived
      from active a
  ),
  overrides as (
    select slug, is_adult from adult_derived where is_adult is distinct from derived
  )
  select jsonb_build_object(
    'probe_ok', true,
    'measured_at', now(),
    -- Denominator first: zero violations on an empty corpus is not a pass.
    'active_tags', (select count(*) from active),

    -- ZERO INVARIANTS. Each blanks or contradicts the category on the rendered
    -- page, which reads only the junction.
    'category_id_without_junction', (
      select count(*) from active a left join prim p on p.tag_id = a.id
       where a.category_id is not null and p.tag_id is null),
    'junction_without_category_id', (
      select count(*) from active a join prim p on p.tag_id = a.id
       where a.category_id is null),
    'junction_disagrees_with_category_id', (
      select count(*) from active a join prim p on p.tag_id = a.id
       where a.category_id is distinct from p.category_id),

    -- STRUCTURAL: both sync triggers must fire on INSERT or the gap regrows.
    -- pg_trigger.tgtype bit 2 (value 4) is INSERT.
    'insert_trigger_sealed', (
      select count(*) = 2 from pg_trigger
       where tgrelid = 'public.unified_tags'::regclass
         and tgname in ('trg_sync_tag_category','trg_sync_tag_category_after')
         and (tgtype & 4) <> 0),

    -- ADVISORY.
    'uncategorized_active_nonfacet', (
      select count(*) from active
       where category_id is null
         and not public.is_marketplace_facet(slug, entity_kind)),
    'is_adult_override', (select count(*) from overrides),
    'is_adult_override_examples', (
      select coalesce(jsonb_agg(slug order by slug), '[]'::jsonb) from overrides)
  );
$function$;

comment on function public.tag_category_signals() is
  'Glossary category representations: category_id vs the is_primary junction (what /tags/:slug renders) vs the denormalised TEXT (what the search facet renders), plus the is_adult override cohort. Standalone rather than a tag_hygiene_stats key to keep that CREATE OR REPLACE out of merge conflicts.';

-- service_role only. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member -- the mistake `review_queue_signals()`
-- records, and the one `_dedup_venue_cluster_side` had to be narrowed for.
revoke all on function public.tag_category_signals() from public;
revoke all on function public.tag_category_signals() from anon;
revoke all on function public.tag_category_signals() from authenticated;
grant execute on function public.tag_category_signals() to service_role;

do $verify$
declare
  v jsonb;
begin
  v := public.tag_category_signals();

  if coalesce((v->>'active_tags')::int, 0) = 0 then
    raise exception 'tag_category_signals reports zero active tags; the probe is measuring nothing';
  end if;

  if (v->>'category_id_without_junction')::int <> 0 then
    raise exception 'category_id_without_junction = % (50700101100000 should have driven this to 0)',
      v->>'category_id_without_junction';
  end if;

  if (v->>'junction_disagrees_with_category_id')::int <> 0 then
    raise exception 'junction_disagrees_with_category_id = %', v->>'junction_disagrees_with_category_id';
  end if;

  if not (v->>'insert_trigger_sealed')::boolean then
    raise exception 'insert_trigger_sealed is false: a sync trigger does not fire on INSERT';
  end if;
end
$verify$;
