-- Reconcile unified_tags.category (the denormalized TEXT mirror) to the
-- junction, and SCHEDULE that reconciliation so the next rename self-heals.
--
-- WHAT BROKE
--
-- 20261006140000 (taxonomy v3, PR B) RENAMED ~24 level-1 categories in place:
-- Subcultures -> Subcultures & Scenes, Fetishes & Interests -> Fetishes,
-- Safe Spaces -> Venue Features & Policies, Sexual Orientation -> Orientation,
-- Gender Identity -> Gender, Venues & Nightlife -> Venue Types,
-- Substances & Harm Reduction -> Substances & Recovery, and more.
--
-- `tag_category_assignments` follows a rename for free — it references the
-- category by id. `unified_tags.category` does not: it stores the NAME as text.
-- So 321 rows were left naming a category that exists under no name, measured on
-- prod 2026-08-29 09:50Z (25 distinct dead values, 3 of them status='active'):
--
--   select count(*), count(distinct category) from unified_tags
--    where category is not null
--      and category not in (select name from tag_categories);   -- 321 / 25
--
-- That count IS `tag_vocabulary_health() -> legacy_category_values`, which is
-- one of the five hard zeros check #8 of scripts/data-quality/e2e-tag-taxonomy.mjs
-- asserts, so the taxonomy e2e has been failing on prod since 09:32:42Z.
--
-- WHY NOTHING WAS GOING TO FIX IT
--
-- All 321 have `category_id IS NULL`, which is what makes them invisible to
-- every fix already in flight:
--   * PR #3100's v2-retire remap matches on `src.id = u.category_id` (NULL) or
--     `src.name = u.category` (names no live category) — neither arm hits. Its
--     text-mirror assertion only fires on the current names of RETIRED slugs, and
--     an OLD name of a KEPT-but-renamed category is not in that set, so #3100
--     passes while leaving the metric at 25.
--   * There is no scheduled reconciler. `run_tag_category_resync(p_batch)` has
--     existed since 20260802105740 and sits in NO cron.job and NO
--     admin_automations row — it is only ever called by hand inside a migration
--     (20260815161044). A rename therefore rots the mirror permanently.
--
-- WHICH SURFACE THIS MOVES, AND WHICH IT PROVABLY CANNOT
--
-- A tag states its filing in three places and DIFFERENT READERS READ DIFFERENT
-- ONES. Verified here by reading both, not inferred:
--
--   * `/tags/:slug` renders the JUNCTION — TagDetail.tsx takes
--     `tag.categories.find(c => c.is_primary)` via fetchTagWithCategories, and
--     contains ZERO reads of the `category` text column.
--   * The SEARCH FACET renders the TEXT — search_documents_index_tags
--     (20260531164347) builds `facets->>'category'` from `t.category`, and also
--     weights it 'B' into search_tsv.
--
-- This migration writes ONLY `category`. It never writes `category_id`, and both
-- sync triggers (sync_tag_category_assignment BEFORE, ..._after AFTER) are
-- guarded `new.category_id is distinct from old.category_id` — so this fires
-- neither, the junction never moves, and NOT ONE /tags/:slug page changes. What
-- it repairs is the facet, which has been publishing 25 category names that
-- match no live facet value, i.e. faceted tag search was broken alongside the
-- health metric.
--
-- That also settles the anchor question rather than reopening it. 20260829072807
-- reasoned that anchoring on `category_id` "rewrites the category a reader sees";
-- the conclusion (do not casually write category_id) holds, but its stated reason
-- was wrong — it is the AFTER trigger moving the JUNCTION that moves the page.
-- Here the question does not arise at all: the text on these 321 rows names
-- nothing, so it is not a competing claim, and the junction is the only surviving
-- authority. Writing text alone brings the facet into agreement with the filing
-- the page already renders.
--
-- MEASURED BLAST RADIUS OF SCHEDULING IT (prod, 2026-08-29)
--
-- run_tag_category_resync() would update 365 rows: 338 deprecated, 12 merged and
-- 15 active. Of the 15 live rows, ZERO currently name a live category — 12 are
-- NULL -> value and 3 are dead-name -> live-name — so no valid facet value is
-- overwritten with a different one. The 12 NULL fills include `doxy-pep` and
-- `naloxone`, which are is_sensitive and so are never auto-categorised by
-- tag-enrichment-sweep; naloxone has been uncategorised since 2026-04-26, and
-- doxy-pep's search_documents row carried no `category` facet key at all.
--
-- The 9 rows with no junction at all (24-hours, bears, community-centers,
-- lgbtq-resources, occ-beach, occ-drag, occ-festival, occ-halloween, occ-party)
-- are all status='merged'. The resync sets their `category` to NULL, because a
-- merge stub redirects and has no filing of its own to mirror. That removes an
-- unbacked claim rather than inventing one, and 52 merged rows already carry no
-- category. It is also not a choice this migration makes — it is what the
-- purpose-built reconciler does with a junction-less row.
--
-- ORDERING / OVERLAP
--
-- Complementary to PR #3105, not competing: that migration writes `category_id`
-- (and `category`) for the 435 rows that have a primary junction; this one
-- writes only `category`, for every row, in either order, converging on the same
-- value. Disjoint from #3100 (whose remap cannot see category_id IS NULL rows),
-- #3103 and #3104.
--
-- The timeout is set at TOP LEVEL, not inside the DO block: the timer is armed
-- when the top-level statement starts, so a function cannot raise its own.

set local statement_timeout = '600s';

do $mig$
declare
  v_n      int;
  v_total  int := 0;
  v_rounds int := 0;
  v_bad    int;
  v_vals   text;
begin
  -- Drain. run_tag_category_resync is batch-capped (default 500) and has no
  -- ORDER BY on its LIMIT, so loop to a fixed point rather than assuming one
  -- pass covers the ~365 rows. The bound is a runaway guard, not a budget.
  loop
    v_rounds := v_rounds + 1;
    select public.run_tag_category_resync(500) into v_n;
    v_total := v_total + coalesce(v_n, 0);
    exit when coalesce(v_n, 0) = 0;
    if v_rounds >= 20 then
      raise exception 'tag category text mirror: resync did not reach a fixed point after % rounds (% rows written) — it is oscillating, not converging', v_rounds, v_total;
    end if;
  end loop;

  raise notice 'tag category text mirror: % row(s) resynced over % round(s)', v_total, v_rounds;

  ------------------------------------------------------------------ assertions
  -- The metric check #8 reads must now be zero. Stated as a count AND a sample,
  -- because "25" alone has never been enough to act on.
  select count(*), coalesce(string_agg(distinct category, ', '), '')
    into v_bad, v_vals
    from public.unified_tags
   where category is not null
     and category not in (select name from public.tag_categories);
  if v_bad > 0 then
    raise exception 'tag category text mirror: % row(s) still name a dead category: %', v_bad, v_vals;
  end if;

  -- And the mirror must now agree with the junction wherever a junction exists.
  -- This is the invariant the cron below exists to hold; assert it once here so
  -- a future rename fails loudly rather than drifting until the next e2e run.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join public.tag_categories c on c.id = a.category_id
   where t.category is distinct from c.name
     and not exists (            -- a second primary would make "the" name ambiguous
       select 1 from public.tag_category_assignments a2
        where a2.tag_id = t.id and a2.is_primary and a2.category_id <> a.category_id);
  if v_bad > 0 then
    raise exception 'tag category text mirror: % row(s) disagree with their sole primary junction after the resync', v_bad;
  end if;
end
$mig$;

-- ── Schedule it, so the NEXT rename does not rot the mirror ──────────────────
-- Registry row + cron in one migration, per the cron-registry contract.
-- action.type='rpc' carries no action.command by design, so branch (d) of
-- sync_automations_to_cron() cannot recreate this job — an rpc automation is
-- scheduled by its own migration, and that is the accepted shape here.
--
-- 03:55 sits after tag_assignment_reconcile (03:45) and after the 02:00 tick of
-- tag-enrichment-sweep (0 */2 * * *), both of which write filings this mirrors.

insert into public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values
  ('tag_category_text_resync', 'Resync tag category text mirror',
   'Rewrites unified_tags.category (denormalized text) from tag_category_assignments. Without it, renaming a category in tag_categories leaves every tag''s text mirror naming a category that no longer exists — taxonomy v3 left 321 such rows on 2026-08-29 and tag_vocabulary_health().legacy_category_values counts exactly those.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_tag_category_resync"}'::jsonb, '55 3 * * *')
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      action = excluded.action,
      schedule = excluded.schedule,
      enabled = true;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'tag_category_text_resync') then
    perform cron.unschedule('tag_category_text_resync');
  end if;
  perform cron.schedule('tag_category_text_resync', '55 3 * * *',
                        'select public.run_tag_category_resync(500);');
end
$cron$;
