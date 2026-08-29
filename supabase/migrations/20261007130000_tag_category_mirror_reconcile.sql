-- The tag category mirror has no writer on the junction-only filing path, and
-- the reconciler that would fix it has lived in no cron for two months.
--
-- `tag_category_assignments` is the source of truth — `fetchTagWithCategories`
-- (src/hooks/usePageFetchers.ts) reads the junction, so that is what /tags/:slug
-- shows. `unified_tags.category_id` and the further-denormalised
-- `unified_tags.category` TEXT are mirrors of it, and the text is what
-- `search_documents` carries, so it is the category FACET in search.
--
-- NOTHING SYNCS THE JUNCTION BACK. Read live rather than assumed:
-- `trg_sync_tag_category` is BEFORE UPDATE on ALL columns, but its body
-- (`sync_tag_category_assignment`) rewrites `new.category` only
-- `if new.category_id is distinct from old.category_id and new.category_id is
-- not null`; `trg_sync_tag_category_after` is AFTER UPDATE OF category_id. Both
-- run unified_tags -> junction, on a category_id CHANGE, never on INSERT and
-- never from the junction side. So the established filing pattern — insert one
-- `tag_category_assignments` row (the 27000 "tuple to be updated was already
-- modified" avoidance every recent tag migration uses) — leaves the text NULL,
-- permanently. That same reading is why the resync below is safe: it writes
-- `category` alone, leaves `category_id` untouched, and so cannot be clobbered
-- by the BEFORE trigger it passes through.
--
-- ── measured on prod 2026-08-29, AFTER 20261006140100 ───────────────────────
--
-- 354 tags corpus-wide publish a category that disagrees with their own
-- junction: 15 active, 338 deprecated, 1 merged. 41 are fills (the text is
-- NULL) and 313 are overwrites. Of the 15 ACTIVE rows, two different defects
-- with two different producers:
--
--   12  text NULL, junction present. `doxy-pep` (filed by 20261004100100),
--       `naloxone` (since 2026-04-11), asexuell, barkeeper, farber,
--       gewaltverbrechen-kriminell, kerle, lavenderscare, meeting, spandau,
--       tin, treffen. Pure fills — nothing to lose.
--
--    3  text carries a STALE CATEGORY NAME, and this is the finding that
--       matters. The taxonomy v3 tree (20261006140000) RENAMED categories in
--       place: slug `events-scene` is now "Events & Parties", slug
--       `physical-digital-safety` is now "Digital & Travel Safety", slug
--       `safe-spaces` is now "Venue Features & Policies". `bingo`,
--       `mordopfer-hassverbrechen` and `snowboard` never moved — their junction
--       row and their `category_id` are correct and unchanged. Only the display
--       name moved, and the denormalised copy of it did not follow.
--
-- A RENAME IS A SECOND PRODUCER, INDEPENDENT OF THE FILING PATH, AND NOTHING
-- THAT ANCHORS ON `category_id` CAN SEE IT. On all three rows category_id is
-- non-null and points at exactly the right category; every by-id consistency
-- test reads clean while the search facet publishes a name that no longer
-- exists in `tag_categories`. That is why the repair has to anchor on the TEXT.
-- (`tag_categories.updated_at` cannot date the event either — the table carries
-- no triggers at all, so all three still read 2026-04-11 after being renamed.)
--
-- THE OVERWRITES ARE RENAME RESIDUE, MEASURED RATHER THAN ARGUED. 312 of the
-- 313 name a category that NO LONGER EXISTS in `tag_categories` — the signature
-- of a rename, not of a move. They fall into ~20 consistent from/to pairs, all
-- of them v3 relabels of the same category: "Safe Spaces" -> "Venue Features &
-- Policies" (43), "Subcultures" -> "Subcultures & Scenes" (40), "Fetishes &
-- Interests" -> "Fetishes" (39), "Venues & Nightlife" -> "Venue Types" (31),
-- "Substances & Harm Reduction" -> "Substances & Recovery" (19), "Sexual
-- Orientation" -> "Orientation", "Gender Identity" -> "Gender", and so on. No
-- tag changes category here; they catch up to what their category is now called.
--
-- The ONE exception is named rather than buried: `meats` (deprecated, a food
-- tag from the 20261004110400 unfile program) moves "Body Types & Archetypes"
-- -> "Kink Community & Scenes", both of which are live categories. It is the
-- only row in the corpus where this job makes a real category change rather
-- than a relabel, it is deprecated, and its junction is the surface /tags/:slug
-- reads — so the mirror is the side that is wrong.
--
-- IT DOES NOT SELF-HEAL. `tag-enrichment-sweep` (cron `0 */2 * * *`) is the
-- documented drain for uncategorised tags, but it AUTO-APPLIES ONLY FOR
-- NON-SENSITIVE ROWS; an `is_sensitive` or `is_adult` tag routes to a pending
-- `ai_suggestions` row at confidence 0.6 and waits for a human
-- (index.ts:210-232). `doxy-pep` is `is_sensitive`, `naloxone` is sitting in
-- exactly that queue. Waiting was never going to work, and for a tag whose
-- filing a reviewed migration already decided, an LLM suggestion at 0.6 is the
-- wrong shape of answer anyway. It reaches none of the three renamed rows at
-- all, which are categorised and merely stale.
--
-- THE REPAIR FUNCTION ALREADY EXISTED AND WAS NEVER SCHEDULED.
-- `run_tag_category_resync()` (20260802105740) does precisely this job and lives
-- in NO `cron.job` and NO `admin_automations` row — verified live, after
-- 20261006140100. It is called by hand inside migrations that remember to
-- (20260815161044) and at no other time. Same shape as the village relink
-- engine: an engine shipped without its schedule. So the fix is not a new
-- mechanism, it is the missing wiring plus two corrections to the function it
-- wires up.
--
-- WHY NOT AN `AFTER INSERT` TRIGGER ON `tag_category_assignments`, which is the
-- obvious answer: that table takes bulk writes from the sweep, the reconcilers
-- and the ingest. A per-row writeback into `unified_tags` reintroduces the exact
-- 27000 cascade the filing pattern exists to dodge, and every row would
-- additionally hit `trg_search_documents_tag`. And a trigger there would still
-- miss the rename class, which never touches the junction. The repo's answer to
-- this shape is a batched reconciler on a cron, and one was already written.
--
-- ── correction 1: the tie-break was an alphabetical coin flip ────────────────
--
-- The live definition ends `order by a.is_primary desc nulls last, tc.level
-- desc, tc.name` — so where the first two keys tie, alphabetical order of a
-- DISPLAY STRING decides the published category, and a category rename can
-- silently repoint a tag. The tail is now `a.created_at asc, a.category_id`: the
-- original filing outranks a later bulk addition, and the final key is a uuid.
-- Measured across all 6,733 tags holding a junction row, the two orderings pick
-- the same winner on every one — this is future-proofing with no corpus effect,
-- which is the point. (Multi-primary rows, which is where a tie-break bites,
-- were cleaned to 0 by 20260829072807 and 20261006110000; the new ordering is
-- total regardless, so nothing here needs to demote anything.)
--
-- ── correction 2: it could null a mirror out ────────────────────────────────
--
-- The live predicate is a bare `u.category is distinct from want`, so a tag
-- whose assignments have all been removed has its text ERASED. Measured: 11
-- rows, every one `status='merged'`, 0 active. Writing a value is a repair;
-- erasing one is a loss, and the two do not belong in the same nightly job. It
-- now writes only when the junction yields a name. The cost is that a mirror can
-- outlive its last assignment; that is a separate decision, deliberately not
-- taken here.
--
-- ── the shared key ──────────────────────────────────────────────────────────
--
-- `tag_category_mirror_want(uuid)` holds the ordering ONCE, so any later reader
-- (a counter, a report, a repair) resolves the same winner the job writes — the
-- `embedding_candidates` lesson, one entity later.
--
-- ── THE SCHEDULE LANDED WHILE THIS WAS IN REVIEW, SO IT IS NOT HERE ─────────
--
-- Three sessions reached the same diagnosis on 2026-08-29 within a few hours,
-- and `20261006180000_tag_category_text_mirror_reconciler` got there first: it
-- is APPLIED on prod, and it registered `tag_category_text_resync` in
-- `admin_automations` and scheduled it at `55 3 * * *` calling
-- `run_tag_category_resync(500)`. Verified live, not assumed —
-- `select jobname, schedule, command from cron.job where jobname ilike
-- '%tag_category%'` returns exactly that one row.
--
-- So the "engine with no cron" half of this is DONE, by someone else, and this
-- migration deliberately does not add a second cron for the same function. What
-- 20261006180000 did NOT do is touch `run_tag_category_resync` itself — it calls
-- the existing body in a loop — so both defects in that body are still live and
-- are now scheduled to run nightly. That is what remains, and it is all this
-- migration does: correct the function the new cron calls.
--
-- The fill-only guard is therefore FORWARD-LOOKING only. The rows it would have
-- protected are already gone: 20261006180000's loop ran the unguarded predicate
-- and erased them, and the cohort measured at 11 this morning reads 0 now. Its
-- own assertions could not see that — they check only rows that HAVE a primary
-- junction — which is exactly why the guard belongs in the function rather than
-- in any one migration's post-conditions.
--
-- ── NO NEW HYGIENE COUNTER HERE, ON PURPOSE ─────────────────────────────────
--
-- 20261006110000 closes by asking that a counter for this class live alongside
-- the ones added with the `category_id` repair, "so the two do not add competing
-- counters for adjacent classes". That repair is
-- `20261007131100_tag_category_id_backfill_from_junction`, and it adds
-- `denorm_category_missing` + `placeholder_description_active` by restating
-- `tag_hygiene_stats()` in full. A second restatement here would silently drop
-- its pair — the panel drift test reads the LAST migration defining the
-- function, and this file sorts before it — so this migration does not touch it.

select set_config('app.actor', 'migration:tag-category-mirror-reconcile', false);

-- ── 1. the shared ordering ──────────────────────────────────────────────────

create or replace function public.tag_category_mirror_want(p_tag_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select tc.name
    from public.tag_category_assignments a
    join public.tag_categories tc on tc.id = a.category_id
   where a.tag_id = p_tag_id
   order by a.is_primary desc nulls last,  -- an explicit primary wins
            tc.level desc,                 -- then the most specific category
            a.created_at asc,              -- then the original filing, not the newest
            a.category_id                  -- then a uuid: stable under a rename
   limit 1
$$;

comment on function public.tag_category_mirror_want(uuid) is
  'The category name unified_tags.category SHOULD mirror for this tag, derived from tag_category_assignments. Single source of the ordering, so a later counter or report cannot resolve a different winner than run_tag_category_resync() writes.';

revoke all on function public.tag_category_mirror_want(uuid) from public, anon;
grant execute on function public.tag_category_mirror_want(uuid) to service_role;

-- ── 2. the reconciler, corrected ────────────────────────────────────────────

create or replace function public.run_tag_category_resync(p_batch integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-category-resync', true);

  with diff as (
    select u.id, w.want
      from public.unified_tags u
      cross join lateral (select public.tag_category_mirror_want(u.id) as want) w
     where w.want is not null            -- never erase a mirror; see the header
       and u.category is distinct from w.want
     limit greatest(p_batch, 0)
  )
  update public.unified_tags u
     set category = d.want
    from diff d
   where u.id = d.id;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

comment on function public.run_tag_category_resync(integer) is
  'Refills unified_tags.category from tag_category_assignments via tag_category_mirror_want(). Nightly on cron tag_category_resync — the junction has no trigger writeback and a category rename updates no mirror, so without this a filed or re-labelled tag publishes a wrong search facet. Fill-only: never nulls a mirror whose assignments were removed.';

revoke all on function public.run_tag_category_resync(integer) from public, anon;
grant execute on function public.run_tag_category_resync(integer) to service_role;

-- ── 3. drain the backlog ────────────────────────────────────────────────────
-- Batch far above the measured 354-row divergence so this converges in one pass.
-- Each write hits trg_search_documents_tag (`category` is in its column list),
-- which since the pipeline overhaul ENQUEUES into search_reindex_queue rather
-- than indexing inline, and search_reindex_drain(1000) runs every minute — so
-- 354 rows is well under one drain cycle and nowhere near a trigger storm.
select public.run_tag_category_resync(5000);

-- ── 4. verify ───────────────────────────────────────────────────────────────
--
-- No cron or `admin_automations` row is created here: `20261006180000` already
-- registered and scheduled `tag_category_text_resync`, and a second job calling
-- the same function is redundancy, not redundancy-as-safety. The assertion below
-- checks that schedule EXISTS rather than creating one, so if that migration is
-- ever reverted this fails loudly instead of leaving the function corrected and
-- nothing calling it.

do $verify$
declare v_n int; v_cat text;
begin
  -- The row this started from, and the rename class it turned out to share with.
  select category into v_cat from public.unified_tags where slug = 'doxy-pep';
  if v_cat is distinct from 'Sexual Health' then
    raise exception 'doxy-pep mirror is %, expected Sexual Health', coalesce(v_cat, 'NULL');
  end if;

  -- Structural, not a frozen slug list: no ACTIVE tag may publish a category
  -- that disagrees with its own junction. Covers both producers at once.
  select count(*) into v_n
    from public.unified_tags t
    cross join lateral (select public.tag_category_mirror_want(t.id) as want) w
   where t.status = 'active' and t.merged_into_id is null
     and w.want is not null
     and t.category is distinct from w.want;
  if v_n <> 0 then
    raise exception '% active tag(s) still publish a category their junction does not assert', v_n;
  end if;

  -- Fill-only: nothing that had a resolvable category was left empty...
  select count(*) into v_n from public.unified_tags
   where category is null and public.tag_category_mirror_want(id) is not null;
  if v_n <> 0 then
    raise exception '% tag(s) still have a NULL mirror with a resolvable category', v_n;
  end if;

  -- THE FILL-ONLY GUARD IS DELIBERATELY NOT ASSERTED HERE. An earlier draft
  -- asserted "at least one unfiled mirror still holds its text", which was true
  -- when it was written and false four hours later: the loop in 20261006180000
  -- had already erased all 11 with the unguarded predicate, invisibly to its own
  -- post-conditions (they check only rows that HAVE a primary junction). A
  -- migration assertion that depends on state another migration may legitimately
  -- have cleared is a landmine in `db push`, and probing it by inserting a throw-
  -- away tag would fire the slug, search and adult-recompute triggers to prove a
  -- one-line predicate. The guard is a property of the FUNCTION TEXT, so it is
  -- gated where that can be read directly and for free:
  -- `src/lib/__tests__/tagCategoryMirror.test.ts` fails if `want is not null`
  -- leaves the definition.

  -- The schedule this function is called by. Created by 20261006180000, asserted
  -- (never created) here, so a revert of that migration surfaces as a failure
  -- rather than as a corrected function nothing ever calls.
  if not exists (select 1 from cron.job
                  where jobname = 'tag_category_text_resync' and active) then
    raise exception 'cron job tag_category_text_resync is missing or inactive — 20261006180000 must apply first';
  end if;
  if not exists (select 1 from public.admin_automations
                  where slug = 'tag_category_text_resync' and enabled) then
    raise exception 'admin_automations row tag_category_text_resync is missing or disabled';
  end if;
end
$verify$;
