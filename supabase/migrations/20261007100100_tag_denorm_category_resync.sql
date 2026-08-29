-- Resync the 435 tags whose category exists in the junction but never reached
-- the denormalised column, and add the two counters that stop both this and the
-- placeholder-description class from regrowing unseen.
--
-- RENUMBERED FROM 20261005100100. This file was authored as 20261005100100 and
-- carried that version while it sat unmerged on a branch. Between authoring and
-- merge, main applied migrations up to 20261006140100, and `supabase db push`
-- aborts on an unapplied file that sorts BELOW the applied head — so the
-- original version could never have run. `20261006110000` on main cites this
-- migration by its OLD number in three comments; those references are stale by
-- name only, the delegation they describe is unchanged and is honoured here.
-- Same rename applied to its sibling 20261007100000.
--
-- WHAT WAS MEASURED, ON PROD, BEFORE WRITING THIS
--
-- `tag_category_assignments` is the source of truth for a tag's category —
-- `fetchTagWithCategories` (src/hooks/usePageFetchers.ts) reads the junction, so
-- that is what /tags/:slug shows. `unified_tags.category_id` and the further
-- denormalised `unified_tags.category` are derived from it by
-- sync_tag_category() / its AFTER counterpart.
--
-- Corpus-wide on 2026-08-29:
--     435 tags   category_id IS NULL while a junction row EXISTS
--       0 tags   category_id present but NOT among the junction rows
--       0 tags   category_id present with no junction row at all
--
-- So the drift is one-directional. This is NOT the "which side wins" problem
-- 12af05ccb settled — there is nothing here that disagrees, only a derived
-- column that was never written. Every one of the 435 has exactly ONE junction
-- assignment (checked: 0 multi-assignment rows in the set), so the resync has no
-- tiebreak to get wrong.
--
-- Split by status: 418 deprecated, 16 active, 1 merged. The active 16 include
-- `doxy-pep` and `naloxone`, both shipped in the last few weeks with a correct
-- junction row and a null denorm — which is how a brand-new tag lands in this
-- state, and why the counter below matters more than the one-shot repair.
--
-- Writing category_id is enough: the BEFORE trigger derives the further
-- denormalised `category` text from it. Verified in a rolled-back transaction —
-- after the loop, rows with a junction and a null `category` text fall to 47,
-- and all 47 are `status='merged'` (0 active, 0 indexable). A merged tag is a
-- redirect stub that is no longer filed anywhere, so its null category text is
-- correct, not drift. The counter below therefore keys on category_id, which
-- goes to zero, rather than on the text column, which would read 47 forever and
-- teach everyone to ignore it.
--
-- WHY PER-ROW AND NOT ONE SET-BASED UPDATE
--
-- `sync_tag_category` (BEFORE) and `sync_tag_category_after` (AFTER) were split
-- in 20260919100000 to fix a 27000 "tuple already modified" that made EVERY
-- category write fail. A set-based statement that touches one unified_tags tuple
-- twice re-enters that pair. Per-row keeps each write in its own statement and
-- keeps the counter honest.
--
-- SEARCH COST, MEASURED RATHER THAN ASSUMED
--
-- `category` IS in trg_search_documents_tag's column scope, so all 435 rows
-- enqueue a reindex. Since the P1 pipeline overhaul that is an append into
-- search_reindex_queue drained by search_reindex_drain(1000) every minute, not
-- an inline index pass — 435 rows is well under one drain cycle and far below
-- the batch caps used by the nightly jobs.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:tag_denorm_category_resync', true);

do $mig$
declare
  r record;
  v_fixed int := 0;
begin
  for r in
    select t.id, t.slug, a.category_id
      from public.unified_tags t
      join public.tag_category_assignments a on a.tag_id = t.id
     where t.category_id is null
     order by t.slug
  loop
    update public.unified_tags
       set category_id = r.category_id,
           updated_at  = now()
     where id = r.id
       and category_id is null;   -- re-entrant: a row fixed by a concurrent
                                  -- writer is skipped, not overwritten
    if found then v_fixed := v_fixed + 1; end if;
  end loop;
  raise notice 'denorm category_id written for % tag(s)', v_fixed;
end $mig$;

-- ---------------------------------------------------------------------------
-- Two new counters.
--
-- 1. `denorm_category_missing` — the class this migration just cleared. Without
--    it, the next tag shipped with a junction row and a null denorm is invisible
--    again, which is exactly how doxy-pep and naloxone got here.
--
-- 2. `placeholder_description_active` — a class NO existing counter can see.
--    `indexable_without_description` reads 0 on prod while 137 active tags
--    publish a bulk-import stamp as their definition: "Sexual activity tag"
--    (63 rows), "Toys tag" (83), "Philia tag" (24), "Scene safety tag" (12).
--    /tags/anal-sex, /tags/rimming, /tags/fisting, /tags/bareback and
--    /tags/sexting all serve one of those four strings as their lead paragraph,
--    and all are seo_indexable. run_tag_thin_page_reindex() cannot deindex them
--    either: it fires only when description AND short_description are both
--    empty, and a placeholder satisfies neither test. A stamp is worse than a
--    blank — a blank is measurable, a stamp reads as content.
--
--    The stamp set is DETECTED, not listed: any description of 40 characters or
--    less shared by more than five tags is a category stamp, not a definition.
--    Measured cost 40 ms, and a fifth string appearing later is caught without
--    editing this function. Hardcoding the four would have to be right forever;
--    this only has to be right about the shape.
-- ---------------------------------------------------------------------------
create or replace function public.tag_hygiene_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  perform assert_admin_or_internal();

  with active as (
    select * from unified_tags where status = 'active' and merged_into_id is null
  ),
  -- A short description shared by many tags is a bulk-import stamp, not a
  -- definition. See the header of 20261007100100.
  stamps as (
    select btrim(description) as d
      from unified_tags
     where description is not null
       and length(btrim(description)) between 1 and 40
     group by 1
    having count(*) > 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'active_tags', (select count(*) from active),
      'categories',  (select count(*) from tag_categories),
      'assignments', (select count(*) from unified_tag_assignments)
    ),
    'uncategorized_active', (
      select count(*) from active where category_id is null
        and slug !~ '^(mat|vibe|occ|dept|attr|own|rating)-'),
    'dangling_category_id', (
      select count(*) from unified_tags u where u.category_id is not null
        and not exists (select 1 from tag_categories c where c.id = u.category_id)),
    -- The junction is the source of truth; this counts rows where it says one
    -- thing and the denormalised column says nothing. Zero after 20261007100100.
    'denorm_category_missing', (
      select count(*) from unified_tags u
       where u.category_id is null
         and exists (select 1 from tag_category_assignments a where a.tag_id = u.id)),
    -- A bulk-import stamp published as a definition. Invisible to
    -- indexable_without_description, which only sees an EMPTY description.
    'placeholder_description_active', (
      select count(*) from active a
       where btrim(a.description) in (select d from stamps)),
    -- Zero-invariant since the 2026-08-28 photo retirement: tags render drawn
    -- TagPlates, and every image writer was removed. Non-zero means one is back.
    'active_tags_with_image_url', (
      select count(*) from active where image_url is not null),
    'assignment_to_non_active_tag', (
      select count(*) from unified_tag_assignments a
       where not exists (select 1 from active t where t.id = a.tag_id)),
    'nonclean_entity_type', (
      select count(*) from unified_tag_assignments
       where entity_type <> lower(btrim(entity_type))),
    'duplicate_active_name', (
      select count(*) from (
        select 1 from active group by lower(btrim(name)) having count(*) > 1) d),
    'redirect_to_non_canonical', (
      select count(*) from tag_slug_redirects r
        join unified_tags t on t.id = r.tag_id
       where t.status <> 'active' or t.merged_into_id is not null),
    'merged_but_not_status_merged', (
      select count(*) from unified_tags
       where merged_into_id is not null and status <> 'merged'),
    'sensitive_without_description', (
      select count(*) from active
       where (is_sensitive or is_adult)
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    'indexable_without_description', (
      select count(*) from active
       where seo_indexable
         and coalesce(nullif(btrim(description), ''), short_description) is null),
    -- `not (A or B)` split into `not A and not B` so each arm can use its own
    -- functional index. Re-merging them into one OR silently restores the
    -- 4M-row nested loop that put this function over the PostgREST timeout.
    'event_tag_strings_unresolved', (
      select count(*) from (
        select distinct lower(btrim(t)) as s
          from events, unnest(coalesce(tags, '{}'::text[])) t
         where btrim(t) <> ''
      ) e
      where not exists (select 1 from unified_tags u where lower(u.name) = e.s)
        and not exists (select 1 from unified_tags u where lower(u.slug) = e.s)),
    -- Drains to 0 as the cron works through the backlog. Non-zero after that
    -- means the job stopped running.
    'events_with_tags_unlinked', (
      select count(*) from events e
       where coalesce(array_length(e.tags, 1), 0) > 0
         and not exists (
           select 1 from unified_tag_assignments a
            where a.entity_id = e.id and a.entity_type = 'event'))
  ) into v;

  return v;
end;
$function$;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.unified_tags u
  where u.category_id is null
    and exists (select 1 from public.tag_category_assignments a where a.tag_id = u.id);
  if v_bad > 0 then
    raise exception 'denorm resync: % tag(s) still have a junction row and no category_id', v_bad;
  end if;

  -- The resync must not have INVENTED a category: every category_id written has
  -- to be one the junction already asserted for that tag.
  select count(*) into v_bad
  from public.unified_tags u
  where u.category_id is not null
    and exists (select 1 from public.tag_category_assignments a where a.tag_id = u.id)
    and not exists (
      select 1 from public.tag_category_assignments a
       where a.tag_id = u.id and a.category_id = u.category_id);
  if v_bad > 0 then
    raise exception 'denorm resync: % tag(s) carry a category_id the junction does not assert', v_bad;
  end if;

  -- Both new counters are actually reachable through the function, so the panel
  -- and baseline cannot be pinned to a key that does not exist.
  if not (public.tag_hygiene_stats() ? 'denorm_category_missing') then
    raise exception 'denorm resync: tag_hygiene_stats() lost denorm_category_missing';
  end if;
  if not (public.tag_hygiene_stats() ? 'placeholder_description_active') then
    raise exception 'denorm resync: tag_hygiene_stats() lost placeholder_description_active';
  end if;
end $verify$;
